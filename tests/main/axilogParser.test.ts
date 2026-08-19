import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    createParseDispatcher,
    parseInProcess,
    PARSE_TIMEOUT_MS,
    PRODUCTION_DISPATCHER_OPTIONS,
    workerEntryPoint,
    WORKER_ENTRY_BASENAME,
    type ParseChannel,
    type WorkerRequest,
    type WorkerResponse,
} from '../../src/main/axilogParser';
import { handleParseRequest } from '../../src/main/axilogWorker';

describe('parseInProcess', () => {
    it('parses the fixture to a native report', async () => {
        const r = await parseInProcess(join(__dirname, '..', 'fixtures', 'wvw.zevtc'));
        expect(r.axilog).toBeDefined();
        expect(r.entities.length).toBeGreaterThan(0);
        expect(r.coverage.series).toBe('present');

        // The three assertions above would pass on a report parsed from ANY
        // log, which is exactly the failure a parse path wired to the wrong
        // input produces. These identify THIS log: axilog stamps the source
        // filename into the document, and the roster is frozen.
        expect(r.axilog.generated_from).toBe('wvw.zevtc');
        expect(r.entities.length).toBe(129);
        const accounts = r.entities.map(e => e.account).filter(a => a !== undefined);
        expect(accounts.length).toBe(47);
        expect(accounts).toContain('Anon151.6587');
    });

    it('rejects with a message naming the parser and the path', async () => {
        // Anchored on `parseInProcess:` and the path. axilog's own message is
        // "No such file or directory (os error 2)" -- it names neither the
        // file nor the caller, so a bare `rejects.toThrow()` here would pass
        // on any rejection from anywhere in the module.
        await expect(parseInProcess('/nonexistent.zevtc')).rejects.toThrow(
            /parseInProcess: axilog failed to parse \/nonexistent\.zevtc/,
        );
    });
});

// ---------------------------------------------------------------------------
// The production protocol.
//
// `parseLog` cannot be called here -- it forks an Electron utilityProcess and
// vitest runs in plain Node. So the dispatcher underneath it is driven over a
// fake CHANNEL: the transport is a stand-in, but the request ids, the pending
// map, the timeout, the death handling and the parse itself are all the real
// production code. The fake answers each request by calling the real worker
// handler with the request it actually received, so a dispatcher that sent a
// different id than it recorded would be caught rather than papered over.
// ---------------------------------------------------------------------------

interface FakeChannel {
    readonly sent: WorkerRequest[];
    killed: boolean;
    /** Answer a request exactly as the real worker would. */
    answer(request: WorkerRequest): void;
    /** Push an arbitrary reply, for protocol-violation cases. */
    deliver(response: WorkerResponse): void;
    exit(code: number): void;
}

/**
 * A stand-in for the transport ONLY.
 *
 * Every channel it hands out is tracked separately, because the dispatcher
 * is allowed to discard one and open another, and a test that shared a
 * single pair of handlers across "both" channels could not tell a fresh
 * worker from the old one. `kill()` fires that channel's exit handler, which
 * is what a real utilityProcess does and is how the late-exit guard gets
 * exercised rather than assumed.
 */
function fakeWorker(behaviour: { killThrows?: Error } = {}) {
    const channels: FakeChannel[] = [];
    const sent: WorkerRequest[] = [];
    const owner = new Map<WorkerRequest, FakeChannel>();

    const openChannel = (): ParseChannel => {
        let onMessage: ((r: WorkerResponse) => void) | null = null;
        let onExit: ((code: number) => void) | null = null;
        const mine: WorkerRequest[] = [];

        const deliver = (response: WorkerResponse) => {
            if (onMessage === null) throw new Error('fakeWorker: no message handler bound');
            onMessage(response);
        };
        const exit = (code: number) => {
            if (onExit === null) throw new Error('fakeWorker: no exit handler bound');
            onExit(code);
        };

        const record: FakeChannel = {
            sent: mine,
            killed: false,
            answer: (request) => { deliver(handleParseRequest(request)); },
            deliver,
            exit,
        };
        channels.push(record);

        return {
            postMessage: (request) => {
                mine.push(request);
                sent.push(request);
                owner.set(request, record);
            },
            onMessage: (handler) => { onMessage = handler; },
            onExit: (handler) => { onExit = handler; },
            kill: () => {
                record.killed = true;
                if (behaviour.killThrows !== undefined) throw behaviour.killThrows;
                // A real utilityProcess reports its own death.
                exit(143);
            },
        };
    };

    const current = (): FakeChannel => {
        const last = channels[channels.length - 1];
        if (last === undefined) throw new Error('fakeWorker: no channel opened yet');
        return last;
    };

    return {
        openChannel,
        channels,
        sent,
        get opened() { return channels.length; },
        get killed() { return channels.filter(c => c.killed).length; },
        /** Answer on whichever channel actually received this request. */
        answer(request: WorkerRequest) {
            const channel = owner.get(request);
            if (channel === undefined) throw new Error('fakeWorker: request was never sent');
            channel.answer(request);
        },
        deliver(response: WorkerResponse) { current().deliver(response); },
        exit(code: number) { current().exit(code); },
    };
}

function protocolErrorSink() {
    const errors: Error[] = [];
    return { errors, report: (err: Error) => { errors.push(err); } };
}

const FIXTURE = join(__dirname, '..', 'fixtures', 'wvw.zevtc');

describe('createParseDispatcher', () => {
    it('round-trips a parse through the channel and resolves with the report', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        const promise = dispatcher.parse(FIXTURE);
        expect(worker.sent.length).toBe(1);
        expect(worker.sent[0].path).toBe(FIXTURE);
        worker.answer(worker.sent[0]);

        const report = await promise;
        expect(report.axilog.generated_from).toBe('wvw.zevtc');
        // An id the dispatcher sent but did not record would come back
        // unmatched, and land here instead of resolving the promise.
        expect(sink.errors).toEqual([]);
    });

    it('matches replies by id, not by arrival order', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        const good = dispatcher.parse(FIXTURE);
        const bad = dispatcher.parse('/nonexistent.zevtc');
        expect(worker.sent.map(r => r.path)).toEqual([FIXTURE, '/nonexistent.zevtc']);
        expect(worker.sent[0].id).not.toBe(worker.sent[1].id);

        // Answered in reverse: a FIFO implementation would hand the failure
        // to the first caller and the report to the second.
        worker.answer(worker.sent[1]);
        worker.answer(worker.sent[0]);

        await expect(bad).rejects.toThrow(
            /parseLog: axilog failed to parse \/nonexistent\.zevtc: No such file or directory/,
        );
        expect((await good).axilog.generated_from).toBe('wvw.zevtc');
        expect(sink.errors).toEqual([]);
    });

    it('reuses one channel across parses and opens a new one after the worker exits', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        const first = dispatcher.parse(FIXTURE);
        const second = dispatcher.parse(FIXTURE);
        expect(worker.opened).toBe(1);
        worker.answer(worker.sent[0]);
        worker.answer(worker.sent[1]);
        await first;
        await second;

        worker.exit(0);
        const third = dispatcher.parse(FIXTURE);
        expect(worker.opened).toBe(2);
        worker.answer(worker.sent[2]);
        await third;
        expect(sink.errors).toEqual([]);
    });

    it('rejects every outstanding request, by log path, when the worker dies', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        const one = dispatcher.parse('/logs/alpha.zevtc');
        const two = dispatcher.parse('/logs/beta.zevtc');
        worker.exit(3);

        await expect(one).rejects.toThrow(
            /parseLog: axilog worker exited with code 3 before replying \(parsing \/logs\/alpha\.zevtc\)/,
        );
        await expect(two).rejects.toThrow(
            /parseLog: axilog worker exited with code 3 before replying \(parsing \/logs\/beta\.zevtc\)/,
        );
    });

    it('rejects a request the worker never answers, naming the log and the budget', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 30,
            reportProtocolError: sink.report,
        });

        // The worker spawns and simply goes quiet. Before the timeout this
        // promise stayed pending forever and the renderer stayed stuck in
        // `isParsing` with no error toast and no way out.
        await expect(dispatcher.parse('/logs/silent.zevtc')).rejects.toThrow(
            /parseLog: axilog worker did not reply within 30ms \(parsing \/logs\/silent\.zevtc\)/,
        );
    });

    /**
     * `settle` clears the request's timer. Deleting that `clearTimeout` left
     * all 333 tests green, and in production it meant every ANSWERED parse
     * still fired `onTimeout` one budget later -- which kills the worker and
     * rejects every other request in flight. The parse path is the branch's
     * crown jewel and this was the one line in it nothing touched.
     */
    it('does not fire the timeout for a request it already answered', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 30,
            reportProtocolError: sink.report,
        });

        const promise = dispatcher.parse(FIXTURE);
        worker.answer(worker.sent[0]);
        expect((await promise).axilog.generated_from).toBe('wvw.zevtc');

        // Well past the 30ms budget the answered request was given.
        await new Promise(resolve => setTimeout(resolve, 120));

        expect(worker.killed, 'workers killed after an ANSWERED parse').toBe(0);
        expect(worker.opened, 'channels opened').toBe(1);
        expect(sink.errors.map(e => e.message)).toEqual([]);

        // And the same worker is still in service: a second parse goes down
        // the same channel rather than a replacement one.
        const second = dispatcher.parse(FIXTURE);
        expect(worker.opened).toBe(1);
        worker.answer(worker.sent[1]);
        expect((await second).axilog.generated_from).toBe('wvw.zevtc');
    });

    /**
     * The same for a REJECTED request: a parse that failed is settled too,
     * so its timer must not outlive it either.
     */
    it('does not fire the timeout for a request that already failed', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 30,
            reportProtocolError: sink.report,
        });

        const promise = dispatcher.parse('/nonexistent.zevtc');
        worker.answer(worker.sent[0]);
        await expect(promise).rejects.toThrow(/axilog failed to parse \/nonexistent\.zevtc/);

        await new Promise(resolve => setTimeout(resolve, 120));

        expect(worker.killed).toBe(0);
        expect(worker.opened).toBe(1);
        expect(sink.errors.map(e => e.message)).toEqual([]);
    });

    it('reports a reply to an unknown id without throwing, and keeps parsing', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        const promise = dispatcher.parse(FIXTURE);
        // A stray or duplicated reply. Thrown from inside the channel's
        // message listener this would be an uncaught exception in the main
        // process -- one bad message taking down the whole app.
        expect(() => worker.deliver({ id: 4242, ok: false, error: 'stray' })).not.toThrow();
        expect(sink.errors.length).toBe(1);
        expect(sink.errors[0].message).toMatch(
            /parseLog: axilog worker replied to unknown request id 4242 \(1 request\(s\) outstanding\)/,
        );

        // The live request is untouched.
        worker.answer(worker.sent[0]);
        expect((await promise).axilog.generated_from).toBe('wvw.zevtc');
    });

    it('settles a request exactly once, so a duplicated reply cannot re-settle it', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        const promise = dispatcher.parse(FIXTURE);
        worker.answer(worker.sent[0]);
        await promise;

        worker.deliver({ id: worker.sent[0].id, ok: false, error: 'duplicate' });
        expect(sink.errors.length).toBe(1);
        expect(sink.errors[0].message).toContain(
            `unknown request id ${worker.sent[0].id}`,
        );
    });
});

describe('workerEntryPoint', () => {
    it('names a worker module that actually exists in this tree', () => {
        // `tsc -p electron/tsconfig.json` emits src/main/X.ts to
        // dist-electron/main/X.js, so the fork target is only valid if the
        // matching source module exists under exactly this name. Renaming or
        // mistyping the worker is otherwise invisible until runtime, where
        // the utilityProcess simply never answers.
        expect(WORKER_ENTRY_BASENAME).toMatch(/\.js$/);
        const source = join(
            __dirname, '..', '..', 'src', 'main',
            WORKER_ENTRY_BASENAME.replace(/\.js$/, '.ts'),
        );
        expect(existsSync(source)).toBe(true);
        expect(workerEntryPoint().endsWith(WORKER_ENTRY_BASENAME)).toBe(true);
    });
});

describe('createParseDispatcher recovery after a hang', () => {
    const hung = (behaviour: { killThrows?: Error } = {}) => {
        const worker = fakeWorker(behaviour);
        const sink = protocolErrorSink();
        return {
            worker,
            sink,
            dispatcher: createParseDispatcher(worker.openChannel, {
                timeoutMs: 30,
                reportProtocolError: sink.report,
            }),
        };
    };

    it('kills the hung worker and opens a fresh one for the next parse', async () => {
        const { worker, dispatcher } = hung();

        // Without the kill-and-drop, the second parse is dispatched to the
        // same dead worker: `opened` stays 1 and every later parse costs a
        // full timeout for the life of the process.
        await expect(dispatcher.parse('/logs/first.zevtc')).rejects.toThrow(
            /did not reply within 30ms \(parsing \/logs\/first\.zevtc\)/,
        );
        expect(worker.opened).toBe(1);
        expect(worker.killed).toBe(1);

        await expect(dispatcher.parse('/logs/second.zevtc')).rejects.toThrow(
            /did not reply within 30ms \(parsing \/logs\/second\.zevtc\)/,
        );
        expect(worker.opened).toBe(2);
        expect(worker.killed).toBe(2);
    });

    it('parses normally again on the fresh worker after a hang', async () => {
        const { worker, sink, dispatcher } = hung();

        await expect(dispatcher.parse('/logs/silent.zevtc')).rejects.toThrow(
            /did not reply within/,
        );

        const recovered = dispatcher.parse(FIXTURE);
        expect(worker.opened).toBe(2);
        worker.answer(worker.sent[1]);
        expect((await recovered).axilog.generated_from).toBe('wvw.zevtc');
        expect(sink.errors).toEqual([]);
    });

    it('fails the requests in flight alongside the hung one, naming each log', async () => {
        const { worker, dispatcher } = hung();

        const slow = dispatcher.parse('/logs/slow.zevtc');
        const alongside = dispatcher.parse('/logs/alongside.zevtc');

        await expect(slow).rejects.toThrow(
            /parseLog: axilog worker did not reply within 30ms \(parsing \/logs\/slow\.zevtc\)/,
        );
        // Its worker has just been killed, so this request can never be
        // answered either. Leaving it pending would re-create the hang the
        // timeout exists to bound.
        await expect(alongside).rejects.toThrow(
            /parseLog: axilog worker was killed after another request timed out \(parsing \/logs\/alongside\.zevtc\)/,
        );
        expect(worker.killed).toBe(1);
    });

    it("a discarded worker's exit cannot disturb its replacement", async () => {
        const { worker, dispatcher } = hung();

        await expect(dispatcher.parse('/logs/first.zevtc')).rejects.toThrow(/did not reply within/);

        const onFreshWorker = dispatcher.parse(FIXTURE);
        expect(worker.opened).toBe(2);

        // The dead worker reports its death a second time, late. Unguarded,
        // this nulls the CURRENT channel and rejects the request running on
        // it -- a request that has nothing to do with the worker that died.
        worker.channels[0].exit(143);

        worker.answer(worker.sent[1]);
        expect((await onFreshWorker).axilog.generated_from).toBe('wvw.zevtc');
    });

    it('reports a kill that throws instead of letting it escape the timer', async () => {
        const { worker, sink, dispatcher } = hung({
            killThrows: new Error('EPERM: bad process handle'),
        });

        // Unguarded, this throw leaves a `setTimeout` callback and lands on
        // `uncaughtException`. The Electron main process installs no handler
        // for that, so the app dies over a worker it was discarding anyway.
        await expect(dispatcher.parse('/logs/unkillable.zevtc')).rejects.toThrow(
            /parseLog: axilog worker did not reply within 30ms \(parsing \/logs\/unkillable\.zevtc\)/,
        );

        expect(sink.errors.length).toBe(1);
        expect(sink.errors[0].message).toMatch(
            new RegExp(
                `parseLog: failed to kill the axilog worker after request`
                + ` ${worker.sent[0].id} \\(\\/logs\\/unkillable\\.zevtc\\) timed out:`
                + ` EPERM: bad process handle`,
            ),
        );

        // And the parse path still recovers: the channel was dropped before
        // the kill was attempted, so the next parse gets a fresh worker.
        const recovered = dispatcher.parse(FIXTURE);
        expect(worker.opened).toBe(2);
        worker.answer(worker.sent[1]);
        expect((await recovered).axilog.generated_from).toBe('wvw.zevtc');
    });

    it('names a self-exit as the cause when a reply arrives after it', async () => {
        const worker = fakeWorker();
        const sink = protocolErrorSink();
        const dispatcher = createParseDispatcher(worker.openChannel, {
            timeoutMs: 2000,
            reportProtocolError: sink.report,
        });

        // The worker dies on its own -- no timeout involved.
        const abandoned = dispatcher.parse(FIXTURE);
        worker.exit(0);
        await expect(abandoned).rejects.toThrow(/exited with code 0 before replying/);

        // Its late reply must name the exit. Without the cause being recorded
        // on this path the report claims no worker has been retired, which is
        // a diagnostic that sends the reader looking for the wrong bug.
        worker.channels[0].answer(worker.sent[0]);
        expect(sink.errors.length).toBe(1);
        expect(sink.errors[0].message).toContain('(the worker exited with code 0)');
        expect(sink.errors[0].message).not.toContain('no worker has been retired');
    });

    it('never reuses a request id across worker retirements', async () => {
        const { worker, dispatcher } = hung();

        await expect(dispatcher.parse('/logs/first.zevtc')).rejects.toThrow(/did not reply within/);
        await expect(dispatcher.parse('/logs/second.zevtc')).rejects.toThrow(/did not reply within/);

        // Ids are dispatcher-scoped, not channel-scoped. Restarting them at 1
        // for each new worker would make a late reply from a discarded worker
        // carry the same id as a live request, so the diagnostic naming that
        // id would point at the wrong parse.
        expect(worker.opened).toBe(2);
        expect(worker.sent[1].id).toBeGreaterThan(worker.sent[0].id);
    });

    it('reports a late reply as lateness, not as a protocol violation', async () => {
        const { worker, sink, dispatcher } = hung();

        // A parse that was merely slow: the request timed out, and the
        // worker then finished it successfully.
        const request = { id: 0, path: FIXTURE };
        await expect(dispatcher.parse(FIXTURE)).rejects.toThrow(/did not reply within/);
        request.id = worker.sent[0].id;
        worker.channels[0].answer(worker.sent[0]);

        expect(sink.errors.length).toBe(1);
        expect(sink.errors[0].message).toMatch(
            new RegExp(
                `parseLog: discarded a late reply to request id ${request.id} from an axilog`
                + ` worker no longer in service \\(the worker was killed after request`
                + ` ${request.id} \\(${FIXTURE.replace(/[/.]/g, '\\$&')}\\)`
                + ` went unanswered for 30ms\\)`,
            ),
        );
        // Blaming the worker for a protocol violation it did not commit is
        // what this message replaces.
        expect(sink.errors[0].message).not.toMatch(/unknown request id/);
    });
});

describe('PRODUCTION_DISPATCHER_OPTIONS', () => {
    it('gives production the exported timeout, not an ad-hoc one', () => {
        expect(PRODUCTION_DISPATCHER_OPTIONS.timeoutMs).toBe(PARSE_TIMEOUT_MS);
        expect(PARSE_TIMEOUT_MS).toBe(120_000);
        // A guard against the value being quietly shrunk to something a real
        // parse could exceed. The fixture parses in ~0.3s.
        expect(PARSE_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    });

    it('actually emits protocol errors rather than dropping them', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let calls: unknown[][];
        try {
            PRODUCTION_DISPATCHER_OPTIONS.reportProtocolError(
                new Error('probe: a protocol error the main process must not swallow'),
            );
            // Read before restoring: `mockRestore` wipes `mock.calls` along
            // with the stub, so asserting afterwards asserts on nothing.
            calls = spy.mock.calls.map(args => [...args]);
        } finally {
            spy.mockRestore();
        }
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe(
            'probe: a protocol error the main process must not swallow',
        );
    });
});
