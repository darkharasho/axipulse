function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractVersionSection(markdown: string, version: string): string | null {
    if (!markdown) return null;

    const headerPattern = new RegExp(`^Version v${escapeRegex(version)}\\b.*$`, 'm');
    const headerMatch = headerPattern.exec(markdown);
    if (!headerMatch) return null;

    const start = headerMatch.index + headerMatch[0].length;
    const rest = markdown.slice(start);

    const nextHeader = /^Version v\d/m.exec(rest);
    const sliced = nextHeader ? rest.slice(0, nextHeader.index) : rest;
    const trimmed = sliced.trim();

    return trimmed.length > 0 ? trimmed : null;
}

/** Compare dotted-numeric version strings. Returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0);
    const pb = b.split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da > db) return 1;
        if (da < db) return -1;
    }
    return 0;
}

export interface ParsedVersionEntry {
    version: string;
    header: string;
    body: string;
}

/**
 * Extract every `Version v<x>` section from a release-notes document.
 * Returned in document order (typically newest-first since that's how the
 * file is structured).
 */
export function extractAllVersions(markdown: string): ParsedVersionEntry[] {
    if (!markdown) return [];
    const headerRegex = /^Version v(\d[\w.\-+]*)\b.*$/gm;
    const matches: { version: string; header: string; index: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = headerRegex.exec(markdown)) !== null) {
        matches.push({ version: m[1], header: m[0], index: m.index });
    }
    const out: ParsedVersionEntry[] = [];
    for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const next = matches[i + 1];
        const start = cur.index + cur.header.length;
        const end = next ? next.index : markdown.length;
        const body = markdown.slice(start, end).trim();
        out.push({ version: cur.version, header: cur.header, body });
    }
    return out;
}

/**
 * Return all versions in the range `(exclusiveLower, inclusiveUpper]`,
 * newest-first. If `exclusiveLower` is null, only the inclusive-upper section is returned.
 */
export function extractVersionRange(
    markdown: string,
    exclusiveLower: string | null,
    inclusiveUpper: string,
): ParsedVersionEntry[] {
    const all = extractAllVersions(markdown);
    const filtered = all.filter(entry => {
        if (compareVersions(entry.version, inclusiveUpper) > 0) return false;
        if (exclusiveLower !== null && compareVersions(entry.version, exclusiveLower) <= 0) return false;
        return true;
    });
    filtered.sort((a, b) => compareVersions(b.version, a.version));
    return filtered;
}
