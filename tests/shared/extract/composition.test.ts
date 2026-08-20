import { describe, it, expect } from 'vitest';
import { extractComposition, extractSquadContext } from '../../../src/shared/extract/composition';
import { localPlayerId } from '../../../src/shared/report';
import type { ReportV1 } from '../../../src/shared/report';
import type { EiJson, EiPlayer } from '../ei/types';
import { loadEiFixture, loadNativeFixture, accountOf } from '../oracle';

/** A shallow-cloned report with one surgical change, so a path the fixture
 *  cannot reach is still executed rather than left as untested dead code.
 *  Never mutates the memoized fixture. */
function edited(r: ReportV1, edit: (draft: any) => void): ReportV1 {
    const draft = {
        ...r,
        entities: structuredClone(r.entities),
        blocks: structuredClone(r.blocks),
    };
    edit(draft);
    return draft as ReportV1;
}

/* --- the EI side of every oracle below ----------------------------------- */

const eiSquad = (ei: EiJson): EiPlayer[] => ei.players.filter(p => !p.notInSquad && !p.isFake);
const eiAllies = (ei: EiJson): EiPlayer[] => ei.players.filter(p => p.notInSquad && !p.isFake);
const eiEnemies = (ei: EiJson) => ei.targets.filter(t => t.enemyPlayer && !t.isFake);

/** EI's WvW enemy targets have no `profession`; their NAME carries the
 *  elite spec (`"Tempest pl-3081"`), which is what the EI producer parsed
 *  out. Reproduced here so the class-count divergence is measured against
 *  what the app actually used to show, not against a different quantity. */
function eiEnemyClassKey(t: { name: string; profession?: string }): string {
    const key = t.profession || t.name.match(/^(.+?)\s+pl-\d+$/)?.[1];
    if (!key) throw new Error(`eiEnemyClassKey: cannot read a class from EI target "${t.name}"`);
    return key;
}

const eiDamage = (p: EiPlayer) => p.dpsAll[0]!.damage;
const eiDamageTaken = (p: EiPlayer) => p.defenses[0]!.damageTaken;
const eiStrips = (p: EiPlayer) => p.support[0]!.boonStrips;
const eiCleanses = (p: EiPlayer) => p.support[0]!.condiCleanse + p.support[0]!.condiCleanseSelf;

/** EI's `getDownContribution`, including its `totalDamageDist` fallback. */
function eiDownContribution(p: EiPlayer): number {
    const fromStatsAll = p.statsAll[0]?.downContribution ?? 0;
    if (fromStatsAll > 0) return fromStatsAll;
    let total = 0;
    for (const phase of p.totalDamageDist ?? []) {
        for (const entry of phase ?? []) total += entry.downContribution ?? 0;
    }
    return total;
}

/**
 * The EI counterpart of native's `healing.outgoing_allies`, established in
 * Task 5/6: EI's full outgoing total minus EI's own self-healing cell.
 * NOT `combatMetrics.getHealingOutput`, which sums the roster-limited
 * `outgoingHealingAllies` grid INCLUDING self and is a different quantity
 * (it disagrees with `outgoing_allies` on 15 of 46 members here).
 */
function eiAlliesHealing(ei: EiJson, account: string): number {
    const index = ei.players.findIndex(p => p.account === account);
    const p = ei.players[index]!;
    const total = (p.extHealingStats?.totalHealingDist?.[0] ?? [])
        .reduce((a, b) => a + b.totalHealing, 0);
    const self = (p.extHealingStats?.alliedHealingDist?.[index]?.[0] ?? [])
        .reduce((a, b) => a + b.totalHealing, 0);
    return total - self;
}

/** EI's `getSquadRank`: 1 + the count of strictly greater values. */
function eiRank(values: number[], mine: number): number {
    return 1 + values.filter(v => v > mine).length;
}

describe('extractComposition — populations', () => {
    /**
     * COUNTS ARE NOT AN ORACLE. Equal counts over different members is the
     * exact failure this test exists to catch, so every population is
     * compared by IDENTITY: accounts for the friendly side, arcdps instance
     * ids for the enemy side (EI anonymises enemies as
     * `"<spec> pl-<instanceID>"`, native as `"Anon<n>"` with the same
     * `instid`, so the id is the only stable join).
     */
    it('reproduces EI\'s squad/ally/enemy populations member for member', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();

        const nativeSquad = native.entities.filter(e => e.role === 'squad');
        expect(new Set(nativeSquad.map(e => e.account)))
            .toEqual(new Set(eiSquad(ei).map(p => p.account)));

        // The one non-squad friendly: EI anonymises the account itself
        // ("Non Squad Player 42"), so it joins on `instanceID`, not account.
        const nativeAllies = native.entities.filter(e => e.role === 'friendly_player');
        expect(nativeAllies.map(e => e.instid)).toEqual(eiAllies(ei).map(p => p.instanceID));

        const nativeEnemies = native.entities.filter(e => e.role === 'enemy_player');
        expect(new Set(nativeEnemies.map(e => e.instid)))
            .toEqual(new Set(eiEnemies(ei).map(t => t.instanceID)));

        const c = extractComposition(native);
        expect([c.squadCount, c.allyCount, c.enemyCount]).toEqual([46, 1, 46]);
    });

    /**
     * The EI producer had to filter enemies whose `teamID` matched a squad
     * member's, because `targets[].enemyPlayer` alone was not trustworthy.
     * `role` is, so that filter is deleted -- this pins the fact that makes
     * the deletion safe rather than assuming it.
     */
    it('never places an enemy on the squad\'s own team', () => {
        const native = loadNativeFixture();
        const squadTeams = new Set(native.entities.filter(e => e.role === 'squad').map(e => e.team));
        expect(squadTeams).toEqual(new Set(['blue']));
        const enemyTeams = new Set(native.entities.filter(e => e.role === 'enemy_player').map(e => e.team));
        expect(enemyTeams).toEqual(new Set(['green', 'red']));
    });
});

describe('extractComposition — teamBreakdown', () => {
    /**
     * The one deliberate output divergence: `teamId` is now axilog's team
     * COLOUR, not EI's stringified numeric team id. Both sides are pinned
     * here together with `encounter.teams`' colour<->id mapping, so the
     * substitution is a stated fact rather than an unexplained relabelling.
     * `FightCompositionCard` labels segments `Enemy T1..T3` positionally and
     * uses `teamId` only as a lookup/React key, so nothing user-visible
     * changes.
     */
    it('groups enemies by team colour, descending, capped at 3', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();

        const c = extractComposition(native);
        expect(c.teamBreakdown).toEqual([
            { teamId: 'green', count: 38 },
            { teamId: 'red', count: 8 },
        ]);

        // EI's equivalent, by numeric team id.
        const eiCounts = new Map<number, number>();
        for (const t of eiEnemies(ei)) {
            const id = (t.teamID ?? t.teamId)!;
            eiCounts.set(id, (eiCounts.get(id) ?? 0) + 1);
        }
        expect([...eiCounts.entries()].sort((a, b) => b[1] - a[1]))
            .toEqual([[2767, 38], [707, 8]]);

        // ... and the mapping that makes those the same two teams.
        const byColour = new Map(native.encounter.teams.map(t => [t.color, t.team_id]));
        expect(byColour.get('green')).toBe(2767);
        expect(byColour.get('red')).toBe(707);
        expect(byColour.get('blue')).toBe(433);
    });

    /**
     * Ties are broken by team name, NOT by entity order. The EI producer
     * sorted on count alone and let sort stability decide, which made a
     * tied breakdown a function of iteration order. Both orderings of the
     * same data must produce the same breakdown.
     */
    it('breaks equal team counts deterministically, independent of entity order', () => {
        const native = loadNativeFixture();
        const forward = edited(native, d => {
            d.entities = d.entities.filter((e: any) => e.role !== 'enemy_player').concat([
                { id: 900, role: 'enemy_player', profession: 'Warrior', elite_spec: 'Spellbreaker', team: 'red', agent_addr: 1, combat_participant: true },
                { id: 901, role: 'enemy_player', profession: 'Warrior', elite_spec: 'Spellbreaker', team: 'green', agent_addr: 2, combat_participant: true },
                { id: 902, role: 'enemy_player', profession: 'Warrior', elite_spec: 'Spellbreaker', team: 'blue', agent_addr: 3, combat_participant: true },
                { id: 903, role: 'enemy_player', profession: 'Warrior', elite_spec: 'Spellbreaker', team: 'aqua', agent_addr: 4, combat_participant: true },
            ]);
        });
        const reversed = edited(forward, d => { d.entities = d.entities.slice().reverse(); });

        const expected = [
            { teamId: 'aqua', count: 1 },
            { teamId: 'blue', count: 1 },
            { teamId: 'green', count: 1 },
        ];
        expect(extractComposition(forward).teamBreakdown).toEqual(expected);
        expect(extractComposition(reversed).teamBreakdown).toEqual(expected);
        // Capped at 3 even though four teams are present.
        expect(extractComposition(forward).enemyCount).toBe(4);
        expect(Object.keys(extractComposition(forward).enemyClassCountsByTeam).sort())
            .toEqual(['aqua', 'blue', 'green', 'red']);
    });
});

describe('extractComposition — class counts', () => {
    /**
     * axilog returns `elite_spec: ''` for eight of this log's 93 player
     * entities. This pins WHICH eight -- by account for squad members, by
     * `instid` for enemies (their accounts are not carried) -- so an
     * upstream fix or a further regression both fail loudly here rather
     * than being absorbed by a tolerance.
     */
    it('pins the eight player entities axilog cannot name a spec for', () => {
        const native = loadNativeFixture();
        const blank = native.entities
            .filter(e => e.profession !== undefined && e.elite_spec === '')
            .map(e => (e.role === 'squad' ? e.account : `${e.role}:${e.instid}`));
        expect(blank).toEqual([
            'Anon151.6587',
            'Anon175.7475',
            'enemy_player:4561',
            'enemy_player:4599',
            'enemy_player:4031',
            'enemy_player:5537',
            'enemy_player:5551',
            'enemy_player:5266',
        ]);
    });

    /**
     * The exact user-visible regression, per entity, on both sides. Seven of
     * the eight blank-spec entities land under their base profession where
     * EI named a spec; the eighth (Anon151.6587) agrees by coincidence --
     * EI also calls it "Ranger", because that player genuinely runs no elite
     * spec. Listing all of them, EI value beside native value, is what makes
     * this an oracle instead of a tolerance.
     */
    it('diverges from EI exactly on the specs axilog cannot name', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const c = extractComposition(native);

        const squadByAccount = new Map(
            native.entities.filter(e => e.role === 'squad').map(e => [e.account!, e]),
        );
        const squadDiffs = eiSquad(ei)
            .map(p => ({
                account: p.account,
                ei: p.elite_spec || p.profession,
                native: squadByAccount.get(p.account)!.elite_spec || squadByAccount.get(p.account)!.profession,
            }))
            .filter(d => d.ei !== d.native);
        expect(squadDiffs).toEqual([
            { account: 'Anon175.7475', ei: 'Antiquary', native: 'Thief' },
        ]);

        const enemyByInstid = new Map(
            native.entities.filter(e => e.role === 'enemy_player').map(e => [e.instid!, e]),
        );
        const enemyDiffs = eiEnemies(ei)
            .map(t => ({
                instid: t.instanceID,
                ei: eiEnemyClassKey(t),
                native: enemyByInstid.get(t.instanceID!)!.elite_spec || enemyByInstid.get(t.instanceID!)!.profession,
            }))
            .filter(d => d.ei !== d.native);
        expect(enemyDiffs).toEqual([
            { instid: 5537, ei: 'Galeshot', native: 'Ranger' },
            { instid: 4031, ei: 'Conduit', native: 'Revenant' },
            { instid: 4561, ei: 'Conduit', native: 'Revenant' },
            { instid: 4599, ei: 'Conduit', native: 'Revenant' },
            { instid: 5266, ei: 'Conduit', native: 'Revenant' },
            { instid: 5551, ei: 'Conduit', native: 'Revenant' },
        ]);

        // The consequence in the emitted counts, both directions.
        expect(c.squadClassCounts.Antiquary).toBeUndefined();
        expect(c.squadClassCounts.Thief).toBe(1);
        expect(c.enemyClassCountsByTeam.green.Conduit).toBeUndefined();
        expect(c.enemyClassCountsByTeam.green.Revenant).toBe(5);
        expect(c.enemyClassCountsByTeam.green.Galeshot).toBeUndefined();
        // The lone Galeshot, folded onto its base profession. Green's other
        // Ranger-profession enemy is a Druid, which axilog does name.
        expect(c.enemyClassCountsByTeam.green.Ranger).toBe(1);
        expect(c.enemyClassCountsByTeam.green.Druid).toBe(1);
    });

    it('counts every member of every population exactly once', () => {
        const native = loadNativeFixture();
        const c = extractComposition(native);
        const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

        expect(sum(c.squadClassCounts)).toBe(c.squadCount);
        expect(sum(c.allyClassCounts)).toBe(c.allyCount);
        expect(Object.values(c.enemyClassCountsByTeam).reduce((a, m) => a + sum(m), 0))
            .toBe(c.enemyCount);
        expect(c.allyClassCounts).toEqual({ Tempest: 1 });
    });

    /**
     * `elite_spec || profession` is the module's ONE sanctioned fallback.
     * With neither, there is nothing to fall back TO -- rendering "Unknown"
     * would invent a class that is not in the document.
     */
    it('throws on a player entity carrying neither a spec nor a profession', () => {
        const native = loadNativeFixture();
        const broken = edited(native, d => {
            const e = d.entities.find((x: any) => x.role === 'enemy_player');
            e.elite_spec = '';
            delete e.profession;
        });
        expect(() => extractComposition(broken))
            .toThrow(/extractComposition: player entity \d+ \(role enemy_player\) has neither elite_spec nor profession/);
    });
});

describe('extractSquadContext', () => {
    it('ranks the local player inside the squad on every field', () => {
        const native = loadNativeFixture();
        const ctx = extractSquadContext(native, localPlayerId(native));
        expect(ctx.squadSize).toBe(46);
        for (const [name, rank] of Object.entries(ctx)) {
            if (name === 'squadSize') continue;
            expect(rank, name).toBeGreaterThanOrEqual(1);
            expect(rank, name).toBeLessThanOrEqual(ctx.squadSize);
        }
    });

    /**
     * Five of the six rank fields reproduce EI's ranks EXACTLY, for every
     * one of the 46 squad members -- not just the local player, and not
     * just "within range".
     *
     * `damageTakenRank` is in that set even though the underlying VALUES
     * disagree: native's `damage.taken` exceeds EI's `defenses[0].damageTaken`
     * by 1-4 raw damage on 18 of 46 members (worst case 0.069% relative).
     * The cause is ONE skill -- see the dedicated test below, which
     * reconciles the two engines exactly. The gap is far too small to move
     * a rank, and this assertion is what proves that rather than argues it.
     */
    it('reproduces EI\'s ranks exactly on damage, damage taken, strips, cleanses and healing', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const squad = native.entities.filter(e => e.role === 'squad');
        const players = eiSquad(ei);

        const fields = [
            ['damageRank', eiDamage],
            ['damageTakenRank', eiDamageTaken],
            ['stripsRank', eiStrips],
            ['cleanseRank', eiCleanses],
            ['healingRank', (p: EiPlayer) => eiAlliesHealing(ei, p.account)],
        ] as const;

        for (const [field, value] of fields) {
            const eiValues = players.map(value);
            const mismatches: unknown[] = [];
            for (const e of squad) {
                const p = players.find(x => x.account === e.account)!;
                const expected = eiRank(eiValues, value(p));
                const actual = extractSquadContext(native, e.id)[field];
                if (actual !== expected) mismatches.push([accountOf(e), expected, actual]);
            }
            expect(mismatches, field).toEqual([]);
        }
    });

    /**
     * WHY native's `damage.taken` runs 1-4 above EI's on 18 of 46 members,
     * derived by joining native `by_skill_taken` against EI's
     * `totalDamageTaken` skill id by skill id.
     *
     * It is ONE skill: id 23279, which axilog's own catalog names
     * "Self Cast OnActivate". axilog counts it as damage taken; EI does not
     * carry it at all -- the id appears in ZERO of EI's incoming rows, ZERO
     * of its outgoing rows, and has no `skillMap` entry. Native has no
     * entity DEALING it either (it is absent from every `by_skill`), which
     * is what a self-inflicted hit looks like in this format: incoming
     * only, no attacker.
     *
     * 33 raw damage squad-wide, and it accounts for the gap in FULL -- not
     * approximately: subtract this one skill from the native side and the
     * two engines agree to the unit on all 46 members, with no other skill
     * id differing anywhere in the roster.
     */
    it('reconciles damage taken with EI exactly once the self-cast skill is removed', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const SELF_CAST_ON_ACTIVATE = 23279;

        expect(native.catalogs.skills[String(SELF_CAST_ON_ACTIVATE)]?.name)
            .toBe('Self Cast OnActivate');

        // EI does not know this id at all, in either direction.
        for (const p of ei.players) {
            expect((p.totalDamageTaken?.[0] ?? []).filter(e => e.id === SELF_CAST_ON_ACTIVATE)).toEqual([]);
            expect((p.totalDamageDist?.[0] ?? []).filter(e => e.id === SELF_CAST_ON_ACTIVATE)).toEqual([]);
        }

        const damage = native.blocks.damage!.by_entity;
        // ... and nobody in the log deals it: incoming only, no attacker.
        for (const e of native.entities) {
            expect(damage[String(e.id)]?.by_skill?.[String(SELF_CAST_ON_ACTIVATE)], `dealer ${e.id}`)
                .toBeUndefined();
        }

        const carriers: string[] = [];
        const residues: unknown[] = [];
        let selfCastTotal = 0;
        for (const e of native.entities.filter(x => x.role === 'squad')) {
            const row = damage[String(e.id)]!;
            const p = ei.players.find(x => x.account === e.account)!;
            const selfCast = row.by_skill_taken![String(SELF_CAST_ON_ACTIVATE)];
            if (selfCast) {
                carriers.push(e.account!);
                selfCastTotal += selfCast.total;
            }
            const adjusted = row.taken - (selfCast ? selfCast.total : 0);
            if (adjusted !== p.defenses[0]!.damageTaken) {
                residues.push([accountOf(e), p.defenses[0]!.damageTaken, row.taken, adjusted]);
            }
        }
        expect(residues, 'members still disagreeing after removing skill 23279').toEqual([]);
        expect(selfCastTotal).toBe(33);

        // The carriers are EXACTLY the members whose raw totals disagree --
        // so this is the whole explanation, not one contributor among several.
        const disagreeing = native.entities
            .filter(x => x.role === 'squad')
            .filter(e => damage[String(e.id)]!.taken
                !== ei.players.find(x => x.account === e.account)!.defenses[0]!.damageTaken)
            .map(e => e.account!);
        expect(carriers.length).toBe(18);
        expect(carriers).toEqual(disagreeing);
    });

    /**
     * `downContributionRank` is the one field that does NOT reproduce EI,
     * and the cause is documented rather than guessed: axilog's
     * `types.d.ts` says `downs_contribution_damage` is "the
     * arcdps-methodology per-target down-contribution, NOT EI's own
     * 90%-to-downstate-window algorithm". Two algorithms, two numbers.
     *
     * Ranking on EI's number is not an option after the cutover (the EI
     * document is deleted in Task 12), and `extractDamage` already reports
     * this same field as `downContribution` -- so the displayed value and
     * its rank stay consistent with each other. The size of the regression
     * is pinned here instead of being left unstated.
     */
    it('pins the down-contribution rank divergence from EI', () => {
        const native = loadNativeFixture();
        const ei = loadEiFixture();
        const squad = native.entities.filter(e => e.role === 'squad');
        const players = eiSquad(ei);
        const eiValues = players.map(eiDownContribution);

        const moved: string[] = [];
        for (const e of squad) {
            const p = players.find(x => x.account === e.account)!;
            const expected = eiRank(eiValues, eiDownContribution(p));
            if (extractSquadContext(native, e.id).downContributionRank !== expected) {
                moved.push(e.account!);
            }
        }
        expect(moved.length).toBe(36);

        // The local player is NOT one of the 36: both engines rank them
        // 17th, off values of 4512 (EI) and 7721 (native). A named member
        // that DID move, so the divergence has a concrete face:
        // Anon151.6587 falls from 41st to 44th.
        const localId = localPlayerId(native);
        const local = players.find(x => x.account === native.entities[localId].account)!;
        expect(eiRank(eiValues, eiDownContribution(local))).toBe(17);
        expect(extractSquadContext(native, localId).downContributionRank).toBe(17);
        expect(moved).not.toContain(native.entities[localId].account);

        const movedMember = native.entities.find(e => e.account === 'Anon151.6587')!;
        expect(eiRank(eiValues, eiDownContribution(players.find(x => x.account === 'Anon151.6587')!))).toBe(41);
        expect(extractSquadContext(native, movedMember.id).downContributionRank).toBe(44);
    });

    /**
     * The tie rule, matched to EI's `getSquadRank` (`1 + count of strictly
     * greater`): tied members SHARE the better rank and the next distinct
     * value skips the ranks the tie consumed. `every rank is in
     * [1, squadCount]` cannot see this, and neither can the fixture --
     * `damage.total` has no natural ties -- so it is constructed.
     */
    it('gives tied values the same rank and skips the ranks they consume', () => {
        const native = loadNativeFixture();
        const squad = native.entities.filter(e => e.role === 'squad');
        const [a, b, c] = squad;

        const tied = edited(native, d => {
            for (const e of squad) d.blocks.damage.by_entity[String(e.id)].total = 10;
            d.blocks.damage.by_entity[String(a.id)].total = 100;
            d.blocks.damage.by_entity[String(b.id)].total = 100;
            d.blocks.damage.by_entity[String(c.id)].total = 50;
        });

        expect(extractSquadContext(tied, a.id).damageRank).toBe(1);
        expect(extractSquadContext(tied, b.id).damageRank).toBe(1);
        // Third place is skipped by the two-way tie above it.
        expect(extractSquadContext(tied, c.id).damageRank).toBe(3);
        expect(extractSquadContext(tied, squad[3].id).damageRank).toBe(4);

        // Order-independence: the same data in the opposite order ranks the
        // same, which a sort-position rule would not guarantee.
        const reversed = edited(tied, d => { d.entities = d.entities.slice().reverse(); });
        expect(extractSquadContext(reversed, a.id).damageRank).toBe(1);
        expect(extractSquadContext(reversed, c.id).damageRank).toBe(3);
    });

    it('throws when the id is not a squad member', () => {
        const native = loadNativeFixture();
        const enemy = native.entities.find(e => e.role === 'enemy_player')!;
        expect(() => extractSquadContext(native, enemy.id))
            .toThrow(`extractSquadContext: entity ${enemy.id} is not a squad member`);
        expect(() => extractSquadContext(native, 99999))
            .toThrow('extractSquadContext: entity 99999 is not a squad member');
    });

    /**
     * A PRESENT block missing one squad member's row is a different failure
     * from an absent block, and `requireBlock` cannot see it. Ranking
     * against a fabricated 0 would silently promote every other player.
     * Each of the four blocks is broken separately so the four throw sites
     * are individually anchored -- an identically worded error from a
     * neighbouring block would otherwise let a mutation survive.
     */
    it('throws when a present block has no row for a squad member', () => {
        const native = loadNativeFixture();
        const victim = native.entities.filter(e => e.role === 'squad')[7]!;
        const localId = localPlayerId(native);

        for (const block of ['damage', 'support', 'contribution', 'healing'] as const) {
            const broken = edited(native, d => { delete d.blocks[block].by_entity[String(victim.id)]; });
            expect(() => extractSquadContext(broken, localId), block)
                .toThrow(`extractSquadContext: no ${block} row for squad entity ${victim.id}`);
        }
    });

    it('throws when a block this app ranks on was not computed', () => {
        const native = loadNativeFixture();
        const localId = localPlayerId(native);
        const noHealing = edited(native, d => {
            delete d.blocks.healing;
            d.coverage = { ...d.coverage, healing: 'not_computed' };
        });
        expect(() => extractSquadContext(noHealing, localId))
            .toThrow('axilog report is missing the "healing" block (coverage: not_computed)');
    });
});
