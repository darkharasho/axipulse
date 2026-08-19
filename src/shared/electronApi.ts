// src/shared/electronApi.ts
//
// The ONE declaration of the contextBridge surface.
//
// It used to be written twice: once as the object literal's parameter types
// in `src/preload/index.ts`, and once as the `Window.electronAPI` shape in
// `src/renderer/globals.d.ts`. Preload is compiled by `electron/tsconfig.json`
// and `globals.d.ts` by the root one, and the two projects never see each
// other -- so the halves could disagree and both typechecks stayed green.
// Changing preload's `onParseComplete` payload to `{ totallyWrong: number }`
// was a clean compile.
//
// `src/shared` is the only directory both projects include, so the type lives
// here: preload annotates its literal with `ElectronAPI` (excess and missing
// members are both errors) and `globals.d.ts` references the same symbol.
// There is nothing left to drift.
import type { ReportV1 } from './report';

export interface ElectronAPI {
    windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    selectDirectory: () => Promise<string | null>;
    startWatching: (path: string) => void;
    onLogDetected: (callback: (path: string) => void) => () => void;
    onParseStarted: (callback: (data: { logId: string; logPath: string }) => void) => () => void;
    /** `data` is the native report the main process just produced. Before the
     *  axilog cutover it was `unknown` and the renderer cast it. */
    onParseComplete: (callback: (data: { logId: string; logPath: string; data: ReportV1 }) => void) => () => void;
    onParseError: (callback: (data: { logId: string; logPath: string; error: string }) => void) => () => void;
    getSettings: () => Promise<{ logDirectory: string; devMinFileSize: number }>;
    saveSettings: (settings: { logDirectory?: string; devMinFileSize?: number }) => void;
    getAppVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    getReleaseNotes: (version: string, lastSeenVersion?: string | null) => Promise<{ source: 'github' | 'bundled' | 'none'; markdown: string | null }>;
    getLastSeenVersion: () => Promise<string | null>;
    setLastSeenVersion: (version: string) => Promise<void>;
    getSessionHistory: () => Promise<unknown[]>;
    saveSessionHistory: (history: unknown[]) => void;
    checkForUpdates: () => void;
    restartApp: () => void;
    onUpdateChecking: (callback: () => void) => () => void;
    onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
    onUpdateNotAvailable: (callback: () => void) => () => void;
    onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
    onUpdateProgress: (callback: (progress: { percent: number }) => void) => () => void;
    onUpdateError: (callback: () => void) => () => void;
    devParseRandom: () => Promise<{ success?: boolean; logPath?: string; error?: string }>;
    troubleshootCheckLogDir: (dir: string) => Promise<{ configured: boolean; exists: boolean; count: number }>;
    troubleshootCheckArcdps: () => Promise<{ found: boolean; wvwEnabled: boolean | null; configPath: string | null }>;
    troubleshootParseTest: () => Promise<{ success: boolean; logPath?: string; error?: string }>;
}
