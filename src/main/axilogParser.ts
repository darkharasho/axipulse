// src/main/axilogParser.ts
//
// The app's parse path. Replaces the Elite Insights CLI subprocess: axilog
// is an in-process napi binding, so there is no install step, no .NET
// runtime, and no JSON file to read back off disk.
//
// Three layers, deliberately separated so the middle one is testable:
//   - `parseInProcess` calls the napi binding directly. Synchronous work in
//     an async wrapper. Used by tests, which have no Electron around them.
//   - `createParseDispatcher` owns the request/reply protocol -- ids,
//     the pending map, timeouts, worker death. It talks to a `ParseChannel`,
//     not to Electron, so the protocol can be exercised for real without a
//     live utilityProcess.
//   - `parseLog` is the production wiring: that dispatcher over a channel
//     backed by an Electron `utilityProcess`, so the synchronous parse
//     cannot freeze the window.
import path from 'node:path';
import { parseFile } from '@axiapps/axilog';
import type { ReportV1 } from '@axiapps/axilog/types';

/** The exact options this app parses with. `tests/shared/oracle.ts` imports
 *  this rather than duplicating the literal, so the oracles' right-hand side
 *  can never drift from production. */
export const PARSE_OPTS = {
    replay: true,
    skillDamage: true,
    timeseries: true,
    rotation: true,
} as const;

/**
 * How long a single parse may take before its promise is rejected.
 *
 * The 22 MB test fixture parses in ~0.3 s, so this is roughly 400x the only
 * duration I have measured. It is deliberately far higher than any parse I
 * expect: the cost of being wrong upward is a UI that takes two minutes to
 * report a failure, and the cost of being wrong downward is rejecting a
 * parse that would have succeeded. Its real job is bounding the *hang* --
 * a worker that spawns and then never answers used to leave the promise
 * pending forever and the renderer stuck in `isParsing` with no way out.
 */
export const PARSE_TIMEOUT_MS = 120_000;

/**
 * The worker's filename, shared between the fork target and the test that
 * checks the source module still exists under this name. `tsc -p
 * electron/tsconfig.json` emits `src/main/X.ts` to `dist-electron/main/X.js`,
 * so the worker is always a sibling of this module's own emitted file.
 */
export const WORKER_ENTRY_BASENAME = 'axilogWorker.js';

export interface WorkerRequest {
    id: number;
    path: string;
}

export type WorkerResponse =
    | { id: number; ok: true; report: ReportV1 }
    | { id: number; ok: false; error: string };

/**
 * The slice of an Electron `UtilityProcess` the protocol actually uses.
 *
 * Narrow on purpose: a test can implement all three members over an
 * in-memory queue and drive the real dispatcher, rather than asserting
 * against a mock of the dispatcher itself.
 */
export interface ParseChannel {
    postMessage(request: WorkerRequest): void;
    onMessage(handler: (response: WorkerResponse) => void): void;
    onExit(handler: (code: number) => void): void;
}

export interface ParseDispatcherOptions {
    /** Per-request budget. */
    timeoutMs: number;
    /**
     * Where protocol violations go. A reply to an id this process never
     * issued (or issued and already settled) cannot fail any particular
     * caller, so it is reported here instead of thrown: throwing inside the
     * channel's message listener would take down the whole main process
     * over one stray message.
     */
    reportProtocolError: (err: Error) => void;
}

export interface ParseDispatcher {
    parse(logPath: string): Promise<ReportV1>;
}

interface PendingParse {
    logPath: string;
    settle: (outcome: { ok: true; report: ReportV1 } | { ok: false; error: Error }) => void;
}

function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Parse a log on the calling thread.
 *
 * axilog's own failure message names neither the file nor the caller -- a
 * missing path yields the bare `No such file or directory (os error 2)` --
 * so it is wrapped rather than rethrown. The wrapper is the anchor the test
 * asserts on.
 */
export async function parseInProcess(logPath: string): Promise<ReportV1> {
    try {
        return parseFile(logPath, PARSE_OPTS);
    } catch (err) {
        throw new Error(
            `parseInProcess: axilog failed to parse ${logPath}: ${messageOf(err)}`,
        );
    }
}

/**
 * The request/reply protocol, independent of how the worker is spawned.
 *
 * The channel is opened on first use and reused. Requests are matched to
 * replies by an incrementing id, so overlapping parses cannot cross wires;
 * every outstanding request carries a timer and is rejected by name if the
 * worker dies or goes quiet.
 */
export function createParseDispatcher(
    openChannel: () => ParseChannel,
    options: ParseDispatcherOptions,
): ParseDispatcher {
    let channel: ParseChannel | null = null;
    let nextRequestId = 1;
    const pending = new Map<number, PendingParse>();
    const timers = new Map<number, ReturnType<typeof setTimeout>>();

    function settle(
        id: number,
        outcome: { ok: true; report: ReportV1 } | { ok: false; error: Error },
    ): void {
        const entry = pending.get(id);
        if (entry === undefined) return;
        pending.delete(id);
        const timer = timers.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            timers.delete(id);
        }
        entry.settle(outcome);
    }

    function onResponse(response: WorkerResponse): void {
        const entry = pending.get(response.id);
        if (entry === undefined) {
            options.reportProtocolError(new Error(
                `parseLog: axilog worker replied to unknown request id ${response.id}`
                + ` (${pending.size} request(s) outstanding)`,
            ));
            return;
        }
        if (response.ok) {
            settle(response.id, { ok: true, report: response.report });
        } else {
            settle(response.id, {
                ok: false,
                error: new Error(
                    `parseLog: axilog failed to parse ${entry.logPath}: ${response.error}`,
                ),
            });
        }
    }

    function onExit(code: number): void {
        channel = null;
        for (const id of [...pending.keys()]) {
            const entry = pending.get(id);
            if (entry === undefined) continue;
            settle(id, {
                ok: false,
                error: new Error(
                    `parseLog: axilog worker exited with code ${code} before replying`
                    + ` (parsing ${entry.logPath})`,
                ),
            });
        }
    }

    function ensureChannel(): ParseChannel {
        if (channel) return channel;
        const opened = openChannel();
        opened.onMessage(onResponse);
        opened.onExit(onExit);
        channel = opened;
        return opened;
    }

    return {
        parse(logPath: string): Promise<ReportV1> {
            return new Promise<ReportV1>((resolve, reject) => {
                const active = ensureChannel();
                const id = nextRequestId++;
                pending.set(id, {
                    logPath,
                    settle: (outcome) => {
                        if (outcome.ok) resolve(outcome.report);
                        else reject(outcome.error);
                    },
                });
                timers.set(id, setTimeout(() => {
                    settle(id, {
                        ok: false,
                        error: new Error(
                            `parseLog: axilog worker did not reply within`
                            + ` ${options.timeoutMs}ms (parsing ${logPath})`,
                        ),
                    });
                }, options.timeoutMs));
                const request: WorkerRequest = { id, path: logPath };
                active.postMessage(request);
            });
        },
    };
}

/** The compiled worker entry, a sibling of this module's own emitted file. */
export function workerEntryPoint(): string {
    return path.join(__dirname, WORKER_ENTRY_BASENAME);
}

function openUtilityProcessChannel(): ParseChannel {
    // Required lazily: importing `electron` at module scope would make this
    // file unloadable outside Electron, and `parseInProcess` plus the
    // dispatcher tests exist precisely so it can be loaded there.
    const { utilityProcess } = require('electron') as typeof import('electron');
    const spawned = utilityProcess.fork(workerEntryPoint(), [], {
        serviceName: 'axilog-parser',
    });
    return {
        postMessage: (request) => spawned.postMessage(request),
        onMessage: (handler) => { spawned.on('message', handler); },
        onExit: (handler) => { spawned.on('exit', handler); },
    };
}

const productionDispatcher = createParseDispatcher(openUtilityProcessChannel, {
    timeoutMs: PARSE_TIMEOUT_MS,
    // eslint-disable-next-line no-console -- the main process has no window
    // to surface this in, and it must not be swallowed.
    reportProtocolError: (err) => console.error(err.message),
});

/**
 * Parse a log off the main thread. Resolves with the native report, or
 * rejects with a message naming the log and the underlying failure.
 */
export function parseLog(logPath: string): Promise<ReportV1> {
    return productionDispatcher.parse(logPath);
}
