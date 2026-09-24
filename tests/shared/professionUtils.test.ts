import { describe, it, expect } from 'vitest';
import { getProfessionBase, getProfessionColor } from '../../src/shared/professionUtils';

describe('getProfessionBase', () => {
    it('maps an elite spec to its base profession', () => {
        expect(getProfessionBase('Firebrand')).toBe('Guardian');
        expect(getProfessionBase('Harbinger')).toBe('Necromancer');
        expect(getProfessionBase('Galeshot')).toBe('Ranger');
    });

    it('passes a base profession through', () => {
        expect(getProfessionBase('Warrior')).toBe('Warrior');
    });

    it('returns Unknown for an empty name', () => {
        expect(getProfessionBase('')).toBe('Unknown');
    });
});

describe('getProfessionColor', () => {
    it('returns the base profession token, shared across its specs', () => {
        expect(getProfessionColor('Guardian')).toBe('var(--axi-series-prof-guardian)');
        expect(getProfessionColor('Firebrand')).toBe('var(--axi-series-prof-guardian)');
        expect(getProfessionColor('Willbender')).toBe('var(--axi-series-prof-guardian)');
        expect(getProfessionColor('Necromancer')).toBe('var(--axi-series-prof-necromancer)');
        expect(getProfessionColor('Scourge')).toBe('var(--axi-series-prof-necromancer)');
    });

    it('returns a token for every one of the ten bases', () => {
        const bases = ['Guardian', 'Revenant', 'Warrior', 'Engineer', 'Ranger',
            'Thief', 'Elementalist', 'Mesmer', 'Necromancer', 'Unknown'];
        for (const b of bases) {
            expect(getProfessionColor(b)).toBe(`var(--axi-series-prof-${b.toLowerCase()})`);
        }
    });

    // Review Focus 2: a future elite spec, or an empty string, must not
    // produce `var(--axi-series-prof-)`, which computes to nothing and
    // renders black.
    it('falls back to the Unknown token for an unrecognised profession', () => {
        expect(getProfessionColor('Necrodancer')).toBe('var(--axi-series-prof-unknown)');
        expect(getProfessionColor('')).toBe('var(--axi-series-prof-unknown)');
        expect(getProfessionColor(undefined as unknown as string)).toBe('var(--axi-series-prof-unknown)');
    });
});
