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
