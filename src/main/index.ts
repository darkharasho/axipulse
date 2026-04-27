import { app, BrowserWindow, ipcMain, dialog, nativeTheme, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'fs'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import Store from 'electron-store'
import { LogWatcher } from './watcher'
import { EiManager, DEFAULT_EI_SETTINGS, EiParserSettings } from './eiParser'
import { registerEiHandlers } from './handlers/eiHandlers'
import { registerReleaseNotesHandlers } from './handlers/releaseNotesHandlers'
import { checkArcdps } from './arcdpsDetect'

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
    const imgDir = app.isPackaged
        ? path.join(__dirname, '../../dist-react/img')
        : path.join(__dirname, '../../public/img');
    return path.join(imgDir, `axipulse-${variant}.png`);
}

function getAppIcon(): Electron.NativeImage {
    const raw = nativeImage.createFromPath(getIconPath());
    if (process.platform === 'win32') {
        const sizes = [16, 32, 48, 64, 128, 256];
        const buffers = sizes.map(s => raw.resize({ width: s, height: s }).toPNG());
        const multi = nativeImage.createEmpty();
        for (let i = 0; i < sizes.length; i++) {
            multi.addRepresentation({ width: sizes[i], height: sizes[i], buffer: buffers[i], scaleFactor: 1.0 });
        }
        return multi;
    }
    return raw;
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
        icon: getAppIcon(),
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, '../preload/index.js'),
        },
    });

    // Explicitly set icon after creation — the constructor `icon` alone doesn't
    // update the taskbar icon for frameless windows on Windows.
    mainWindow.setIcon(getAppIcon());

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.webContents.once('did-finish-load', () => {
        if (FAKE_UPDATE) runFakeScenario();
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

    registerReleaseNotesHandlers(store);

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

    ipcMain.handle('troubleshoot:check-log-dir', async (_event, dir: string) => {
        if (!dir) return { configured: false, exists: false, count: 0 };
        try { await fs.promises.access(dir); } catch { return { configured: true, exists: false, count: 0 }; }
        let found = false;
        const walk = async (d: string, depth: number) => {
            if (depth > 4 || found) return;
            try {
                const entries = await fs.promises.readdir(d, { withFileTypes: true });
                for (const entry of entries) {
                    if (found) return;
                    if (entry.isDirectory()) await walk(path.join(d, entry.name), depth + 1);
                    else if (/\.(evtc|zevtc)$/i.test(entry.name)) { found = true; return; }
                }
            } catch {}
        };
        await walk(dir, 0);
        return { configured: true, exists: true, count: found ? 1 : 0 };
    });

    ipcMain.handle('troubleshoot:parse-test', async () => {
        const logDir = store.get('logDirectory') as string | undefined;
        if (!logDir || !fs.existsSync(logDir)) return { success: false, error: 'No log directory configured' };
        if (!eiManager.isInstalled()) return { success: false, error: 'EI not installed' };
        const minBytes = (store.get('devMinFileSize', 0) as number) * 1024;
        const allFiles: string[] = [];
        const walk = (d: string, depth: number) => {
            if (depth > 4) return;
            try {
                for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                    if (entry.isDirectory()) walk(path.join(d, entry.name), depth + 1);
                    else if (/\.(evtc|zevtc)$/i.test(entry.name)) {
                        const full = path.join(d, entry.name);
                        if (minBytes === 0 || fs.statSync(full).size >= minBytes) allFiles.push(full);
                    }
                }
            } catch {}
        };
        walk(logDir, 0);
        if (allFiles.length === 0) return { success: false, error: 'No logs found' };
        const logPath = allFiles[Math.floor(Math.random() * allFiles.length)];
        const logId = `ts_${path.basename(logPath, path.extname(logPath))}`;
        eiManager.setParseProgressCallback(() => {});
        try {
            await eiManager.parseLog(logPath, logId);
            return { success: true, logPath };
        } catch (err: any) {
            return { success: false, error: err?.message ?? 'Parse failed' };
        }
    });

    ipcMain.handle('troubleshoot:check-arcdps', () => {
        return checkArcdps(process.platform, app.getPath('home'), {
            readFile: (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } },
            listDir: (p) => { try { return fs.readdirSync(p) as string[]; } catch { return []; } },
        });
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

const FAKE_UPDATE = process.env.FAKE_UPDATE;

const fakeScenarios: Record<string, () => void> = {
    available: () => {
        mainWindow?.webContents.send('update-checking');
        setTimeout(() => mainWindow?.webContents.send('update-available', { version: '99.0.0' }), 1500);
        setTimeout(() => mainWindow?.webContents.send('update-downloaded', { version: '99.0.0' }), 4000);
    },
    none: () => {
        mainWindow?.webContents.send('update-checking');
        setTimeout(() => mainWindow?.webContents.send('update-not-available'), 1500);
    },
    error: () => {
        mainWindow?.webContents.send('update-checking');
        setTimeout(() => mainWindow?.webContents.send('update-error'), 1500);
    },
};

function runFakeScenario(): void {
    const scenario = fakeScenarios[FAKE_UPDATE!] || fakeScenarios.none;
    scenario();
}

function setupFakeUpdate(): void {
    ipcMain.on('check-for-updates', runFakeScenario);

    ipcMain.on('restart-app', () => {
        log.info('[fake-update] restart-app requested — ignoring in dev');
    });
}

function setupAutoUpdate(): void {
    if (FAKE_UPDATE) {
        log.info(`[fake-update] Using fake update scenario: ${FAKE_UPDATE}`);
        setupFakeUpdate();
        return;
    }

    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        mainWindow?.webContents.send('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send('update-available', info);
    });

    autoUpdater.on('update-not-available', () => {
        mainWindow?.webContents.send('update-not-available');
    });

    autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send('update-downloaded', info);
    });

    autoUpdater.on('download-progress', (progress) => {
        mainWindow?.webContents.send('update-progress', progress);
    });

    autoUpdater.on('error', () => {
        mainWindow?.webContents.send('update-error');
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
    fs.writeFileSync(path.join(app.getPath('userData'), 'axiom-version'), app.getVersion(), 'utf8')

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

    nativeTheme.on('updated', () => {
        mainWindow?.setIcon(getAppIcon());
    });

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
