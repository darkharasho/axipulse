import { describe, it, expect } from 'vitest';
import path from 'node:path';
const win = path.win32;
const posix = path.posix;
import { buildArcdpsCandidates, findArcdpsConfig, checkArcdps, type ArcdpsFsOps } from '../../src/main/arcdpsDetect';

// Helpers

function noFiles(): ArcdpsFsOps {
    return { readFile: () => null, listDir: () => [] };
}

function withFile(filePath: string, content: string): ArcdpsFsOps {
    return {
        readFile: (p) => (p === filePath ? content : null),
        listDir: () => [],
    };
}

function withVdfAndFile(vdfPath: string, vdfContent: string, iniPath: string, iniContent: string): ArcdpsFsOps {
    return {
        readFile: (p) => {
            if (p === vdfPath) return vdfContent;
            if (p === iniPath) return iniContent;
            return null;
        },
        listDir: () => [],
    };
}

const WVW_ON  = '[log]\nwvw=1\n';
const WVW_OFF = '[log]\nwvw=0\n';
const NO_WVW  = '[paths]\nsome_setting=1\n';

// ─── buildArcdpsCandidates — Linux ───────────────────────────────────────────

describe('buildArcdpsCandidates — linux', () => {
    const home = '/home/user';

    it('includes default Steam root wine-prefix path', () => {
        const candidates = buildArcdpsCandidates('linux', home, noFiles());
        expect(candidates).toContain(
            path.join(home, '.steam', 'steam', 'steamapps', 'compatdata', '1284210', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'Guild Wars 2', 'addons', 'arcdps', 'arcdps.ini')
        );
    });

    it('includes local/share/Steam wine-prefix path', () => {
        const candidates = buildArcdpsCandidates('linux', home, noFiles());
        expect(candidates).toContain(
            path.join(home, '.local', 'share', 'Steam', 'steamapps', 'compatdata', '1284210', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'Guild Wars 2', 'addons', 'arcdps', 'arcdps.ini')
        );
    });

    it('includes game-directory arcdps.ini path', () => {
        const candidates = buildArcdpsCandidates('linux', home, noFiles());
        expect(candidates).toContain(
            path.join(home, '.steam', 'steam', 'steamapps', 'common', 'Guild Wars 2', 'arcdps.ini')
        );
    });

    it('picks up extra library paths from libraryfolders.vdf', () => {
        const vdfPath = path.join(home, '.steam', 'steam', 'config', 'libraryfolders.vdf');
        const vdf = `"libraryfolders"\n{\n  "1"\n  {\n    "path"\t\t"/var/mnt/data/SteamLibrary"\n  }\n}`;
        const ops: ArcdpsFsOps = {
            readFile: (p) => (p === vdfPath ? vdf : null),
            listDir: () => [],
        };
        const candidates = buildArcdpsCandidates('linux', home, ops);
        expect(candidates).toContain(
            '/var/mnt/data/SteamLibrary/steamapps/compatdata/1284210/pfx/drive_c/users/steamuser/Documents/Guild Wars 2/addons/arcdps/arcdps.ini'
        );
        expect(candidates).toContain(
            '/var/mnt/data/SteamLibrary/steamapps/common/Guild Wars 2/arcdps.ini'
        );
    });
});

// ─── buildArcdpsCandidates — Windows ─────────────────────────────────────────

describe('buildArcdpsCandidates — win32', () => {
    const home = 'C:\\Users\\User';

    it('includes user Documents path', () => {
        const candidates = buildArcdpsCandidates('win32', home, noFiles());
        expect(candidates).toContain(
            win.join(home, 'Documents', 'Guild Wars 2', 'addons', 'arcdps', 'arcdps.ini')
        );
    });

    it('includes Program Files (x86) on C drive', () => {
        const candidates = buildArcdpsCandidates('win32', home, noFiles());
        expect(candidates).toContain('C:\\Program Files (x86)\\Guild Wars 2\\arcdps.ini');
    });

    it('includes Program Files on C drive', () => {
        const candidates = buildArcdpsCandidates('win32', home, noFiles());
        expect(candidates).toContain('C:\\Program Files\\Guild Wars 2\\arcdps.ini');
    });

    it('includes alternative drives (D, E)', () => {
        const candidates = buildArcdpsCandidates('win32', home, noFiles());
        expect(candidates).toContain('D:\\Program Files (x86)\\Guild Wars 2\\arcdps.ini');
        expect(candidates).toContain('E:\\Games\\Guild Wars 2\\arcdps.ini');
    });

    it('includes addons subfolder variant', () => {
        const candidates = buildArcdpsCandidates('win32', home, noFiles());
        expect(candidates).toContain('C:\\Program Files (x86)\\Guild Wars 2\\addons\\arcdps\\arcdps.ini');
    });

    it('includes default Windows Steam path', () => {
        const candidates = buildArcdpsCandidates('win32', home, noFiles());
        expect(candidates).toContain(
            'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Guild Wars 2\\arcdps.ini'
        );
    });

    it('picks up extra Steam library paths from libraryfolders.vdf on Windows', () => {
        const vdfPath = win.join(home, 'AppData', 'Local', 'Steam', 'config', 'libraryfolders.vdf');
        // VDF paths use single backslash; in JS string that's \\
        const vdf = '"libraryfolders"\n{\n  "1"\n  {\n    "path"\t\t"D:\\SteamLibrary"\n  }\n}';
        const ops: ArcdpsFsOps = {
            readFile: (p) => (p === vdfPath ? vdf : null),
            listDir: () => [],
        };
        const candidates = buildArcdpsCandidates('win32', home, ops);
        expect(candidates).toContain('D:\\SteamLibrary\\steamapps\\common\\Guild Wars 2\\arcdps.ini');
    });
});

// ─── findArcdpsConfig ─────────────────────────────────────────────────────────

describe('findArcdpsConfig', () => {
    it('returns not-found when no candidate exists', () => {
        const result = findArcdpsConfig(['/a/arcdps.ini', '/b/arcdps.ini'], () => null);
        expect(result).toEqual({ found: false, wvwEnabled: null, configPath: null });
    });

    it('returns found with wvwEnabled=true when wvw=1 present', () => {
        const result = findArcdpsConfig(['/a/arcdps.ini'], (p) => (p === '/a/arcdps.ini' ? WVW_ON : null));
        expect(result).toEqual({ found: true, wvwEnabled: true, configPath: '/a/arcdps.ini' });
    });

    it('returns found with wvwEnabled=false when wvw=0', () => {
        const result = findArcdpsConfig(['/a/arcdps.ini'], (p) => (p === '/a/arcdps.ini' ? WVW_OFF : null));
        expect(result).toEqual({ found: true, wvwEnabled: false, configPath: '/a/arcdps.ini' });
    });

    it('returns found with wvwEnabled=false when no wvw key exists', () => {
        const result = findArcdpsConfig(['/a/arcdps.ini'], (p) => (p === '/a/arcdps.ini' ? NO_WVW : null));
        expect(result).toEqual({ found: true, wvwEnabled: false, configPath: '/a/arcdps.ini' });
    });

    it('stops at the first matching file', () => {
        const hits: string[] = [];
        findArcdpsConfig(['/first/arcdps.ini', '/second/arcdps.ini'], (p) => {
            hits.push(p);
            return WVW_ON;
        });
        expect(hits).toHaveLength(1);
        expect(hits[0]).toBe('/first/arcdps.ini');
    });

    it('skips missing files and finds the next one', () => {
        const result = findArcdpsConfig(['/missing.ini', '/found/arcdps.ini'], (p) =>
            p === '/found/arcdps.ini' ? WVW_ON : null
        );
        expect(result.configPath).toBe('/found/arcdps.ini');
        expect(result.wvwEnabled).toBe(true);
    });

    it('is case-insensitive for the wvw key', () => {
        const result = findArcdpsConfig(['/a/arcdps.ini'], () => '[log]\nWVW=1\n');
        expect(result.wvwEnabled).toBe(true);
    });
});

// ─── checkArcdps — integration ────────────────────────────────────────────────

describe('checkArcdps', () => {
    it('linux: finds config in custom Steam library via VDF', () => {
        const home = '/home/user';
        const vdfPath = path.join(home, '.steam', 'steam', 'config', 'libraryfolders.vdf');
        const vdf = `"libraryfolders"\n{\n  "1"\n  {\n    "path"\t\t"/var/mnt/data/SteamLibrary"\n  }\n}`;
        const iniPath = '/var/mnt/data/SteamLibrary/steamapps/compatdata/1284210/pfx/drive_c/users/steamuser/Documents/Guild Wars 2/addons/arcdps/arcdps.ini';
        const result = checkArcdps('linux', home, withVdfAndFile(vdfPath, vdf, iniPath, WVW_ON));
        expect(result.found).toBe(true);
        expect(result.wvwEnabled).toBe(true);
        expect(result.configPath).toBe(iniPath);
    });

    it('linux: returns not-found when no config exists anywhere', () => {
        const result = checkArcdps('linux', '/home/user', noFiles());
        expect(result).toEqual({ found: false, wvwEnabled: null, configPath: null });
    });

    it('win32: finds config in Program Files (x86)', () => {
        const iniPath = 'C:\\Program Files (x86)\\Guild Wars 2\\arcdps.ini';
        const result = checkArcdps('win32', 'C:\\Users\\User', withFile(iniPath, WVW_ON));
        expect(result.found).toBe(true);
        expect(result.wvwEnabled).toBe(true);
        expect(result.configPath).toBe(iniPath);
    });

    it('win32: finds config in D drive Games folder', () => {
        const iniPath = 'D:\\Games\\Guild Wars 2\\arcdps.ini';
        const result = checkArcdps('win32', 'C:\\Users\\User', withFile(iniPath, WVW_OFF));
        expect(result.found).toBe(true);
        expect(result.wvwEnabled).toBe(false);
    });

    it('win32: finds config in user Documents', () => {
        const home = 'C:\\Users\\User';
        const iniPath = win.join(home, 'Documents', 'Guild Wars 2', 'addons', 'arcdps', 'arcdps.ini');
        const result = checkArcdps('win32', home, withFile(iniPath, WVW_ON));
        expect(result.found).toBe(true);
        expect(result.wvwEnabled).toBe(true);
    });

    it('win32: returns not-found when no config exists', () => {
        const result = checkArcdps('win32', 'C:\\Users\\User', noFiles());
        expect(result).toEqual({ found: false, wvwEnabled: null, configPath: null });
    });
});
