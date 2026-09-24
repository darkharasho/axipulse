import accentsJson from '@axiapps/axi-design/accents.json';

export type AccentDefinition = { id: string; label: string; hex: string };

export const ACCENTS: AccentDefinition[] = accentsJson as AccentDefinition[];

export const DEFAULT_ACCENT_ID = 'emerald-mint';

// AxiPulse has never persisted a theme id, so unlike AxiAM there is no
// legacy-id map to carry. Anything that is not an official accent - a
// hand-edited config, a stale id from a future accents.json, a non-string
// out of localStorage - resolves to the default rather than reaching
// setAttribute, where a dead id would leave the app with no accent at all.
export function resolveAccentId(id?: unknown): string {
    if (typeof id === 'string' && ACCENTS.some((a) => a.id === id)) return id;
    return DEFAULT_ACCENT_ID;
}
