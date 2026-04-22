import path from 'node:path';

export interface ArcdpsResult {
    found: boolean;
    wvwEnabled: boolean | null;
    configPath: string | null;
}

export interface ArcdpsFsOps {
    readFile: (p: string) => string | null;
    listDir: (p: string) => string[];
}

const GW2_APP_ID = '1284210';

function addSteamLibraryCandidates(
    steamRoot: string,
    candidates: string[],
    ops: ArcdpsFsOps,
    pth: typeof path.posix | typeof path.win32,
): void {
    const libraryPaths = new Set<string>([steamRoot]);
    const vdf = ops.readFile(pth.join(steamRoot, 'config', 'libraryfolders.vdf'));
    if (vdf) {
        for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) libraryPaths.add(m[1]);
    }
    for (const lib of libraryPaths) {
        candidates.push(pth.join(lib, 'steamapps', 'compatdata', GW2_APP_ID, 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'Guild Wars 2', 'addons', 'arcdps', 'arcdps.ini'));
        const gameDir = pth.join(lib, 'steamapps', 'common', 'Guild Wars 2');
        candidates.push(pth.join(gameDir, 'arcdps.ini'));
        candidates.push(pth.join(gameDir, 'addons', 'arcdps', 'arcdps.ini'));
    }
}

export function buildArcdpsCandidates(platform: string, homeDir: string, ops: ArcdpsFsOps): string[] {
    const candidates: string[] = [];

    if (platform === 'win32') {
        const p = path.win32;
        candidates.push(p.join(homeDir, 'Documents', 'Guild Wars 2', 'addons', 'arcdps', 'arcdps.ini'));

        const drives = ['C', 'D', 'E', 'F', 'G'];
        const programDirs = ['Program Files (x86)', 'Program Files', 'Games', 'game'];
        for (const drive of drives) {
            for (const prog of programDirs) {
                const gw2Dir = `${drive}:\\${prog}\\Guild Wars 2`;
                candidates.push(p.join(gw2Dir, 'arcdps.ini'));
                candidates.push(p.join(gw2Dir, 'addons', 'arcdps', 'arcdps.ini'));
            }
        }

        const envPf = [process.env['PROGRAMFILES(X86)'], process.env['PROGRAMFILES']].filter(Boolean) as string[];
        for (const base of envPf) {
            const gw2Dir = p.join(base, 'Guild Wars 2');
            candidates.push(p.join(gw2Dir, 'arcdps.ini'));
            candidates.push(p.join(gw2Dir, 'addons', 'arcdps', 'arcdps.ini'));
        }

        for (const steamRoot of [
            p.join(homeDir, 'AppData', 'Local', 'Steam'),
            'C:\\Program Files (x86)\\Steam',
            'C:\\Program Files\\Steam',
        ]) {
            addSteamLibraryCandidates(steamRoot, candidates, ops, p);
        }
    } else {
        const p = path.posix;
        for (const steamRoot of [
            p.join(homeDir, '.steam', 'steam'),
            p.join(homeDir, '.local', 'share', 'Steam'),
        ]) {
            addSteamLibraryCandidates(steamRoot, candidates, ops, p);
        }
    }

    return candidates;
}

export function findArcdpsConfig(candidates: string[], readFile: (p: string) => string | null): ArcdpsResult {
    for (const configPath of candidates) {
        const content = readFile(configPath);
        if (content !== null) {
            return { found: true, wvwEnabled: /wvw\s*=\s*1/i.test(content), configPath };
        }
    }
    return { found: false, wvwEnabled: null, configPath: null };
}

export function checkArcdps(platform: string, homeDir: string, ops: ArcdpsFsOps): ArcdpsResult {
    const candidates = buildArcdpsCandidates(platform, homeDir, ops);
    return findArcdpsConfig(candidates, ops.readFile);
}
