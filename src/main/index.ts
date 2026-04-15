import { app, BrowserWindow, ipcMain, dialog, nativeTheme, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import Store from 'electron-store'
import { LogWatcher } from './watcher'
import { EiManager, DEFAULT_EI_SETTINGS, EiParserSettings } from './eiParser'
import { registerEiHandlers } from './handlers/eiHandlers'

for (const stream of [process.stdout, process.stderr]) {
    stream?.on?.('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || '';
const APP_PROFILE = process.env.APP_PROFILE;
if (APP_PROFILE && !app.isPackaged) {
    const profileUserData = path.join(app.getPath('appData'), `${app.getName()}-${APP_PROFILE}`);
    app.setPath('userData', profileUserData);
}

const store = new Store();
const logWatcher = new LogWatcher();
let mainWindow: BrowserWindow | null = null;
let eiManager: EiManager;

function isWindowsTaskbarDark(): boolean {
    try {
        const { execSync } = require('child_process');
        const out = execSync(
            'reg query "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v SystemUsesLightTheme',
            { encoding: 'utf8', windowsHide: true, timeout: 2000 },
        );
        const match = out.match(/SystemUsesLightTheme\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
        return match ? parseInt(match[1], 16) === 0 : nativeTheme.shouldUseDarkColors;
    } catch {
        return nativeTheme.shouldUseDarkColors;
    }
}

function getIconPath(): string {
    let variant: string;
    if (process.platform === 'linux') {
        variant = 'white';
    } else if (process.platform === 'win32') {
        variant = isWindowsTaskbarDark() ? 'white' : 'black';
    } else {
        variant = nativeTheme.shouldUseDarkColors ? 'white' : 'black';
    }
    return path.join(__dirname, `../../public/img/axipulse-${variant}.png`);
}

function createWindow(): void {
    const savedBounds = store.get('windowBounds') as { width: number; height: number; x: number; y: number } | undefined;
    mainWindow = new BrowserWindow({
        width: savedBounds?.width ?? 900,
        height: savedBounds?.height ?? 700,
        ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
        minWidth: 680,
        minHeight: 500,
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#090b10',
        icon: getIconPath(),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, '../preload/index.js'),
        },
    });

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('close', () => {
        if (mainWindow) {
            const bounds = mainWindow.getBounds();
            store.set('windowBounds', bounds);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (DEV_SERVER_URL) {
        mainWindow.loadURL(DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist-react/index.html'));
    }
}

function setupIpcHandlers(): void {
    ipcMain.on('window-control', (_event, action: string) => {
        if (!mainWindow) return;
        switch (action) {
            case 'minimize': mainWindow.minimize(); break;
            case 'maximize': mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break;
            case 'close': mainWindow.close(); break;
        }
    });

    ipcMain.handle('select-directory', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.on('start-watching', (_event, logDir: string) => {
        logWatcher.stop();
        logWatcher.start(logDir);
        store.set('logDirectory', logDir);
    });

    ipcMain.handle('get-settings', () => {
        return {
            logDirectory: store.get('logDirectory', '') as string,
            devMinFileSize: store.get('devMinFileSize', 0) as number,
        };
    });

    ipcMain.on('save-settings', (_event, settings: { logDirectory?: string; devMinFileSize?: number }) => {
        if (settings.logDirectory !== undefined) {
            store.set('logDirectory', settings.logDirectory);
        }
        if (settings.devMinFileSize !== undefined) {
            store.set('devMinFileSize', settings.devMinFileSize);
        }
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    ipcMain.handle('dev:parse-random', async () => {
        const logDir = store.get('logDirectory') as string | undefined;
        if (!logDir || !fs.existsSync(logDir)) return { error: 'No log directory configured' };
        if (!eiManager.isInstalled()) return { error: 'EI not installed' };

        const allFiles: string[] = [];
        const walk = (dir: string, depth: number) => {
            if (depth > 5) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) walk(path.join(dir, entry.name), depth + 1);
                else if (entry.name.endsWith('.evtc') || entry.name.endsWith('.zevtc'))
                    allFiles.push(path.join(dir, entry.name));
            }
        };
        walk(logDir, 0);
        if (allFiles.length === 0) return { error: 'No .evtc/.zevtc files found' };

        const minSize = (store.get('devMinFileSize', 0) as number) * 1024;
        const filtered = minSize > 0
            ? allFiles.filter(f => { try { return fs.statSync(f).size >= minSize; } catch { return false; } })
            : allFiles;
        if (filtered.length === 0) return { error: `No files >= ${minSize / 1024} KB found` };

        const logPath = filtered[Math.floor(Math.random() * filtered.length)];
        const logId = path.basename(logPath, path.extname(logPath));
        mainWindow?.webContents.send('parse-started', { logId, logPath });

        eiManager.setParseProgressCallback((line: string) => {
            mainWindow?.webContents.send('parse-progress', { logId, line });
        });

        try {
            const result = await eiManager.parseLog(logPath, logId);
            mainWindow?.webContents.send('parse-complete', { logId, logPath, data: result });
            return { success: true, logPath };
        } catch (err: any) {
            mainWindow?.webContents.send('parse-error', { logId, logPath, error: err?.message || 'Parse failed' });
            return { error: err?.message || 'Parse failed' };
        }
    });

    ipcMain.handle('open-external', async (_event, url: string) => {
        const { shell } = require('electron');
        await shell.openExternal(url);
    });

    // Session history
    ipcMain.handle('get-session-history', () => {
        return store.get('sessionHistory', []);
    });

    ipcMain.on('save-session-history', (_event, history: unknown[]) => {
        store.set('sessionHistory', history);
    });
}

function setupAutoUpdate(): void {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('update-available', info);
    });

    autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send('update-downloaded', info);
    });

    autoUpdater.on('download-progress', (progress) => {
        mainWindow?.webContents.send('update-progress', progress);
    });

    ipcMain.on('check-for-updates', () => {
        autoUpdater.checkForUpdates();
    });

    ipcMain.on('restart-app', () => {
        autoUpdater.quitAndInstall();
    });
}

function setupLogWatcher(): void {
    logWatcher.on('log-detected', async (logPath: string) => {
        mainWindow?.webContents.send('log-detected', logPath);

        if (!eiManager.isInstalled()) return;

        const logId = path.basename(logPath, path.extname(logPath));
        mainWindow?.webContents.send('parse-started', { logId, logPath });

        eiManager.setParseProgressCallback((line: string) => {
            mainWindow?.webContents.send('parse-progress', { logId, line });
        });

        try {
            const result = await eiManager.parseLog(logPath, logId);
            mainWindow?.webContents.send('parse-complete', { logId, logPath, data: result });
        } catch (err: any) {
            mainWindow?.webContents.send('parse-error', { logId, logPath, error: err?.message || 'Parse failed' });
        }
    });
}

app.whenReady().then(() => {
    eiManager = new EiManager(app.getPath('userData'));
    const AXIPULSE_EI_DEFAULTS = { ...DEFAULT_EI_SETTINGS, parseCombatReplay: true };
    const savedEiSettings = store.get('eiParserSettings') as EiParserSettings | undefined;
    if (savedEiSettings) {
        eiManager.setSettings({ ...AXIPULSE_EI_DEFAULTS, ...savedEiSettings });
    } else {
        eiManager.setSettings(AXIPULSE_EI_DEFAULTS);
    }

    setupIpcHandlers();
    setupAutoUpdate();
    registerEiHandlers({
        store,
        getWindow: () => mainWindow,
        getEiManager: () => eiManager,
    });

    createWindow();
    setupLogWatcher();

    const savedLogDir = store.get('logDirectory') as string | undefined;
    if (savedLogDir) {
        logWatcher.start(savedLogDir);
    }

    if (app.isPackaged) {
        autoUpdater.checkForUpdates();
    }
});

app.on('window-all-closed', () => {
    logWatcher.stop();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
