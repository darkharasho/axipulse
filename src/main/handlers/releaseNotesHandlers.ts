import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type Store from 'electron-store';
import {
    compareVersions,
    extractVersionRange,
    extractVersionSection,
} from '../releaseNotesParser';

const RELEASES_URL = 'https://api.github.com/repos/darkharasho/axipulse/releases';

export type ReleaseNotesSource = 'github' | 'bundled' | 'none';

export interface ReleaseNotesResult {
    source: ReleaseNotesSource;
    markdown: string | null;
}

interface GitHubRelease {
    tag_name?: string;
    name?: string;
    body?: string;
    published_at?: string;
}

function tagToVersion(tag: string): string | null {
    const m = /^v?(\d[\w.\-+]*)$/.exec(tag);
    return m ? m[1] : null;
}

async function fetchAllReleases(): Promise<GitHubRelease[] | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(RELEASES_URL, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'axipulse' },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const releases = await res.json() as GitHubRelease[];
        return Array.isArray(releases) ? releases : null;
    } catch {
        return null;
    }
}

function joinEntries(entries: Array<{ header: string; body: string }>): string | null {
    const parts = entries
        .filter(e => e.body && e.body.trim().length > 0)
        .map(e => `${e.header}\n\n${e.body.trim()}`);
    if (parts.length === 0) return null;
    return parts.join('\n\n---\n\n');
}

async function buildFromGitHub(
    currentVersion: string,
    lastSeenVersion: string | null,
): Promise<string | null> {
    const releases = await fetchAllReleases();
    if (!releases || releases.length === 0) return null;

    const candidates = releases
        .map(r => {
            const tag = String(r?.tag_name || '');
            const version = tagToVersion(tag);
            if (!version) return null;
            const body = typeof r.body === 'string' ? r.body.trim() : '';
            if (!body) return null;
            return { version, body };
        })
        .filter((r): r is { version: string; body: string } => r !== null);

    const inRange = lastSeenVersion === null
        ? candidates.filter(r => compareVersions(r.version, currentVersion) === 0)
        : candidates.filter(r =>
            compareVersions(r.version, currentVersion) <= 0
            && compareVersions(r.version, lastSeenVersion) > 0);

    inRange.sort((a, b) => compareVersions(b.version, a.version));

    if (inRange.length === 0) return null;

    const entries = inRange.map(r => ({
        header: `## Version v${r.version}`,
        body: r.body,
    }));
    return joinEntries(entries);
}

function buildFromBundled(
    currentVersion: string,
    lastSeenVersion: string | null,
): string | null {
    const filePath = path.join(app.getAppPath(), 'RELEASE_NOTES.md');
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }

    if (lastSeenVersion === null) {
        const single = extractVersionSection(content, currentVersion);
        if (!single) return null;
        return `## Version v${currentVersion}\n\n${single}`;
    }

    const entries = extractVersionRange(content, lastSeenVersion, currentVersion).map(e => ({
        header: `## Version v${e.version}`,
        body: e.body,
    }));
    if (entries.length === 0) return null;
    return joinEntries(entries);
}

export function registerReleaseNotesHandlers(store: Store<any>): void {
    ipcMain.handle(
        'release-notes:get',
        async (
            _event,
            version: string,
            lastSeenVersion: string | null = null,
        ): Promise<ReleaseNotesResult> => {
            const safeVersion = String(version || '').trim();
            if (!safeVersion) return { source: 'none', markdown: null };

            const safeLastSeen = typeof lastSeenVersion === 'string' && lastSeenVersion.length > 0
                ? lastSeenVersion
                : null;

            const fromGithub = await buildFromGitHub(safeVersion, safeLastSeen);
            if (fromGithub) return { source: 'github', markdown: fromGithub };

            const fromBundled = buildFromBundled(safeVersion, safeLastSeen);
            if (fromBundled) return { source: 'bundled', markdown: fromBundled };

            return { source: 'none', markdown: null };
        },
    );

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
