import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The renderer suite runs in the node environment, so the two browser globals
// this module touches are stubbed here rather than pulling in jsdom.
type FakeRoot = {
    attrs: Record<string, string>;
    classes: Set<string>;
    setAttribute: (k: string, v: string) => void;
    removeAttribute: (k: string) => void;
    classList: { add: (c: string) => void; remove: (c: string) => void };
};

function fakeRoot(): FakeRoot {
    const attrs: Record<string, string> = {};
    const classes = new Set<string>();
    return {
        attrs,
        classes,
        setAttribute: (k, v) => { attrs[k] = v; },
        removeAttribute: (k) => { delete attrs[k]; },
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    };
}

let root: FakeRoot;
let store: Map<string, string>;

beforeEach(() => {
    vi.resetModules();
    root = fakeRoot();
    store = new Map();
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

async function load() {
    return import('../../src/renderer/themes/applyTheme');
}

describe('resolveSurfaceId', () => {
    it('defaults to the language itself', async () => {
        const { resolveSurfaceId, DEFAULT_SURFACE_ID } = await load();
        expect(DEFAULT_SURFACE_ID).toBe('axi');
        expect(resolveSurfaceId(null)).toBe('axi');
        expect(resolveSurfaceId(undefined)).toBe('axi');
    });

    it('passes through the ids the design language defines', async () => {
        const { resolveSurfaceId } = await load();
        expect(resolveSurfaceId('axi')).toBe('axi');
        expect(resolveSurfaceId('flat')).toBe('flat');
        expect(resolveSurfaceId('glass')).toBe('glass');
    });

    it('falls back to axi for anything else, including inherited names and non-strings', async () => {
        const { resolveSurfaceId } = await load();
        expect(resolveSurfaceId('frosted')).toBe('axi');
        expect(resolveSurfaceId('')).toBe('axi');
        expect(resolveSurfaceId('constructor')).toBe('axi');
        expect(resolveSurfaceId('__proto__')).toBe('axi');
        expect(resolveSurfaceId('toString')).toBe('axi');
        expect(resolveSurfaceId(42)).toBe('axi');
        expect(resolveSurfaceId({})).toBe('axi');
    });
});

describe('readStoredSurfaceId', () => {
    it('is undefined when the mirror is empty, so the store decides', async () => {
        const { readStoredSurfaceId } = await load();
        expect(readStoredSurfaceId()).toBeUndefined();
    });

    it('reads back a mirrored surface', async () => {
        store.set('axipulse.surfaceId', 'glass');
        const { readStoredSurfaceId } = await load();
        expect(readStoredSurfaceId()).toBe('glass');
    });

    // Review Focus 1
    it('is undefined when storage is unavailable', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('storage disabled'); },
            setItem: () => { throw new Error('storage disabled'); },
        });
        const { readStoredSurfaceId } = await load();
        expect(readStoredSurfaceId()).toBeUndefined();
    });
});

describe('applySurface', () => {
    it('puts a theme on <html> and mirrors it', async () => {
        const { applySurface } = await load();
        expect(applySurface('glass')).toBe('glass');
        expect(root.attrs['data-axi-theme']).toBe('glass');
        expect(store.get('axipulse.surfaceId')).toBe('glass');
    });

    it('treats flat as a theme like any other', async () => {
        const { applySurface } = await load();
        expect(applySurface('flat')).toBe('flat');
        expect(root.attrs['data-axi-theme']).toBe('flat');
    });

    it('removes the attribute for axi rather than naming the language', async () => {
        const { applySurface } = await load();
        applySurface('glass');
        expect(applySurface('axi')).toBe('axi');
        expect(root.attrs['data-axi-theme']).toBeUndefined();
        expect(store.get('axipulse.surfaceId')).toBe('axi');
    });

    it('crossfades so the whole app repaints together', async () => {
        const { applySurface } = await load();
        applySurface('glass');
        expect(root.classes.has('theme-transitioning')).toBe(true);
    });

    // Review Focus 1
    it('still applies the surface when storage is unavailable', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => null,
            setItem: () => { throw new Error('storage disabled'); },
        });
        const { applySurface } = await load();
        expect(applySurface('glass')).toBe('glass');
        expect(root.attrs['data-axi-theme']).toBe('glass');
    });

    // Review Focus 5 — the store wins over a stale mirror, and the write-through
    // updates the mirror so the next boot agrees.
    it('overwrites a stale mirror when the store answers with something else', async () => {
        store.set('axipulse.surfaceId', 'glass');
        const { readStoredSurfaceId, applySurface } = await load();
        expect(readStoredSurfaceId()).toBe('glass');
        applySurface('flat');
        expect(root.attrs['data-axi-theme']).toBe('flat');
        expect(store.get('axipulse.surfaceId')).toBe('flat');
    });
});
