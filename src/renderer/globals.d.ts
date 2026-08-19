interface Window {
    electronAPI?: {
        windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
        selectDirectory: () => Promise<string | null>;
        startWatching: (path: string) => void;
        onLogDetected: (callback: (path: string) => void) => () => void;
        onParseStarted: (callback: (data: { logId: string; logPath: string }) => void) => () => void;
        // `data` is the native report the main process just produced. Typed
        // via an inline import so this file stays a global script rather than
        // becoming a module (a top-level import would stop it augmenting
        // `Window`). Before the axilog cutover this was `unknown` and the
        // renderer cast it, which is exactly how a main/renderer payload
        // mismatch stays invisible across two separate tsconfigs.
        onParseComplete: (callback: (data: { logId: string; logPath: string; data: import('../shared/report').ReportV1 }) => void) => () => void;
        onParseError: (callback: (data: { logId: string; logPath: string; error: string }) => void) => () => void;
        getSettings: () => Promise<{ logDirectory: string; devMinFileSize: number }>;
        saveSettings: (settings: any) => void;
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
        onUpdateAvailable: (callback: (info: any) => void) => () => void;
        onUpdateNotAvailable: (callback: () => void) => () => void;
        onUpdateDownloaded: (callback: (info: any) => void) => () => void;
        onUpdateProgress: (callback: (progress: any) => void) => () => void;
        onUpdateError: (callback: () => void) => () => void;
        devParseRandom: () => Promise<{ success?: boolean; logPath?: string; error?: string }>;
        troubleshootCheckLogDir: (dir: string) => Promise<{ configured: boolean; exists: boolean; count: number }>;
        troubleshootCheckArcdps: () => Promise<{ found: boolean; wvwEnabled: boolean | null; configPath: string | null }>;
        troubleshootParseTest: () => Promise<{ success: boolean; logPath?: string; error?: string }>;
    };
}
