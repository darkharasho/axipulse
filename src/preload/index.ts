import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    // Window controls
    windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', action),

    // Directory picker
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // Log watching
    startWatching: (path: string) => ipcRenderer.send('start-watching', path),
    onLogDetected: (callback: (path: string) => void) => {
        ipcRenderer.on('log-detected', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('log-detected')
    },

    // Parse events
    onParseStarted: (callback: (data: { logId: string; logPath: string }) => void) => {
        ipcRenderer.on('parse-started', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('parse-started')
    },
    onParseProgress: (callback: (data: { logId: string; line: string }) => void) => {
        ipcRenderer.on('parse-progress', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('parse-progress')
    },
    onParseComplete: (callback: (data: { logId: string; logPath: string; data: unknown }) => void) => {
        ipcRenderer.on('parse-complete', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('parse-complete')
    },
    onParseError: (callback: (data: { logId: string; logPath: string; error: string }) => void) => {
        ipcRenderer.on('parse-error', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('parse-error')
    },

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings: any) => ipcRenderer.send('save-settings', settings),

    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

    // Session history
    getSessionHistory: () => ipcRenderer.invoke('get-session-history'),
    saveSessionHistory: (history: unknown[]) => ipcRenderer.send('save-session-history', history),

    // Auto Updater
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    restartApp: () => ipcRenderer.send('restart-app'),
    onUpdateChecking: (callback: () => void) => {
        ipcRenderer.on('update-checking', () => callback())
        return () => ipcRenderer.removeAllListeners('update-checking')
    },
    onUpdateAvailable: (callback: (info: any) => void) => {
        ipcRenderer.on('update-available', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-available')
    },
    onUpdateNotAvailable: (callback: () => void) => {
        ipcRenderer.on('update-not-available', () => callback())
        return () => ipcRenderer.removeAllListeners('update-not-available')
    },
    onUpdateDownloaded: (callback: (info: any) => void) => {
        ipcRenderer.on('update-downloaded', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-downloaded')
    },
    onUpdateProgress: (callback: (progress: any) => void) => {
        ipcRenderer.on('update-progress', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('update-progress')
    },
    onUpdateError: (callback: () => void) => {
        ipcRenderer.on('update-error', () => callback())
        return () => ipcRenderer.removeAllListeners('update-error')
    },

    // Dev tools
    devParseRandom: () => ipcRenderer.invoke('dev:parse-random'),

    // EI Management
    eiGetStatus: () => ipcRenderer.invoke('ei:get-status'),
    eiInstall: () => ipcRenderer.invoke('ei:install'),
    eiUpdate: () => ipcRenderer.invoke('ei:update'),
    eiReinstall: () => ipcRenderer.invoke('ei:reinstall'),
    eiUninstall: () => ipcRenderer.invoke('ei:uninstall'),
    eiCheckUpdate: () => ipcRenderer.invoke('ei:check-update'),
    eiGetSettings: () => ipcRenderer.invoke('ei:get-settings'),
    eiSaveSettings: (settings: any) => ipcRenderer.send('ei:save-settings', settings),
    eiGetAutoManage: () => ipcRenderer.invoke('ei:get-auto-manage'),
    eiSetAutoManage: (enabled: boolean) => ipcRenderer.send('ei:set-auto-manage', enabled),
    onEiDownloadProgress: (callback: (progress: any) => void) => {
        ipcRenderer.on('ei:download-progress', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('ei:download-progress')
    },
    onEiStatusChanged: (callback: (status: any) => void) => {
        ipcRenderer.on('ei:status-changed', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('ei:status-changed')
    },
    eiCheckDotnet: () => ipcRenderer.invoke('ei:check-dotnet'),
    eiInstallDotnet: () => ipcRenderer.invoke('ei:install-dotnet'),
    onEiDotnetInstallOutput: (callback: (line: string) => void) => {
        ipcRenderer.on('ei:dotnet-install-output', (_event, value) => callback(value))
        return () => ipcRenderer.removeAllListeners('ei:dotnet-install-output')
    },
})
