# Fight Composition Card — Design Spec

**Date:** 2026-04-21
**Status:** Approved

## Summary

Add a full-width "Fight Composition" card at the bottom of the Pulse Overview stat grid. It shows a segmented bar representing the full fight population (squad / allies / enemy teams), with a click-to-expand class breakdown using GW2 profession icons.

---

## Visual Design

### Default state

A single segmented bar divided into flex-proportional sections:

| Segment | Color | Data |
|---|---|---|
| Squad | `#10b981` (emerald) | Squad players |
| Allies | `#06b6d4` (cyan) | Non-squad friendly players |
| Enemy T1 | `#ef4444` (red) | Largest enemy team |
| Enemy T2 | `#f97316` (orange) | Second enemy team |
| Enemy T3 | `#dc2626` (darker red) | Third enemy team (if present) |

Below the bar: a row of legend pills. Each pill shows `count · GroupName` with a color dot matching its bar segment.

### Expanded state (on click)

Clicking a legend pill or bar segment:
- Highlights the selected segment; other segments dim to 30% opacity
- The clicked legend pill gets an active border
- A class breakdown panel slides in below the legend (inline expand, pushes card height)
- Panel shows: profession icon (16×16 SVG) + name + count, one chip per profession, wrapped in a flex row
- Clicking the active pill/segment again collapses the panel (toggle off)

Card is styled consistently with existing stat cards: `background: rgba(239,68,68,0.04)`, `border: 1px solid rgba(239,68,68,0.2)`.

---

## Placement

Full-width card (CSS `grid-column: 1 / -1`) appended after the existing 6 stat cards in `OverviewSubview`. No existing cards are displaced. The card renders nothing if all counts are zero.

---

## Data Layer

### New type: `FightComposition`

```ts
export interface FightComposition {
    squadCount: number;
    allyCount: number;
    enemyCount: number;
    teamBreakdown: { teamId: string; count: number }[];            // top 3 enemy teams, sorted by count desc
    squadClassCounts: Record<string, number>;                      // eliteSpec/profession → count
    allyClassCounts: Record<string, number>;
    enemyClassCountsByTeam: Record<string, Record<string, number>>; // teamId → eliteSpec/profession → count
}
```

### Changes to `PlayerFightData`

Add one field:
```ts
fightComposition: FightComposition;
```

### Changes to `EiTarget` and `EiPlayer`

Add optional team ID fields to both, to match EI JSON output:
```ts
// EiTarget
teamID?: number;
teamId?: number;

// EiPlayer
teamID?: number;
teamId?: number;
```

`EiPlayer.teamID` is needed to build the ally team ID set used for enemy team exclusion.

### Extraction logic (`extractPlayerData.ts`)

New `buildFightComposition(json: EiJson)` function:

- **Squad:** `json.players.filter(p => !p.notInSquad && !p.isFake)`
- **Allies:** `json.players.filter(p => p.notInSquad && !p.isFake)`
- **Enemies:** `json.targets.filter(t => t.enemyPlayer && !t.isFake)`
- **Class key:** `player.elite_spec || player.profession` (same priority as `getClassIconUrl`)
- **Team ID normalization:** `target.teamID ?? target.teamId ?? null` — enemies with no team ID are grouped under the key `'unknown'`
- **Ally team exclusion:** Collect team IDs from squad players; exclude any enemy team whose ID appears in that set (mirrors axibridge's deduplication)
- **Team breakdown:** Top 3 enemy teams sorted by count descending

---

## Shared Utility: `classIconUtils.ts`

Create `src/renderer/classIconUtils.ts` ported from axibridge's pattern:

- Uses `import.meta.glob` to eagerly load all SVGs from `gw2-class-icons/wiki/svg/*.svg` as raw text
- Encodes each to a base64 data URI (`data:image/svg+xml;base64,...`) so `<img src>` works in Electron's renderer context (URL-based SVG hrefs fail there)
- Exports `getProfessionIconPath(profession: string | null | undefined): string | null`
- Falls back: elite spec name → base profession name → `null`

Also port `PROFESSION_COLORS` from axibridge's `professionUtils.ts` into `src/shared/professionUtils.ts`. `MovementView.tsx` already has its own `getProfessionColor` using these colors — update it to import from the shared file.

`MovementView.tsx` should be updated to use `getProfessionIconPath` from this utility, replacing its existing `getClassIconUrl` / `ICON_NAMES` approach. `FightCompositionCard` also imports from here.

---

## New Component: `FightCompositionCard`

```
src/renderer/views/pulse/FightCompositionCard.tsx
```

- Props: `{ composition: FightComposition }`
- Internal state: `activeGroup: string | null` (group key or null)
- Renders `null` if `composition.squadCount + composition.allyCount + composition.enemyCount === 0`
- Group keys: `'squad'`, `'ally'`, `'team-{teamId}'` for each enemy team
- Class chip: `<img>` icon (16×16) + spec name + count; falls back gracefully if icon URL is empty

### Integration

In `OverviewSubview.tsx`, add `<FightCompositionCard composition={data.fightComposition} />` as the last item in the stat grid `<div>`.

---

## Edge Cases

| Case | Behaviour |
|---|---|
| No enemy team ID in JSON | All enemies bucketed under `'unknown'` as a single team |
| Only one enemy team | Single red segment; T2/T3 segments absent |
| No allies (`allyCount === 0`) | Ally segment and legend pill omitted |
| Unknown profession name | Icon falls back to empty string; chip renders name + count without icon |
| All counts zero | Card does not render |
