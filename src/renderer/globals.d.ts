interface Window {
    electronAPI?: {
        windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
        selectDirectory: () => Promise<string | null>;
        startWatching: (path: string) => void;
        onLogDetected: (callback: (path: string) => void) => () => void;
        onParseStarted: (callback: (data: { logId: string; logPath: string }) => void) => () => void;
        onParseProgress: (callback: (data: { logId: string; line: string }) => void) => () => void;
        onParseComplete: (callback: (data: { logId: string; logPath: string; data: unknown }) => void) => () => void;
        onParseError: (callback: (data: { logId: string; logPath: string; error: string }) => void) => () => void;
        getSettings: () => Promise<{ logDirectory: string }>;
        saveSettings: (settings: any) => void;
        getAppVersion: () => Promise<string>;
        openExternal: (url: string) => Promise<void>;
        getSessionHistory: () => Promise<unknown[]>;
        saveSessionHistory: (history: unknown[]) => void;
        checkForUpdates: () => void;
        restartApp: () => void;
        onUpdateAvailable: (callback: (info: any) => void) => () => void;
        onUpdateDownloaded: (callback: (info: any) => void) => () => void;
        onUpdateProgress: (callback: (progress: any) => void) => () => void;
        devParseRandom: () => Promise<{ success?: boolean; logPath?: string; error?: string }>;
        eiGetStatus: () => Promise<any>;
        eiInstall: () => Promise<any>;
        eiUpdate: () => Promise<any>;
        eiReinstall: () => Promise<any>;
        eiUninstall: () => Promise<any>;
        eiCheckUpdate: () => Promise<{ updateAvailable: string | null }>;
        eiGetSettings: () => Promise<any>;
        eiSaveSettings: (settings: any) => void;
        eiGetAutoManage: () => Promise<boolean>;
        eiSetAutoManage: (enabled: boolean) => void;
        onEiDownloadProgress: (callback: (progress: any) => void) => () => void;
        onEiStatusChanged: (callback: (status: any) => void) => () => void;
    };
}
