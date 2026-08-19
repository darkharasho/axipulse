// src/main/axilogWorker.ts
//
// Runs in an Electron utilityProcess. `parseFile` is synchronous napi;
// calling it on the main thread freezes the window for the length of the
// parse, and a fight landing mid-session is exactly when that matters.
//
// The protocol is deliberately tiny: one request in, one reply out, matched
// by id. `axilogParser.ts` owns both ends of it.
//
// The work is in `handleParseRequest`, an ordinary exported function, and
// only the transport binding below is Electron-specific. That split is what
// lets the worker's real behaviour -- the real parse, with production's
// `PARSE_OPTS`, and the real reply shape -- be tested under vitest, which
// runs in plain Node where no utilityProcess exists.
import { parseFile } from '@axiapps/axilog';
import { PARSE_OPTS, type WorkerRequest, type WorkerResponse } from './axilogParser';

/** Parse one request into exactly one reply. Never throws. */
export function handleParseRequest(request: WorkerRequest): WorkerResponse {
    try {
        return { id: request.id, ok: true, report: parseFile(request.path, PARSE_OPTS) };
    } catch (err) {
        return {
            id: request.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * The port back to the main process, or null when this module was loaded
 * outside a utilityProcess (a test importing it, say). `process.parentPort`
 * is typed as always-present because within a utilityProcess it is; the cast
 * is what lets the absence be observed rather than assumed.
 */
function parentPortOrNull(): Electron.ParentPort | null {
    const host = process as NodeJS.Process & { parentPort?: Electron.ParentPort };
    return host.parentPort === undefined ? null : host.parentPort;
}

const parentPort = parentPortOrNull();
if (parentPort !== null) {
    parentPort.on('message', (e: Electron.MessageEvent) => {
        parentPort.postMessage(handleParseRequest(e.data as WorkerRequest));
    });
}
