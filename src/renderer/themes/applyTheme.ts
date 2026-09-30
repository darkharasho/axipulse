import { resolveAccentId } from './accents';

export const ACCENT_STORAGE_KEY = 'axipulse.accentId';

// The surface rides alongside the accent and for the same reason: electron-store
// is the source of truth but getSettings() resolves after first paint, so a
// synchronous mirror is what stops a non-default surface flashing on launch.
export const SURFACE_STORAGE_KEY = 'axipulse.surfaceId';

export type SurfaceId = 'axi' | 'flat' | 'glass';

/** 'axi' is the language itself, drawn with no `data-axi-theme` at all. 'flat'
 *  and 'glass' are repaints of it shipped as
 *  `@axiapps/axi-design/themes/<id>.css`. */
export const SURFACES: { id: SurfaceId; label: string }[] = [
    { id: 'axi', label: 'Axi' },
    { id: 'flat', label: 'Flat' },
    { id: 'glass', label: 'Glass' },
];

/** AxiPulse has always been drawn in the language itself, so that stays the default. */
export const DEFAULT_SURFACE_ID: SurfaceId = 'axi';

let transitionTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Holds the crossfade class on <html> for the length of the transition so the
 * whole app changes together. Shared by the accent and the surface: changing
 * both at once should still be one fade, so the timer is not per-attribute.
 */
function crossfade(root: Element): void {
    root.classList.add('theme-transitioning');
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        root.classList.remove('theme-transitioning');
        transitionTimer = null;
    }, 500);
}

// electron-store is the source of truth, but getSettings() is async and
// resolves after first paint. This mirror is read synchronously at bootstrap
// so a non-default accent does not flash emerald on every launch.
export function readStoredAccentId(): string | undefined {
    try {
        return localStorage.getItem(ACCENT_STORAGE_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

export function applyTheme(themeId?: unknown): string {
    const id = resolveAccentId(themeId);
    const root = document.documentElement;

    crossfade(root);

    root.setAttribute('data-axi-accent', id);

    // Storage can be disabled; the accent still applied, so swallow.
    try {
        localStorage.setItem(ACCENT_STORAGE_KEY, id);
    } catch {
        /* the mirror is a cache, not the source of truth */
    }

    return id;
}

/** Always returns one of the three ids. Membership is tested against the array
 *  rather than an object, so inherited property names are unknown values like
 *  any other. */
export function resolveSurfaceId(id?: unknown): SurfaceId {
    return SURFACES.some((s) => s.id === id) ? (id as SurfaceId) : DEFAULT_SURFACE_ID;
}

export function readStoredSurfaceId(): string | undefined {
    try {
        return localStorage.getItem(SURFACE_STORAGE_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

/**
 * Puts a surface on <html> and mirrors it. 'axi' removes the attribute rather
 * than naming itself: the language is not a theme layered over itself, and
 * axi-design's own rule is that removing `data-axi-theme` leaves you back on it
 * unchanged.
 */
export function applySurface(surfaceId?: unknown): SurfaceId {
    const id = resolveSurfaceId(surfaceId);
    const root = document.documentElement;

    crossfade(root);

    if (id === 'axi') root.removeAttribute('data-axi-theme');
    else root.setAttribute('data-axi-theme', id);

    try {
        localStorage.setItem(SURFACE_STORAGE_KEY, id);
    } catch {
        /* the mirror is a cache, not the source of truth */
    }

    return id;
}
