// src/main/axilogParser.ts
//
// The app's parse path. Replaces the Elite Insights CLI subprocess: axilog
// is an in-process napi binding, so there is no install step, no .NET
// runtime, and no JSON file to read back off disk.
//
// Two entry points, deliberately:
//   - `parseInProcess` calls the napi binding directly. Synchronous work in
//     an async wrapper. Used by tests, which have no Electron around them.
//   - `parseLog` is the production path: it hands the work to a
//     `utilityProcess` so the synchronous parse cannot freeze the window.
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

export interface WorkerRequest {
    id: number;
    path: string;
}

export type WorkerResponse =
    | { id: number; ok: true; report: ReportV1 }
    | { id: number; ok: false; error: string };

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

interface Pending {
    logPath: string;
    resolve: (report: ReportV1) => void;
    reject: (err: Error) => void;
}

let worker: Electron.UtilityProcess | null = null;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

/**
 * The compiled worker entry. `tsc -p electron/tsconfig.json` emits
 * `src/main/*.ts` to `dist-electron/main/*.js`, so the worker is always a
 * sibling of this module's own emitted file, packaged and unpackaged alike.
 */
function workerEntryPoint(): string {
    return path.join(__dirname, 'axilogWorker.js');
}

function rejectAllOutstanding(reason: string): void {
    const outstanding = [...pending.values()];
    pending.clear();
    for (const p of outstanding) {
        p.reject(new Error(`parseLog: ${reason} (parsing ${p.logPath})`));
    }
}

function ensureWorker(): Electron.UtilityProcess {
    if (worker) return worker;

    // Required lazily: importing `electron` at module scope would make this
    // file unloadable outside Electron, and `parseInProcess` exists precisely
    // so tests can use it there.
    const { utilityProcess } = require('electron') as typeof import('electron');
    const spawned = utilityProcess.fork(workerEntryPoint(), [], {
        serviceName: 'axilog-parser',
    });

    spawned.on('message', (message: WorkerResponse) => {
        const entry = pending.get(message.id);
        if (!entry) {
            // Not recoverable and not ignorable: the worker answered a
            // request this process never made, or answered one twice.
            throw new Error(
                `parseLog: axilog worker replied to unknown request id ${message.id}`,
            );
        }
        pending.delete(message.id);
        if (message.ok) {
            entry.resolve(message.report);
        } else {
            entry.reject(new Error(
                `parseLog: axilog failed to parse ${entry.logPath}: ${message.error}`,
            ));
        }
    });

    spawned.on('exit', (code: number) => {
        worker = null;
        rejectAllOutstanding(`axilog worker exited with code ${code} before replying`);
    });

    worker = spawned;
    return spawned;
}

/**
 * Parse a log off the main thread. Resolves with the native report, or
 * rejects with a message naming the log and the underlying failure.
 *
 * The worker is spawned on first use and reused; requests are matched to
 * replies by an incrementing id, so overlapping parses cannot cross wires.
 */
export function parseLog(logPath: string): Promise<ReportV1> {
    const proc = ensureWorker();
    const id = nextRequestId++;
    return new Promise<ReportV1>((resolve, reject) => {
        pending.set(id, { logPath, resolve, reject });
        const request: WorkerRequest = { id, path: logPath };
        proc.postMessage(request);
    });
}
