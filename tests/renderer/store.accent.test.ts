import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_ACCENT_ID } from '../../src/renderer/themes/accents';
import { ACCENT_STORAGE_KEY } from '../../src/renderer/themes/applyTheme';

// The accent is the one setting here a user genuinely loses if the wiring is
// wrong: a bad id would leave <html> with no data-axi-accent, and the app
// with no accent at all. These pin the whole round trip through the store,
// which is what src/renderer/views/SettingsView.tsx and (later) the chart in
// BoonPerformanceChart.tsx actually read - not just resolveAccentId in
// isolation (tests/renderer/accents.test.ts already covers that).

function stubDom(initialStoredAccentId?: string) {
    const backing = new Map<string, string>();
    if (initialStoredAccentId !== undefined) backing.set(ACCENT_STORAGE_KEY, initialStoredAccentId);
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => backing.get(k) ?? null,
        setItem: (k: string, v: string) => void backing.set(k, v),
    });
    vi.stubGlobal('document', {
        documentElement: {
            _attrs: {} as Record<string, string>,
            classList: { add() {}, remove() {} },
            setAttribute(k: string, v: string) { this._attrs[k] = v; },
            getAttribute(k: string) { return this._attrs[k] ?? null; },
        },
    });
}

describe('useAppStore accent persistence', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetModules();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('initialises accentId from the stored mirror on first render, before getSettings() resolves', async () => {
        stubDom('rose-pink');
        const { useAppStore } = await import('../../src/renderer/store');
        expect(useAppStore.getState().accentId).toBe('rose-pink');
    });

    it('degrades a stale stored id to the default on first render rather than booting with no accent', async () => {
        stubDom('retired-accent');
        const { useAppStore } = await import('../../src/renderer/store');
        expect(useAppStore.getState().accentId).toBe(DEFAULT_ACCENT_ID);
    });

    it('has no stale mirror on a first-ever launch', async () => {
        stubDom(undefined);
        const { useAppStore } = await import('../../src/renderer/store');
        expect(useAppStore.getState().accentId).toBe(DEFAULT_ACCENT_ID);
    });

    it('setAccentId resolves the id, updates the store, and sets data-axi-accent on <html>', async () => {
        stubDom();
        const { useAppStore } = await import('../../src/renderer/store');
        useAppStore.getState().setAccentId('teal-ocean');
        expect(useAppStore.getState().accentId).toBe('teal-ocean');
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('teal-ocean');
        expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('teal-ocean');
    });

    it('setAccentId with a dead id degrades to the default rather than leaving no accent at all', async () => {
        stubDom();
        const { useAppStore } = await import('../../src/renderer/store');
        useAppStore.getState().setAccentId('retired-accent');
        expect(useAppStore.getState().accentId).toBe(DEFAULT_ACCENT_ID);
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe(DEFAULT_ACCENT_ID);
    });
});
