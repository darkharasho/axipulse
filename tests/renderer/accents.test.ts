import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT_ID, resolveAccentId } from '../../src/renderer/themes/accents';
import { applyTheme, readStoredAccentId, ACCENT_STORAGE_KEY } from '../../src/renderer/themes/applyTheme';

describe('the accent list', () => {
    it('is the eleven official accents', () => {
        expect(ACCENTS).toHaveLength(11);
        expect(ACCENTS.map((a) => a.id)).toContain('emerald-mint');
        expect(ACCENTS[0].id).toBe('axi-gold');
    });

    it('gives every accent an id, a label and a hex', () => {
        for (const a of ACCENTS) {
            expect(typeof a.id).toBe('string');
            expect(typeof a.label).toBe('string');
            expect(a.hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
});

describe('resolveAccentId', () => {
    it('passes every official id through unchanged', () => {
        for (const a of ACCENTS) {
            expect(resolveAccentId(a.id)).toBe(a.id);
        }
    });

    it('defaults to emerald-mint', () => {
        expect(DEFAULT_ACCENT_ID).toBe('emerald-mint');
        expect(resolveAccentId(undefined)).toBe(DEFAULT_ACCENT_ID);
    });

    // Review Focus 1: electron-store and localStorage both hand back
    // unvalidated data. Anything that is not an official id is the default.
    it('falls back for unknown, empty and non-string input', () => {
        expect(resolveAccentId('garbage')).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId('')).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId(null)).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId(42)).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId({ id: 'teal-ocean' })).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId(['teal-ocean'])).toBe(DEFAULT_ACCENT_ID);
    });
});

describe('applyTheme', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
        });
        vi.stubGlobal('document', {
            documentElement: {
                _attrs: {} as Record<string, string>,
                classList: { add() {}, remove() {} },
                setAttribute(k: string, v: string) { this._attrs[k] = v; },
                getAttribute(k: string) { return this._attrs[k] ?? null; },
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('sets data-axi-accent on the root element', () => {
        expect(applyTheme('teal-ocean')).toBe('teal-ocean');
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('teal-ocean');
    });

    it('resolves before applying, so a dead id never reaches the DOM', () => {
        expect(applyTheme('garbage')).toBe(DEFAULT_ACCENT_ID);
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe(DEFAULT_ACCENT_ID);
    });

    it('mirrors the resolved id to localStorage for the next cold start', () => {
        applyTheme('rose-pink');
        expect(readStoredAccentId()).toBe('rose-pink');
        expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('rose-pink');
    });

    // Review Focus 4: applyTheme runs at bootstrap, before any error
    // boundary exists. A storage throw there is a white window.
    it('still applies the accent when localStorage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('storage disabled'); },
            setItem: () => { throw new Error('storage disabled'); },
        });
        expect(() => applyTheme('violet-purple')).not.toThrow();
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('violet-purple');
        expect(readStoredAccentId()).toBeUndefined();
    });
});
