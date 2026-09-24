import { describe, it, expect } from 'vitest';
import { resolveAccentId, DEFAULT_ACCENT_ID } from '../../src/renderer/themes/accents';

// The main process persists whatever it is handed. Review Focus 5: a
// persisted id that is no longer an official accent must not leave the app
// with data-axi-accent set to a dead id, and therefore no accent at all.
describe('the persisted accent id', () => {
    const readFromStore = (raw: unknown) => resolveAccentId(raw);

    it('survives a round trip for every official accent', () => {
        expect(readFromStore('violet-purple')).toBe('violet-purple');
    });

    it('degrades to the default when the stored id is no longer official', () => {
        expect(readFromStore('retired-accent')).toBe(DEFAULT_ACCENT_ID);
    });

    it('degrades to the default when the store holds a non-string', () => {
        expect(readFromStore(0)).toBe(DEFAULT_ACCENT_ID);
        expect(readFromStore(null)).toBe(DEFAULT_ACCENT_ID);
    });
});
