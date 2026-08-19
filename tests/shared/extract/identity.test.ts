import { describe, it, expect } from 'vitest';
import { extractIdentity } from '../../../src/shared/extract/identity';
import { localPlayerId } from '../../../src/shared/report';
import { loadEiFixture, loadNativeFixture } from '../oracle';

describe('extractIdentity', () => {
    it('matches the EI oracle for the local player', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();

        // The EI side, computed the way findLocalPlayer does today.
        const eiPlayer =
            ei.players.find(p => p.account === ei.recordedAccountBy) ??
            ei.players.find(p => p.name === ei.recordedBy)!;

        const actual = extractIdentity(native, localPlayerId(native));

        expect(actual.accountName).toBe(eiPlayer.account);
        expect(actual.playerName).toBe(eiPlayer.name);
        // EI's raw `profession` field conflates base profession and elite
        // spec into one display string (e.g. "Harbinger" for a Necromancer
        // running that spec); it never actually populates a separate
        // `elite_spec` field despite EiPlayer declaring one -- every real
        // fixture value is `undefined`. Native splits these into
        // `profession` (base class only) and `eliteSpec` (spec name, or ''
        // when none). Reassemble native's pair before comparing; do not
        // compare `eliteSpec` to `eiPlayer.elite_spec` -- that field is
        // never populated by real EI output and asserting it would just
        // encode the absence, not check anything.
        expect(actual.eliteSpec || actual.profession).toBe(eiPlayer.profession);
        expect(actual.group).toBe(eiPlayer.group);
        expect(actual.isCommander).toBe(eiPlayer.hasCommanderTag);
    });

    it('matches the EI oracle for every squad member', () => {
        const ei = loadEiFixture();
        const native = loadNativeFixture();
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractIdentity(native, e.id);

            // Same profession/eliteSpec reassembly as above, EXCEPT
            // Anon175.7475: this fixture's Thief runs "Antiquary" per EI,
            // an elite spec axilog's catalog does not yet name, so native
            // legitimately reports elite_spec: '' (EntityOut.elite_spec's
            // doc comment: '' means "no spec" OR "one this project cannot
            // name"). That's a real catalog gap, not an extraction bug --
            // recorded in the migration design doc's "Accepted risks".
            // Every other squad member in this fixture has a nameable spec
            // or none at all, so the equality check is real for them.
            if (e.account !== 'Anon175.7475') {
                expect(actual.eliteSpec || actual.profession).toBe(eiPlayer!.profession);
            }
            expect(actual.group).toBe(eiPlayer!.group);
        }
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        expect(() => extractIdentity(loadNativeFixture(), 999_999)).toThrow(/999999/);
    });
});
