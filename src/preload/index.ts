import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/electronApi'

// Annotated, not inferred. `ElectronAPI` is the same declaration
// `src/renderer/globals.d.ts` points at, so a member added, removed or
// retyped on either side is a compile error here -- the two halves used to
// be independent declarations that could disagree silently.
const api: ElectronAPI = {
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
    onParseComplete: (callback) => {
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

    // Release notes
    getReleaseNotes: (version: string, lastSeenVersion: string | null = null) =>
        ipcRenderer.invoke('release-notes:get', version, lastSeenVersion),
    getLastSeenVersion: () => ipcRenderer.invoke('release-notes:get-last-seen'),
    setLastSeenVersion: (version: string) => ipcRenderer.invoke('release-notes:set-last-seen', version),

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

    // Troubleshoot
    troubleshootCheckLogDir: (dir: string) => ipcRenderer.invoke('troubleshoot:check-log-dir', dir),
    troubleshootCheckArcdps: () => ipcRenderer.invoke('troubleshoot:check-arcdps'),
    troubleshootParseTest: () => ipcRenderer.invoke('troubleshoot:parse-test'),
}

contextBridge.exposeInMainWorld('electronAPI', api)
