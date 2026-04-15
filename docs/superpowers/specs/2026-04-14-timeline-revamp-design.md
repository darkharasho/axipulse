# Timeline View Revamp — Design Spec

## Overview

Replace the current single-chart Timeline view with a **swimlane + inspector** design. The swimlane section shows multiple data lanes sharing a time axis for correlation; the inspector panel appears when the user drag-selects a time range and shows a detailed breakdown of that moment.

## Goals

1. Answer "Why did I die?" without toggling layers on a cluttered chart
2. Surface data that exists in EI JSON but isn't currently displayed (boon timelines, conditions, health %)
3. Let users scan the full fight visually, then drill into any moment

## Architecture

### Layout (top to bottom)

1. **Preset bar** — row of preset buttons + individual lane toggle dots
2. **Shared time axis** — labeled with fight timestamps
3. **Swimlane area** — vertically stacked lanes, each its own horizontal strip
4. **Down/death markers** — vertical dashed lines spanning all lanes
5. **Divider** — shows selected time range label
6. **Inspector panel** — 4-column grid, only visible when a time range is selected

### Swimlane Lanes (10 total)

| Lane | Type | Color | Data Source |
|------|------|-------|-------------|
| Health % | Continuous fill | Green→Red | `player.healthPercents` ([time, percent][]) |
| Damage Dealt | Area graph | #ef4444 | `player.damage1S` / `player.targetDamage1S` |
| Damage Taken | Area graph | #f87171 | `player.damageTaken1S` |
| Distance to Tag | Area graph | #f59e0b | Commander position vs player position |
| Incoming Healing | Area graph | #4ade80 | `player.extHealingStats.healingReceived1S` |
| Incoming Barrier | Area graph | #a78bfa | `player.extBarrierStats.barrierReceived1S` |
| Offensive Boons | Horizontal bars | Per-boon colors | `player.buffUptimes[].states` for Might, Fury, Quickness, Alacrity |
| Defensive Boons | Horizontal bars | Per-boon colors | `player.buffUptimes[].states` for Stability, Protection, Resistance, Aegis |
| Hard CC (received) | Duration bars | #f43f5e | `player.buffUptimes[].states` for Stun, Daze, Knockdown, Fear, Float |
| Soft CC (received) | Duration bars | #c084fc | `player.buffUptimes[].states` for Chill, Immobilize, Slow |

**Boon/condition lanes** show individual buffs as thin horizontal bars within the lane, with the buff's icon at the left edge of each bar segment and a short label on the right. Icons sourced from `buffMap` in EI JSON (already extracted for other views).

**Down/death markers** are vertical dashed lines (amber for down, red for death) that span across all visible lanes, with icon markers at the top of the time axis.

### Presets

| Preset | Default | Lanes Shown |
|--------|---------|-------------|
| Why did I die? | Yes | Health, Dmg Taken, Dist to Tag, Def Boons, Hard CC, Soft CC |
| My Damage | No | Dmg Dealt, Off Boons, Health |
| Am I Getting Support? | No | Healing, Barrier, Off Boons, Def Boons |
| Show All | No | All 10 lanes |

Each preset toggles lane visibility. Users can also manually toggle individual lanes via the colored dots in the preset bar. Manual toggling switches to an implicit "Custom" state.

### Inspector Panel

Appears below the swimlanes when the user drag-selects a time range. Four columns:

#### 1. Health Trajectory
- Mini area chart showing health % over the selected window
- Start and end health % values labeled
- Down/death events noted with timestamps

#### 2. Boon State
- List of all tracked boons (offensive + defensive) at the end of the selected time range, regardless of which preset/lanes are active
- Each boon shows: icon, name, stack count (if relevant), checkmark (present) or strikethrough (missing)
- Missing boons show "dropped Xs ago" relative to selection end
- Icons from `buffMap` in EI JSON

#### 3. Top Hits Taken
- Ranked list of top incoming damage skills within the selected window
- Each entry: skill icon, skill name, damage value, relative bar
- "+" N more with summed total for remaining
- Skill icons and names from `skillMap` / `buffMap` in EI JSON via `resolveSkillMeta`

#### 4. Positioning
- Large average distance-to-tag number for the selected window
- Color-coded (green < 600, amber 600-1200, red > 1200)
- Gradient bar showing position on the scale
- Warning callout if distance exceeds threshold during spike damage

### Interaction

- **Drag-select on swimlanes**: Click and drag horizontally to select a time range. Blue highlight band appears across all lanes. Inspector panel populates with data for the selected window.
- **Click on down/death marker**: Auto-selects a window around the event (e.g., 10 seconds before to 3 seconds after). Inspector panel populates for that window.
- **Hover on lanes**: Tooltip showing exact value at cursor position (optional, lower priority).
- **Preset buttons**: Click to toggle lane visibility. Active preset is highlighted.
- **Lane toggle dots**: Click individual dots to show/hide specific lanes.

## Data Extraction Changes

### New data to extract from EI JSON

1. **Health percent timeline**: `player.healthPercents` — array of `[time, percent]` tuples. Already extracted for MovementView (`SquadMemberMovement.healthPercents`), needs to be added to `TimelineData`.

2. **Boon state timelines**: `player.buffUptimes[].states` — array of `[timestamp, stackCount]` tuples. Currently only uptime percentages are extracted. Need to extract full state timelines for:
   - Offensive boons: Might (740), Fury (725), Quickness (1187), Alacrity (30328)
   - Defensive boons: Stability (1122), Protection (717), Resistance (26980), Aegis (743)

3. **Condition/CC state timelines**: Same `buffUptimes[].states` structure but for conditions. Need to identify and extract:
   - Hard CC: Stun, Daze, Knockdown, Fear, Float
   - Soft CC: Chill, Immobilize, Slow
   - Note: Buff IDs for conditions must be verified against actual EI JSON output during implementation. Parse a real log, inspect `buffMap` entries with `classification: "Condition"` or similar, and map the correct IDs. Do not hardcode assumed IDs.

4. **Per-window incoming damage skills**: `player.totalDamageTaken` — already partially extracted. Need skill-level breakdown with icons for the inspector's "Top Hits" panel. Use `resolveSkillMeta` pattern from `combatMetrics.ts`.

5. **Boon/condition icons**: Already available via `buffMap` in EI JSON. The `boonIcons` extraction in `extractPlayerData.ts` currently filters to `WVW_BOON_IDS` only — expand to include condition IDs.

### Updated TimelineData interface

```typescript
interface TimelineData {
  bucketSizeMs: number;

  // Continuous data lanes (existing, keep)
  damageDealt: TimelineBucket[];
  damageTaken: TimelineBucket[];
  distanceToTag: TimelineBucket[];
  incomingHealing: TimelineBucket[];
  incomingBarrier: TimelineBucket[];

  // New continuous lane
  healthPercent: [number, number][];  // [time, percent]

  // New boon/condition state timelines: [timestamp, stackCount][]
  offensiveBoons: Record<number, { name: string; icon: string; states: [number, number][] }>;
  defensiveBoons: Record<number, { name: string; icon: string; states: [number, number][] }>;
  hardCC: Record<number, { name: string; icon: string; states: [number, number][] }>;
  softCC: Record<number, { name: string; icon: string; states: [number, number][] }>;

  // Event markers (existing, keep)
  deathEvents: number[];
  downEvents: number[];

  // Remove unused fields
  // ccDealt: number[];      — removed
  // ccReceived: number[];   — removed
  // boonUptimeTimeline: ... — replaced by specific boon groups above
  // boonGenerationTimeline: ... — not needed for this view
}
```

### Inspector data

The inspector panel does not need pre-computed data in TimelineData. It computes on-demand from the existing data when a time range is selected:

- **Health trajectory**: Slice `healthPercent` array to selected range
- **Boon state**: Read boon states at the end timestamp of selection, compute "dropped X ago" by scanning backwards
- **Top hits**: Filter `totalDamageTaken` skills by timestamp range (requires per-second or per-event damage data — may need `damageTaken1S` per-skill breakdown from EI JSON, or fall back to showing fight-total top skills with a note)
- **Positioning**: Average `distanceToTag` buckets in the selected range

### Inspector "Top Hits" data availability

The per-skill incoming damage timeline is the hardest piece. EI JSON provides `totalDamageTaken` as fight totals, not per-second. Two options:

1. **Fight totals only**: Show the top incoming damage skills for the entire fight in the inspector, regardless of time selection. Label clearly as "Top hits (full fight)". Simple to implement.
2. **Per-event data**: EI JSON may include per-target damage logs with timestamps. If available, filter to the selected window. More useful but requires investigation.

**Decision**: Start with fight totals (option 1). If EI provides timestamped damage events, upgrade to per-window filtering as a follow-up.

## Component Structure

```
src/renderer/views/
  TimelineView.tsx              — Container: preset bar + swimlanes + inspector
  timeline/
    TimelinePresetBar.tsx       — Preset buttons + lane toggle dots
    TimelineSwimlanes.tsx       — Swimlane container with shared time axis + selection logic
    TimelineLane.tsx             — Single lane renderer (area graph variant)
    TimelineBoonLane.tsx         — Single lane renderer (horizontal bars variant, for boons/conditions)
    TimelineEventMarkers.tsx     — Down/death vertical marker lines
    TimelineInspector.tsx        — Inspector panel container (4 columns)
    inspector/
      HealthPanel.tsx            — Health trajectory mini-chart
      BoonStatePanel.tsx         — Boon state list with icons
      TopHitsPanel.tsx           — Incoming damage skill list with icons
      PositionPanel.tsx          — Distance to tag display
    TimelinePresets.ts           — Preset definitions (updated)
```

## Rendering

The current implementation uses Recharts. The swimlane design needs individual charts per lane sharing a synchronized time axis. Two approaches:

1. **Multiple Recharts instances** with synchronized `XAxis` domains — each lane is its own `<AreaChart>` or custom component. Recharts supports this but synchronization and drag-select across charts is complex.
2. **Canvas/SVG rendering** — render lanes directly with SVG or Canvas, bypassing Recharts entirely. More control over layout and interaction, but more work.

**Decision**: Use individual Recharts `<AreaChart>` components for the continuous data lanes (health, damage, distance, healing, barrier) and custom SVG for the boon/condition bar lanes (since Recharts isn't suited for horizontal duration bars). The drag-select interaction will be a transparent overlay div that captures mouse events across all lanes.

## Visual Details

- Dark background matching existing app theme (#0a0a0a / #0f0f0f)
- Lane backgrounds: #0f0f0f with 1px #1a1a1a borders
- Lane labels: 90px wide, right-aligned, colored to match lane data
- Boon bars: thin horizontal strips within lane, with 18x18 buff icon at left edge
- Condition bars: same pattern as boon bars
- Selection highlight: rgba(96,165,250,0.06) background with 1.5px blue borders
- Inspector panel: #111 cards with #1a1a1a borders, 5px border-radius
- Icons: use existing `<img src={icon}>` pattern with fallback placeholders, consistent with other views

## Out of Scope

- Skill rotation / cast density visualization
- CC dealt tracking
- Condition vs power damage split
- Map/movement view integration
- Hover tooltips on lanes (lower priority, can add later)
- Boon generation timeline
