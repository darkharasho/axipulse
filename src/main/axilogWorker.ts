// src/main/axilogWorker.ts
//
// Runs in an Electron utilityProcess. `parseFile` is synchronous napi;
// calling it on the main thread freezes the window for the length of the
// parse, and a fight landing mid-session is exactly when that matters.
//
// The protocol is deliberately tiny: one request in, one reply out, matched
// by id. `axilogParser.ts` owns both ends of it.
import { parseFile } from '@axiapps/axilog';
import { PARSE_OPTS, type WorkerRequest, type WorkerResponse } from './axilogParser';

process.parentPort.on('message', (e) => {
    const { id, path } = e.data as WorkerRequest;
    let response: WorkerResponse;
    try {
        response = { id, ok: true, report: parseFile(path, PARSE_OPTS) };
    } catch (err) {
        response = {
            id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    process.parentPort.postMessage(response);
});
