import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type Store from 'electron-store';
import { extractVersionSection } from '../releaseNotesParser';

const RELEASES_URL = 'https://api.github.com/repos/darkharasho/axipulse/releases';

export type ReleaseNotesSource = 'github' | 'bundled' | 'none';

export interface ReleaseNotesResult {
    source: ReleaseNotesSource;
    markdown: string | null;
}

async function fetchFromGitHub(version: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(RELEASES_URL, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'axipulse' },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const releases = await res.json() as Array<{ tag_name?: string; body?: string }>;
        const match = releases.find(r => String(r?.tag_name || '') === `v${version}`);
        const body = typeof match?.body === 'string' ? match.body.trim() : '';
        return body.length > 0 ? body : null;
    } catch {
        return null;
    }
}

function readBundledNotes(version: string): string | null {
    const filePath = path.join(app.getAppPath(), 'RELEASE_NOTES.md');
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }
    return extractVersionSection(content, version);
}

export function registerReleaseNotesHandlers(store: Store<any>): void {
    ipcMain.handle('release-notes:get', async (_event, version: string): Promise<ReleaseNotesResult> => {
        const safeVersion = String(version || '').trim();
        if (!safeVersion) return { source: 'none', markdown: null };

        const fromGithub = await fetchFromGitHub(safeVersion);
        if (fromGithub) return { source: 'github', markdown: fromGithub };

        const fromBundled = readBundledNotes(safeVersion);
        if (fromBundled) return { source: 'bundled', markdown: fromBundled };

        return { source: 'none', markdown: null };
    });

    ipcMain.handle('release-notes:get-last-seen', async (): Promise<string | null> => {
        const v = store.get('lastSeenVersion');
        return typeof v === 'string' && v.length > 0 ? v : null;
    });

    ipcMain.handle('release-notes:set-last-seen', async (_event, version: string): Promise<void> => {
        if (typeof version === 'string' && version.length > 0) {
            store.set('lastSeenVersion', version);
        }
    });
}
