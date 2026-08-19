import { describe, it, expect } from 'vitest';
import { extractIdentity } from '../../../src/shared/extract/identity';
import { localPlayerId } from '../../../src/shared/report';
import type { ReportV1 } from '../../../src/shared/report';
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
        const catalogGaps: string[] = [];
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const eiPlayer = ei.players.find(p => p.account === e.account);
            expect(eiPlayer, `no EI player for ${e.account}`).toBeDefined();
            const actual = extractIdentity(native, e.id);

            // axilog's catalog cannot name every elite spec, and
            // EntityOut.elite_spec's doc comment says '' means "no spec" OR
            // "one this project cannot name". Detect that case by what it
            // actually is -- native reports no spec while EI still names one,
            // so EI's conflated profession disagrees with native's base class
            // -- rather than by hardcoding whichever account happens to hit it
            // in today's fixture. Collect them instead of skipping silently,
            // so the assertion below reports how wide the gap is.
            const unnamedSpec =
                e.elite_spec === '' && eiPlayer!.profession !== e.profession;
            if (unnamedSpec) {
                catalogGaps.push(
                    `${e.account}: EI "${eiPlayer!.profession}" vs native "${e.profession}"`,
                );
            } else {
                expect(actual.eliteSpec || actual.profession).toBe(eiPlayer!.profession);
            }
            expect(actual.group).toBe(eiPlayer!.group);
        }

        // Pinned, not tolerated: if a regenerated fixture or an axilog catalog
        // update changes this set, the test fails and the gap gets re-examined
        // rather than quietly growing.
        expect(catalogGaps, 'axilog elite-spec catalog gaps among squad').toEqual([
            'Anon175.7475: EI "Antiquary" vs native "Thief"',
        ]);
    });

    it('throws on an unknown entity id rather than returning blanks', () => {
        expect(() => extractIdentity(loadNativeFixture(), 999_999))
            .toThrow('extractIdentity: no entity with id 999999');
    });

    describe('a missing identity field is an error, not a blank', () => {
        /** Drops one field from the local player's entity row on a shallow
         *  copy. The fixture itself is module-cached and shared. */
        function without(field: string): ReportV1 {
            const r = loadNativeFixture();
            const id = localPlayerId(r);
            return {
                ...r,
                entities: r.entities.map(e => {
                    if (e.id !== id) return e;
                    const copy: Record<string, unknown> = { ...e };
                    delete copy[field];
                    return copy;
                }),
            } as unknown as ReportV1;
        }

        // Measured on the fixture: all 46 squad members carry every one of
        // these, and `extractIdentity`'s only production caller passes
        // `localPlayerId(r)`, always a squad player. The `''`/`0` these
        // replace rendered a blank name or subgroup 0 as if measured.
        it.each(['account', 'profession', 'elite_spec', 'subgroup'])(
            'throws when the entity has no %s',
            (field) => {
                const r = loadNativeFixture();
                const id = localPlayerId(r);
                expect(() => extractIdentity(without(field), id))
                    .toThrow(`extractIdentity: entity ${id} has no \`${field}\``);
            },
        );

        it('throws when the entity has neither character nor name', () => {
            const r = loadNativeFixture();
            const id = localPlayerId(r);
            const noCharacter = without('character');
            // `name` is already absent for every squad member -- measured --
            // so dropping `character` leaves the entity nameless.
            expect(r.entities.find(e => e.id === id)!.name).toBeUndefined();
            expect(() => extractIdentity(noCharacter, id))
                .toThrow(`extractIdentity: entity ${id} has neither \`character\` nor \`name\``);
        });

        it('accepts an empty elite_spec, which means "no elite spec", not "absent"', () => {
            const r = loadNativeFixture();
            const coreSpec = r.entities.filter(e => e.role === 'squad' && e.elite_spec === '');
            expect(coreSpec.length).toBe(2);
            for (const e of coreSpec) expect(extractIdentity(r, e.id).eliteSpec).toBe('');
        });
    });
});
