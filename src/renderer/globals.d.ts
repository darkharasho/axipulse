// The contextBridge surface is declared once, in `src/shared/electronApi.ts`,
// and referenced here via an inline import so this file stays a global script
// rather than becoming a module -- a top-level import would stop it
// augmenting `Window`. `src/preload/index.ts` annotates its exposed object
// with the same type, which is what stops the two halves drifting.
interface Window {
    electronAPI?: import('../shared/electronApi').ElectronAPI;
}
