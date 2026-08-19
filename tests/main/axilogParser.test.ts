import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    createParseDispatcher,
    parseInProcess,
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

function fakeWorker() {
    let onMessage: ((r: WorkerResponse) => void) | null = null;
    let onExit: ((code: number) => void) | null = null;
    const sent: WorkerRequest[] = [];
    let opened = 0;

    const openChannel = (): ParseChannel => {
        opened++;
        return {
            postMessage: (request) => { sent.push(request); },
            onMessage: (handler) => { onMessage = handler; },
            onExit: (handler) => { onExit = handler; },
        };
    };

    return {
        openChannel,
        sent,
        get opened() { return opened; },
        /** Answer a request exactly as the real worker would. */
        answer(request: WorkerRequest) {
            if (onMessage === null) throw new Error('fakeWorker: no message handler bound');
            onMessage(handleParseRequest(request));
        },
        /** Push an arbitrary reply, for protocol-violation cases. */
        deliver(response: WorkerResponse) {
            if (onMessage === null) throw new Error('fakeWorker: no message handler bound');
            onMessage(response);
        },
        exit(code: number) {
            if (onExit === null) throw new Error('fakeWorker: no exit handler bound');
            onExit(code);
        },
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
