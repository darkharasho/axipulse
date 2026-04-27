import { describe, it, expect } from 'vitest';
import { extractVersionSection } from '../../src/main/releaseNotesParser';

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
