# Role-Aware Pulse Overview

## Summary

Make the Pulse overview smarter by detecting the local player's role (damage vs support) based on squad-relative combat metrics, then adjusting which stats are shown prominently. Ported from axibridge's proven `classifyPlayerRoles` algorithm, adapted for AxiPulse's single-player-focused data model.

## Role Classification Module

### New file: `src/shared/classifyRole.ts`

Binary classification: `'support'` or `'damage'`, using a weighted squad-median-based approach.

### Algorithm

1. Collect all real, in-squad players from `EiJson.players`
2. For each of 6 metrics, compute the squad median (non-zero values only)
3. For each player, compute a ratio against the median per metric, multiply by weight, sum into a `supportScore`
4. Compute threshold: `medianSupportScore + |medianSupportScore| * 0.25`
5. Players above threshold are `'support'`, below are `'damage'`
6. Confidence score: normalized distance from threshold (0-1)

### Metrics and Weights

| Metric | Weight | Signal |
|--------|--------|--------|
| Healing (outgoing, excl. self) | 1.8 | Support |
| Cleanses | 1.6 | Support |
| Total Boon Output (sum of all squadBuffs generationMs) | 1.8 | Support |
| DPS | -0.8 | Damage |
| Total Damage | -1.5 | Damage |
| Down Contribution | -2.5 | Damage |

### Constants

- `THRESHOLD_MULTIPLIER = 1.25`
- `OUTLIER_RATIO = 2.0` (when squad median is 0 but player has positive value)

### Interface

```typescript
interface RoleClassification {
  role: 'support' | 'damage';
  supportScore: number;
  confidenceScore: number;
}
```

### Boon Output Extraction

Total boon output is computed by summing generation values across all boons in `EiPlayer.squadBuffs`. For each player, iterate `squadBuffs`, sum `buffData[0].generation` (phase 0) across all buff IDs. The EI JSON stores generation as a percentage (0-100). Since all players are compared on the same scale, no unit conversion is needed — raw percentage sums work for relative comparison.

### Edge Cases

- Solo logs (1 player): median equals the player's own values, threshold pushes slightly above. Player will be classified as `'damage'` by default since they can't exceed their own median by 25%. This is acceptable.
- No healing data (EI parsed without healing extension): healing values are 0 for everyone, metric contributes nothing. Classification still works on remaining metrics.
- Player is commander with no tag distance: `distanceToTag` is `null`, card shows "N/A".

## Data Model Changes

### `src/shared/types.ts`

1. Add `RoleClassification` interface (as defined above)

2. Add to `PlayerFightData`:
   ```typescript
   roleClassification: RoleClassification;
   distanceToTag: { average: number; median: number } | null;
   ```

3. Add to `SquadContext`:
   ```typescript
   damageTakenRank: number;
   ```

### `src/shared/extractPlayerData.ts`

- Import and call `classifyRole()` with all squad players. Attach the local player's result to `PlayerFightData.roleClassification`.
- Compute `distanceToTag` summary stats: average from `EiPlayer.statsAll[0].distToCom`, median computed from the timeline `distanceToTag` buckets (median of all bucket values).
- Add `damageTakenRank` to `buildSquadContext()` using the existing `getSquadRank` helper with `getDamageTaken`.

## Overview Subview Changes

### `src/renderer/views/pulse/OverviewSubview.tsx`

The component reads `data.roleClassification.role` and renders one of two configurations.

### Damage Role Layout

- **Hero banner:** Damage Dealt / DPS with damage rank badge (unchanged from current)
- **6-card grid (grid-cols-2, 3 rows):**
  1. Down Contribution (ranked)
  2. Deaths / Downs (with death times)
  3. Strips (ranked)
  4. Cleanses (ranked)
  5. Damage Taken (ranked via `damageTakenRank`)
  6. Distance to Tag (avg / median)

### Support Role Layout

- **Hero banner:** Healing Output with healing rank badge, same gradient style as current damage banner
- **6-card grid (grid-cols-2, 3 rows):**
  1. Cleanses (ranked)
  2. Barrier Output (no squad rank — not currently tracked in SquadContext)
  3. Strips (ranked)
  4. Deaths / Downs (with death times)
  5. Damage Taken (ranked via `damageTakenRank`)
  6. Distance to Tag (avg / median)

### New Cards

**Damage Taken:**
- Value: `defense.damageTaken.toLocaleString()`
- Detail: `"{ordinal} in squad"` using `squadContext.damageTakenRank`
- Accent color: `var(--status-error)` or similar defensive color

**Distance to Tag:**
- Value: `"{avg} avg / {median} med"` (rounded to nearest integer, in-game inches from EI)
- Detail: contextual label (e.g., "from commander")
- When `null` (player is commander or no tag data): card shows "N/A" with muted styling
- Accent color: neutral/info color

### Support Hero Banner

Same structure as the current damage hero banner but with:
- Label: "Healing Output"
- Primary value: `support.healingOutput.toLocaleString()`
- Secondary value: barrier output with "Barrier" label
- Rank badge: `squadContext.healingRank`

## Files Changed

| File | Change |
|------|--------|
| `src/shared/classifyRole.ts` | New file: role classification algorithm |
| `src/shared/types.ts` | Add `RoleClassification`, extend `PlayerFightData` and `SquadContext` |
| `src/shared/extractPlayerData.ts` | Call `classifyRole()`, compute distance stats, add `damageTakenRank` |
| `src/renderer/views/pulse/OverviewSubview.tsx` | Role-aware hero banner + 6-card grid |
