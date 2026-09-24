import { resolveAccentId } from './accents';

export const ACCENT_STORAGE_KEY = 'axipulse.accentId';

let transitionTimer: ReturnType<typeof setTimeout> | null = null;

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

    root.classList.add('theme-transitioning');
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        root.classList.remove('theme-transitioning');
        transitionTimer = null;
    }, 500);

    root.setAttribute('data-axi-accent', id);

    // Storage can be disabled; the accent still applied, so swallow.
    try {
        localStorage.setItem(ACCENT_STORAGE_KEY, id);
    } catch {
        /* the mirror is a cache, not the source of truth */
    }

    return id;
}
