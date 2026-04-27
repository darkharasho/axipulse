import { describe, it, expect } from 'vitest';
import { compareVersions, extractAllVersions, extractVersionRange, extractVersionSection } from '../../src/main/releaseNotesParser';

const SAMPLE = `# Release Notes

Version v0.1.15 — April 26, 2026

## Boon Performance

Some text.

- Bullet 1
- Bullet 2

Version v0.1.14 — April 21, 2026

## Other thing

More text.

Version v0.1.13 — April 18, 2026

Old release.
`;

describe('extractVersionSection', () => {
    it('returns the section for the requested version, stripping the header line', () => {
        const result = extractVersionSection(SAMPLE, '0.1.15');
        expect(result).toBe('## Boon Performance\n\nSome text.\n\n- Bullet 1\n- Bullet 2');
    });

    it('returns the middle section bounded by the next Version header', () => {
        const result = extractVersionSection(SAMPLE, '0.1.14');
        expect(result).toBe('## Other thing\n\nMore text.');
    });

    it('returns the trailing section with no following Version header', () => {
        const result = extractVersionSection(SAMPLE, '0.1.13');
        expect(result).toBe('Old release.');
    });

    it('returns null when the version is absent', () => {
        const result = extractVersionSection(SAMPLE, '0.9.99');
        expect(result).toBeNull();
    });

    it('returns null when the document is empty', () => {
        expect(extractVersionSection('', '0.1.0')).toBeNull();
    });

    it('escapes regex metacharacters in the version string', () => {
        const result = extractVersionSection(SAMPLE, '0.1.15.*');
        expect(result).toBeNull();
    });
});

describe('compareVersions', () => {
    it('compares numeric components correctly', () => {
        expect(compareVersions('0.1.15', '0.1.10')).toBe(1);
        expect(compareVersions('0.1.10', '0.1.15')).toBe(-1);
        expect(compareVersions('0.1.15', '0.1.15')).toBe(0);
        expect(compareVersions('0.2.0', '0.1.99')).toBe(1);
        expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
    });

    it('treats missing components as zero', () => {
        expect(compareVersions('0.1', '0.1.0')).toBe(0);
        expect(compareVersions('0.1.1', '0.1')).toBe(1);
    });
});

describe('extractAllVersions', () => {
    it('parses every version section in document order', () => {
        const all = extractAllVersions(SAMPLE);
        expect(all.map(e => e.version)).toEqual(['0.1.15', '0.1.14', '0.1.13']);
        expect(all[0].header).toBe('Version v0.1.15 — April 26, 2026');
        expect(all[0].body).toBe('## Boon Performance\n\nSome text.\n\n- Bullet 1\n- Bullet 2');
    });

    it('returns empty array for empty input', () => {
        expect(extractAllVersions('')).toEqual([]);
    });
});

describe('extractVersionRange', () => {
    it('returns versions in (lower, upper] range, newest-first', () => {
        const range = extractVersionRange(SAMPLE, '0.1.13', '0.1.15');
        expect(range.map(e => e.version)).toEqual(['0.1.15', '0.1.14']);
    });

    it('treats null lower bound as "everything up to upper"', () => {
        const range = extractVersionRange(SAMPLE, null, '0.1.14');
        expect(range.map(e => e.version)).toEqual(['0.1.14', '0.1.13']);
    });

    it('returns empty when no versions are in range', () => {
        const range = extractVersionRange(SAMPLE, '0.1.15', '0.1.15');
        expect(range).toEqual([]);
    });

    it('excludes versions newer than upper', () => {
        const range = extractVersionRange(SAMPLE, '0.1.10', '0.1.14');
        expect(range.map(e => e.version)).toEqual(['0.1.14', '0.1.13']);
    });
});
