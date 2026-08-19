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
 * Identity for one entity.
 *
 * Native carries identity on `entities[]` and nothing else -- no
 * `isFake`/`notInSquad` booleans to reconcile, and `elite_spec` is an
 * empty string (never a numeric id) when the agent has none.
 */
export function extractIdentity(r: ReportV1, id: number): Identity {
    const e = entityById(r).get(id);
    if (!e) throw new Error(`extractIdentity: no entity with id ${id}`);
    return {
        playerName: e.character ?? e.name ?? '',
        accountName: e.account ?? '',
        profession: e.profession ?? '',
        eliteSpec: e.elite_spec ?? '',
        isCommander: e.commander !== undefined,
        group: e.subgroup ?? 0,
    };
}
