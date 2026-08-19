import { describe, it, expect } from 'vitest';
import { loadEiFixture, loadNativeFixture } from './oracle';

describe('oracle fixtures', () => {
    it('describe the same fight', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        // Durations come from different engines; allow one polling tick.
        expect(Math.abs(native.encounter.duration_ms - ei.durationMS)).toBeLessThan(1000);
    });

    it('agree on the squad roster', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        const eiAccounts = new Set(
            ei.players.filter(p => !p.isFake && !p.notInSquad).map(p => p.account),
        );
        const nativeAccounts = new Set(
            native.entities.filter(e => e.role === 'squad').map(e => e.account!),
        );
        expect([...nativeAccounts].sort()).toEqual([...eiAccounts].sort());
    });

    it('resolve the local player to an entity id', () => {
        const native = loadNativeFixture();
        expect(typeof native.encounter.recorded_by).toBe('number');
    });
});
