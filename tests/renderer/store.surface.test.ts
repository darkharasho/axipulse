import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_SURFACE_ID, SURFACE_STORAGE_KEY } from '../../src/renderer/themes/applyTheme';

// Mirrors tests/renderer/store.accent.test.ts: the surface rides the same
// electron-store-is-truth / localStorage-is-boot-mirror architecture as the
// accent, wired through the same store. These pin the round trip through
// useAppStore, not just resolveSurfaceId/applySurface in isolation
// (tests/renderer/surface.test.ts already covers those).

function stubDom(initialStoredSurfaceId?: string) {
    const backing = new Map<string, string>();
    if (initialStoredSurfaceId !== undefined) backing.set(SURFACE_STORAGE_KEY, initialStoredSurfaceId);
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
            removeAttribute(k: string) { delete this._attrs[k]; },
        },
    });
}

describe('useAppStore surface persistence', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.resetModules();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('initialises surfaceId from the stored mirror on first render, before getSettings() resolves', async () => {
        stubDom('glass');
        const { useAppStore } = await import('../../src/renderer/store');
        expect(useAppStore.getState().surfaceId).toBe('glass');
    });

    it('degrades a stale stored id to the default on first render rather than booting with a dead theme', async () => {
        stubDom('frosted');
        const { useAppStore } = await import('../../src/renderer/store');
        expect(useAppStore.getState().surfaceId).toBe(DEFAULT_SURFACE_ID);
    });

    it('has no stale mirror on a first-ever launch', async () => {
        stubDom(undefined);
        const { useAppStore } = await import('../../src/renderer/store');
        expect(useAppStore.getState().surfaceId).toBe(DEFAULT_SURFACE_ID);
    });

    it('setSurfaceId resolves the id, updates the store, and sets data-axi-theme on <html>', async () => {
        stubDom();
        const { useAppStore } = await import('../../src/renderer/store');
        useAppStore.getState().setSurfaceId('glass');
        expect(useAppStore.getState().surfaceId).toBe('glass');
        expect(document.documentElement.getAttribute('data-axi-theme')).toBe('glass');
        expect(localStorage.getItem(SURFACE_STORAGE_KEY)).toBe('glass');
    });

    it('setSurfaceId with a dead id degrades to the default rather than leaving a stale attribute', async () => {
        stubDom();
        const { useAppStore } = await import('../../src/renderer/store');
        useAppStore.getState().setSurfaceId('glass');
        useAppStore.getState().setSurfaceId('frosted');
        expect(useAppStore.getState().surfaceId).toBe(DEFAULT_SURFACE_ID);
        expect(document.documentElement.getAttribute('data-axi-theme')).toBeNull();
    });
});
