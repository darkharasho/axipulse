# Stab Performance Fight Breakdown (Pulse → Boons)

## Summary

Add a "Stab Performance" fight breakdown chart to the Boons subview of the Pulse view, modeled after the equivalent section in axibridge. The chart visualizes the local player's stability generation across a single fight, with party-member stab stacks, deaths, distance, and party incoming damage overlaid for context.

## Goal

Give the local player a per-fight, time-bucketed view of their stability output relative to their party's needs (incoming damage, member positioning, deaths). Answers "did I have stab on the right people at the right time?" for the current fight.

## Placement

New section appended to `BoonsSubview` (`src/renderer/views/pulse/BoonsSubview.tsx`), below "Boon Generation". Section is **always rendered**: even with zero local stab generation, party overlays remain useful for diagnosing where stab was needed.

## Visualization

Recharts `ComposedChart`, matching the structure of axibridge's `StabPerformanceSection`:

- **X-axis:** time buckets across the fight, labeled `${b}s` per bucket start, where bucket size matches the user's existing `bucketSizeMs` setting (default 1000ms, 1s minimum).
- **Primary Y-axis (left, visible):** local player's stab generation per bucket, in average stab stacks summed across the party (auto-domain — can exceed 25 when the player covers multiple members simultaneously). Solid line in the local player's profession color.
- **Hidden Y-axis `stabStacks`:** party member stab stacks, 0–25, dashed lines, one per group member, palette-cycled.
- **Hidden Y-axis `incomingHeat`:** background bars (full-height) tinted by party incoming damage intensity per bucket.
- **Markers (on dashed party lines):** Skull icon when a party member died in that bucket; MapPin icon when their average distance to commander > 600u.
- **Tooltip:** bucket label, local player generation, party damage value, then a per-member list (sorted by display name) showing stacks, distance with map-pin icon when present, death indicator.
- **Brush** appears when bucket count > 10.

### Header toggle buttons

Three text-style toggle buttons in the section header (matching axibridge styling/affordance):

1. **Party Damage** — show/hide red incoming-damage heatmap. Default on.
2. **Deaths** — show/hide skull markers. Default on.
3. **Distance** — show/hide MapPin markers when avg distance > 600u. Default on.

Toggle state is local component state (no persistence required for v1).

## Data Pipeline

### New shared module

`src/shared/stabPerformance.ts`

```ts
export interface StabPerfPartyMember {
  key: string;            // account name (e.g. "Player.1234")
  displayName: string;    // account.split('.')[0]
  profession: string;
  stacks: number[];       // avg stab stacks per bucket
  deaths: number[];       // death count per bucket (typically 0/1)
  distances: number[];    // avg units to commander per bucket
}

export interface StabPerfBreakdown {
  bucketSizeMs: number;
  bucketCount: number;
  buckets: { startMs: number; label: string }[];
  selfGeneration: number[];      // avg stab stacks generated per bucket
  partyIncomingDamage: number[]; // sum of party damageTaken1S deltas per bucket
  partyMembers: StabPerfPartyMember[];
}

export function computeStabPerformance(
  json: EiJson,
  localPlayer: EiPlayer,
  bucketSizeMs: number,
): StabPerfBreakdown | null;
```

### Type changes

`src/shared/types.ts`:

```ts
export interface BoonStats {
  uptimes: BoonUptimeEntry[];
  generation: BoonGenerationEntry[];
  stabPerformance: StabPerfBreakdown | null; // NEW
}
```

### Pipeline wiring

`src/shared/extractPlayerData.ts`: in `extractPlayerFightData`, after building boon stats, call `computeStabPerformance(json, player, bucketSizeMs)` and attach to `boons.stabPerformance`.

### Per-bucket computation

For each bucket of size `bucketSizeMs` over `[0, durationMS)`:

- **selfGeneration[b]:** for each squad member in the same group, read their `buffUptimes[id=1122].statesPerSource[localPlayerName]` (state pairs `[timeMs, stacks]`). Integrate stack-milliseconds within `[bucketStart, bucketEnd)`, sum across party, divide by `bucketSizeMs`. Result is average stacks contributed by local player during the bucket. **Fallback:** if `statesPerSource` is unavailable, distribute `selfBuffs[stab].generation + groupBuffs[stab].generation + squadBuffs[stab].generation` (in ms) evenly across active buckets and convert to avg stacks.
- **partyMembers[k].stacks[b]:** integrate `buffUptimes[id=1122].states` for that member's stack timeline within the bucket window, divide by `bucketSizeMs`.
- **partyMembers[k].deaths[b]:** scan member's `rotation` for skill id `-28` casts; bucket each by `Math.floor(castTime / bucketSizeMs)`.
- **partyMembers[k].distances[b]:** average per-tick Euclidean distance between member's `combatReplayData.positions` and the commander's `combatReplayData.positions` within the bucket, converted via `combatReplayMetaData.inchToPixel`. Falls back to member's `statsAll[0].distToCom` when positions are unavailable.
- **partyIncomingDamage[b]:** convert each party member's cumulative `damageTaken1S` to per-second deltas, sum across party, then sum per-second values into the bucket.

Party = squad members (excluding `notInSquad`) sharing the local player's `group`. The local player is **excluded from `partyMembers`** (their generation is the solid line). When the local player has `group === 0` or no other members in their group, `partyMembers` is empty and only the solid generation line + heatmap render.

## File Changes

1. **NEW** `src/shared/stabPerformance.ts` — computation module.
2. **EDIT** `src/shared/types.ts` — add `StabPerfBreakdown`, extend `BoonStats`.
3. **EDIT** `src/shared/extractPlayerData.ts` — invoke and attach.
4. **EDIT** `src/renderer/views/pulse/BoonsSubview.tsx` — render new section by composing the chart component below.
5. **NEW** `src/renderer/views/pulse/StabPerformanceChart.tsx` — recharts ComposedChart + toggles. Extracted because BoonsSubview would otherwise pass ~250 lines.
6. **NEW** `tests/shared/stabPerformance.test.ts` — unit tests for bucket integration math, fallback path, group filtering, distance averaging, death bucketing.

## Non-Goals

- No multi-fight aggregation (axibridge's role).
- No player selection UI; local player is always the focus.
- No persistence of toggle states between fights.
- No mini-icons inside ticks for boon application events (axibridge doesn't have this either at this layer).

## Tradeoffs

- **`statesPerSource` availability:** required for accurate per-bucket generation. EI emits it for stability when `--anonymous` flags aren't blocking. Fallback (even distribution of total generation across active buckets) keeps the line non-empty but is less truthful — acceptable for v1, flag in code comment.
- **Bucket size = 1s default:** finer granularity than axibridge's fixed 5s. Generation values land in 0–25 range cleanly, but a 5-min fight produces ~300 buckets. Brush handles density visually; recharts performance is fine in that range.
- **Distance computation cost:** per bucket loops over polling-rate ticks (typically 150–500ms). For a 5-min fight at 150ms polling with 5 party members: ~10k ops. Negligible.
