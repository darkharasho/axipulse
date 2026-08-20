// src/shared/extract/identity.ts
import type { ReportV1 } from '../report';
import { entityById } from '../report';

export interface Identity {
    playerName: string;
    accountName: string;
    profession: string;
    eliteSpec: string;
    isCommander: boolean;
    group: number;
}

/**
 * A required field on an entity, or a throw naming the field and the entity.
 *
 * Every field below is `?`-typed on `EntityOut` because the type covers NPCs
 * and enemy players too, but `extractIdentity`'s only production caller is
 * `extractPlayerFightData`, which passes `localPlayerId(r)` -- always a
 * `role: 'squad'` player. Measured on the fixture: all 46 squad members
 * carry `character`, `account`, `profession`, `elite_spec` and `subgroup`;
 * the absences are entirely on the `enemy_player` (46) and `npc` (36) rows,
 * which never reach here. The `''`/`0` these replace rendered a blank name
 * or subgroup 0 as if it had been measured.
 */
function required<T>(value: T | undefined, field: string, id: number): T {
    if (value === undefined) {
        throw new Error(`extractIdentity: entity ${id} has no \`${field}\``);
    }
    return value;
}

/**
 * Identity for one entity.
 *
 * Native carries identity on `entities[]` and nothing else -- no
 * `isFake`/`notInSquad` booleans to reconcile, and `elite_spec` is an
 * empty string (never a numeric id) when the agent has none, so `''` is a
 * legitimate VALUE here while `undefined` is a broken document.
 */
export function extractIdentity(r: ReportV1, id: number): Identity {
    const e = entityById(r).get(id);
    if (!e) throw new Error(`extractIdentity: no entity with id ${id}`);
    // `character ?? name` is a real either/or, not a fallback to nothing:
    // the format puts a player's in-game character on `character` and an
    // NPC's on `name`. Measured: all 46 squad members have `character` and
    // none has `name`. Absent from BOTH is a nameless entity, and throws.
    const playerName = e.character ?? e.name;
    if (playerName === undefined) {
        throw new Error(`extractIdentity: entity ${id} has neither \`character\` nor \`name\``);
    }
    return {
        playerName,
        accountName: required(e.account, 'account', id),
        profession: required(e.profession, 'profession', id),
        eliteSpec: required(e.elite_spec, 'elite_spec', id),
        isCommander: e.commander !== undefined,
        group: required(e.subgroup, 'subgroup', id),
    };
}
