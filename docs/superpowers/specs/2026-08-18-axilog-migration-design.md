# Migrating AxiPulse off Elite Insights onto axilog 1.x

**Date:** 2026-08-18
**Status:** Approved, not yet implemented
**Repos touched:** `axilog`, `axipulse`, `arcdps-axipulse`

## Goal

Replace Elite Insights with axilog as the log-parsing backend in both
AxiPulse products, consuming axilog's **native `ReportV1` format**
directly rather than its `ei-json` compatibility projection.

This removes a ~90 MB `GW2EICLI.zip` download, a bundled .NET 8 runtime,
a per-log subprocess, and — in the in-game plugin — a ~78 MB JSON
document parsed inside the game process on every fight.

## Binding decisions

1. **Native is the target.** Neither repo adopts `parseFileEi` /
   `axilog_ei`, not even as an intermediate step. The EI-shaped internal
   models are deleted, not adapted.
2. **Both repos migrate together**, against the same axilog version.
3. **A missing native binding is a hard failure.** No fallback to EI, no
   rendering a zero where a block is absent. A block the consumer reads
   whose `coverage` is `not_computed` throws.
4. **The domain models stay put.** In `axipulse`, `PlayerFightData` and
   everything below it is unchanged; in `arcdps-axipulse`, `Derived` keeps
   its current job and the `ui/` layer is not restructured. The migration
   is contained to the parse and projection layers.

## Part 0 — Prerequisite changes in `axilog` (shipped in v1.2.0)

Both changes landed in the `axilog` repo first and are tagged `v1.2.0`
(they were projected as `v1.1.0`; the parse facade shipped alongside them,
so the release carried a minor bump). The other two repos pin to that tag.

### 0.1 A shared `ReportV1` facade

There is no axilog API that turns bytes into a `ReportV1`.
`crates/axilog-node/src/lib.rs` hand-rolls ~90 lines of
`decode_raw → resolve → analyze → {optional passes} → build_report_v1`,
and `crates/axilog-cli/src/main.rs:404` hand-rolls the same sequence
again. A third transcription in `arcdps-axipulse` would drift — the exact
failure the `everything` option was introduced to prevent.

Add:

```rust
pub struct ParseOpts {
    pub replay: bool,
    pub skill_damage: bool,
    pub timeseries: bool,
    pub missiles: bool,
    pub rotation: bool,
    pub modifiers: bool,
    /// Union with the individual flags, never an override — same
    /// semantics as the Node SDK's `everything`.
    pub everything: bool,
}

pub fn parse_report_v1(bytes: &[u8], opts: &ParseOpts)
    -> Result<axilog_schema::v1::ReportV1, EvtcError>;
```

Placement: a new thin `axilog-api` crate depending on `axilog-core` and
`axilog-schema`, re-exporting `axilog_schema::v1` so a consumer declares
one dependency.

It cannot live in `axilog-core`: `axilog-schema` already depends on
`axilog-core` (`crates/axilog-schema/Cargo.toml`), and `parse_report_v1`
returns a schema type, so putting it in core is a cargo cycle. It is kept
out of `axilog-schema` because a crate named "schema" owning parse
orchestration would have the CLI and `axilog-ei` importing their entry
point from it.

The Node binding and the CLI are refactored to call it, so there is
exactly one orchestration path. The existing golden tests cover this
refactor.

**axibridge guard.** axibridge pins `@axiapps/axilog` at exactly `1.0.0`
and consumes ei-json exclusively through `parseFileEi`, so it picks up
nothing until deliberately bumped. Because this refactor touches the
option plumbing `parseFileEi` rides, the refactor commit must assert
ei-json output is byte-identical on the committed fixture before and
after.

### 0.2 Incoming healing and barrier per-second series

`axilog-core/src/analysis/healing_detail.rs:70` scopes these out by name:
`healingReceived1S`, `barrier1S` and relatives are "NOT produced here",
because axibridge's audit never asked for them.

Both AxiPulse repos read them today:

- `axipulse/src/shared/extractPlayerData.ts:111-115` →
  `TimelineData.incomingHealing` / `incomingBarrier` (rendered charts).
- `arcdps-axipulse/src/pulse_metrics.rs:92,99` → two overlay rows.

Nothing in the native document reconstructs them.
`healing.detail.by_ally` is per-ally *totals*; `series.by_entity[].healing_1s`
is the *outgoing* cumulative series.

Add `healing_received_1s` and `barrier_received_1s` to `EntitySeries`,
behind the existing `timeseries` gate. Implementation is a transpose of
the healing-event grouping `healing_detail.rs` already performs, on the
same `ei_grid`/`ei_bucket` helpers `healing1S` uses — so the received
series and the outgoing series cannot land on different grids. Covered by
a golden test on the committed fixture.

## Part 1 — The shape change

The native document inverts today's model. `entities[]` carries identity
only; every statistic lives in `blocks.*` keyed by entity `id`.

### Field mapping

| Today (EI) | Native `ReportV1` |
|---|---|
| `dpsAll[0].{damage,dps,breakbarDamage}` | `blocks.damage.by_entity[id].{total,dps,breakbar_damage_dealt}` |
| `statsAll[0].downContribution` | `blocks.contribution.by_entity[id].downs_contribution.{damage,cc,strips,movement_impairing}` |
| `totalDamageDist[0][].downContribution` | `blocks.contribution.by_entity[id].downs_contribution_by_skill` (ungated) |
| `statsAll[0].{distToCom,stackDist}` | `blocks.replay.by_entity[id].{dist_to_com,stack_dist}` |
| `statsAll[0].{appliedCrowdControl,…Duration}` | `blocks.cc.by_entity[id].{applied_total,applied_duration_ms}` |
| `defenses[0].*` | `blocks.defenses.by_entity[id].*` (named fields) |
| `support[0].*` | `blocks.support.by_entity[id].{cleanses,cleanses_self,strips,strips_duration_ms,resurrects}` |
| `buffUptimes[].buffData[0]` | `blocks.boons.by_entity[id][buffId].{uptime_pct,avg_stacks}` |
| `buffUptimes[].{states,statesPerSource}` | `blocks.boons.by_entity[id][buffId].{states,per_source}` |
| `selfBuffs`/`groupBuffs`/`squadBuffs` | `blocks.boons.by_entity[id][buffId].generation.{self_pct,group_pct,squad_pct}` |
| `damage1S`, `damageTaken1S`, `targetDamage1S` | `blocks.series.by_entity[id].{damage,damage_taken,per_target}` |
| `healthPercents` | `blocks.series.by_entity[id].health_percents` |
| `extHealingStats.*`, `extBarrierStats.*` | `blocks.healing.by_entity[id].{outgoing_*,barrier_out,downed_healing_out,detail.*}` |
| `healingReceived1S`, `barrierReceived1S` | `blocks.series.by_entity[id].{healing_received_1s,barrier_received_1s}` (added by 0.2) |
| `rotation[].skills[]` | `blocks.rotation.by_entity[id]` (flat, time-ordered `CastRow[]`) |
| `combatReplayData.{positions,down,dead}` | `blocks.replay.{tracks,by_entity[id].{down,dead,dc}}` |
| `combatReplayMetaData.{inchToPixel,sizes,maps}` | `blocks.replay.arena` (world rect + image size, raw) |
| `skillMap` / `buffMap` | `catalogs.skills` / `catalogs.buffs` |
| `fightName`/`zone`/`mapName`/`map` | `encounter.{kind,map,map_id}` |
| `durationMS` | `encounter.duration_ms` |
| `timeStartStd` | `encounter.started_at_unix` (seconds; ×1000 for a JS `Date`) |
| `recordedBy` / `recordedAccountBy` | `encounter.recorded_by` — **an entity id**, not a name |
| `hasCommanderTag` | `entities[].commander` (with real tag-on/off `segments`) |
| `group` | `entities[].subgroup` |
| `teamID` / `teamId` | `entities[].team` (one string, one spelling) |
| `isFake`, `notInSquad`, `enemyPlayer` | `entities[].role` (`squad`\|`friendly_player`\|`enemy_player`\|`npc`) |

### Semantics that must not be transcribed carelessly

- **Series are RLE-encoded.** `SeriesOut` is `{ interval_ms, len, enc:
  'raw'\|'rle', data }`, and `len` is the DECODED length, not
  `data.length`. axilog ships no decoder in JS or as a public Rust helper;
  each repo writes one, and it is the first thing tested.
- **`dist_to_com` has three states.** Absent = the position pass never
  ran. `-1` = the pass ran and nothing qualified (GW2EI's sentinel).
  `>= 0` = a real distance, and `0` is legitimate (the commander's own
  value). Never render `-1` as a distance.
- **`coverage` distinguishes `not_computed` from `empty`.** `empty` means
  computed with nothing to report and the block is still carried;
  `not_computed` means the gate was off and the block is absent. Per
  decision 3, reading a `not_computed` block is an error.
- **`coverage.boons` and `coverage.replay` are narrower than they look.**
  Both report on their always-on half only. `coverage.boons === 'present'`
  says nothing about whether `states`/`per_source` are there; check the
  fields.
- **`per_source` is keyed by entity id**, where EI's `statesPerSource` was
  keyed by character name. This is the collision that made an
  EI→native adapter undoable in the other direction.
- **Two times are not log-relative:** `encounter.markers[].time_ms` and
  `entities[].commander.segments`. Subtract `encounter.log_start_ms`
  before comparing either against `duration_ms`; the result may legitimately
  be negative.
- **Replay positions are raw world inches**, with the projection rect in
  `blocks.replay.arena`. EI's `inchToPixel` (3-decimal rounded) and
  `sizes` (squeezed to a 750px maximum dimension) are derivable from
  these; these are not recoverable from those.
- **`started_at_unix` is absent, not zero**, when the log carries no
  `CBTS_LOGSTART`. Do not default it to epoch zero.
- **Relog dedupe is done by the engine**, account-keyed. Existing
  duplicate-player handling in both repos is removed, not ported.

### Parse options

Both repos request explicit flags rather than `everything: true`:

```
replay, skill_damage, timeseries, rotation
```

`missiles` and `modifiers` are unused. `modifiers` in particular gates a
*computation* — a separate pass over every damage event crossed with ~200
catalogued definitions — which is real cost on a live log watcher.

The drift risk that motivated `everything` is instead handled by a
**coverage assertion test** in each repo: parse the committed fixture and
assert `coverage[b] === 'present'` for every block that repo reads. That
fails loudly when axilog adds a surface behind a new gate.

## Part 2 — `axipulse` (Electron / TypeScript)

### Dependency

`@axiapps/axilog@^1.2.0` from npm. Prebuilt `.node` binaries ship as
`optionalDependencies` for `linux-x64-gnu` and `win32-x64-msvc`, covering
both electron-builder targets. `adm-zip` is removed.

### Parse path

`src/main/eiParser.ts` (549 lines: download, unzip, .NET bootstrap,
subprocess, 10-minute timeout) → `src/main/axilogParser.ts` (~60 lines).
No install step, no progress events, no first-run download.

`parseFile` is synchronous napi. It runs in an Electron **`utilityProcess`**
that owns one function — path in, `ReportV1` out — so a parse never
freezes the window mid-session. (`utilityProcess` rather than a
`worker_thread` so the native binary resolves the way it does in main.)

### New module: `src/shared/report.ts`

Re-exports the native types from `@axiapps/axilog/types` and adds the
primitives every consumer needs:

- `entityById(report): Map<number, EntityOut>`
- role filters (`squadMembers`, `enemies`, …)
- `decodeSeries(s: SeriesOut): number[]` — the RLE decoder
- `requireBlock(report, name)` — throws on `not_computed`

### `src/shared/types.ts`

Lines 1–95 (`EiPlayer`, `EiTarget`, `EiJson`) are deleted. Line 97
onward (`SkillCast` through `FightHistoryEntry`) is **unchanged** — this
is the containment boundary, and the entire renderer is untouched apart
from the EI-management UI.

### `src/shared/extract/`

`extractPlayerData.ts` (426 lines, eight unrelated concerns, all of which
change in this migration) is split:

```
src/shared/extract/
  identity.ts     local player, commander, names, professions
  damage.ts       totals, dps, breakbar, top skills
  support.ts      strips, cleanses, healing, barrier
  defense.ts      damage taken, downs, deaths, incoming CC
  boons.ts        uptimes, generation, boon performance
  timeline.ts     damage/taken/distance/incoming-heal buckets, boon states
  movement.ts     replay tracks, arena projection, casts
  composition.ts  squad/ally/enemy counts, team breakdown
```

`extractPlayerData.ts` remains as a thin composer producing
`PlayerFightData`. Each file is independently testable; none exceeds
~80 lines.

The remaining `src/shared/*` modules — `dashboardMetrics`,
`combatMetrics`, `boonData`, `boonPerformance`, `timelineData`,
`classifyRole`, `timelineInspector` — change signature from
`(player: EiPlayer)` to `(report: ReportV1, id: number)`. Mostly
mechanical. `boonPerformance.ts` carries the only real thinking: its
party-member keying moves from account string to entity id.

### Simplifications

- `findLocalPlayer`'s three-boolean heuristic → `encounter.recorded_by`.
- `findCommander`'s tag-plus-`activeTimes` sort →
  `entities.find(e => e.commander)`.
- `wvwTiles.ts` / `mapUtils.ts` stop reverse-engineering EI's replay
  metadata; `blocks.replay.arena` gives the world rect directly, and
  `encounter.map_id` replaces display-name string matching for landmark
  and tile lookups.

### Deletions

`src/main/eiParser.ts`; `src/main/handlers/eiHandlers.ts`; the 15 `ei*`
bindings in `src/preload/index.ts` and their `src/renderer/globals.d.ts`
entries; the EI install/update/uninstall/.NET/auto-manage sections of
`src/renderer/views/SettingsView.tsx`; the EI and .NET probes in
`src/renderer/views/TroubleshootModal.tsx` and
`src/renderer/app/AppLayout.tsx:46`; the `adm-zip` dependency.

## Part 3 — `arcdps-axipulse` (Rust)

### Dependency

`axilog-api` as a git dependency pinned to axilog's `v1.2.0` tag; it
re-exports `axilog_schema::v1`, so the plugin declares one dependency
rather than three. The tree is pure Rust (`thiserror`, `flate2`, `serde`,
`serde_json`), so the existing `cargo xwin --target
x86_64-pc-windows-msvc` alias works with no new toolchain. `parse_report_v1` is called on the existing parser worker
thread.

### What this removes

Today the plugin bundles GW2EICLI.zip and a .NET 8 runtime, spawns a
below-normal-priority subprocess per log, reads the JSON that subprocess
wrote, and `serde_json`-parses a document measuring ~78 MB for a mid-size
WvW fight — inside the game process. `slim.rs` exists solely to claw that
back afterward; `HISTORY_CAP` was cut from 32 to 8 because of it; and
`slim.rs`'s own doc names the symptom: *"pushed the box into a zram swap
storm on each parse — the post-fight lag."*

Native parsing removes every step: no subprocess, no .NET, no bundle, and
no JSON serialization or deserialization at all.

### Retained state

`ei_model.rs` (368 lines of EI deserialization) → `fight_data.rs`: a
struct holding exactly what the UI reads, built once by
`FightData::from_report(&ReportV1)` on the worker thread. The `ReportV1`
is then **dropped** — it never enters `FightRecord`.

This achieves `slim.rs`'s goal by construction rather than by post-hoc
rewriting: the large allocation is never made. `slim.rs` is deleted.

`HISTORY_CAP` stays at 8 for the migration commit and is raised in a
separate follow-up commit backed by a measurement, not by faith.

### Explicitly out of scope

`Derived` keeps its current job. `ui/map.rs` (1025 lines), `ui/pulse.rs`
(922), and `ui/timeline.rs` (500) read the retained struct field-by-field
each frame; keeping a retained struct means those files change by field
access (`json.players[idx].group` → `fight.players[idx].subgroup`), not by
restructure. Moving all of it into `Derived` would rewrite ~2400 lines of
imgui code in the same change as the parser swap.

### Deletions

`ei_bundle.rs` (115), `ei_settings.rs` (78), `ei_parser.rs` (321),
`ei_model.rs` (368, replaced), `slim.rs` (49),
`tests/ei_bundle_test.rs`, `scripts/fetch_ei.sh`, and the EI/.NET panel in
`ui/options.rs`. Roughly 950 lines. The `zip` and `flate2` dependencies
are removed **only after** confirming no non-EI user remains — axilog
handles `.zevtc` decompression itself, but `tile_fetcher.rs` and
`updater.rs` must be checked first.

### Changed by signature

`derived.rs`, `squad_rank.rs`, `self_identify.rs` (→ one field read),
`timeline_distance.rs`, `wvw_teams.rs`, `fight_composition.rs`,
`boon_uptime.rs`, `pulse_metrics.rs`, `top_heals.rs`, `top_skills.rs`,
`timeline_boons.rs`, `timeline_buckets.rs`, `timeline_health.rs`,
`state.rs`, `plugin.rs`, and the four `ui/` files.

`wvw_teams.rs` (189 lines of team inference from
`teamID`/`teamId`/`isFake`) collapses against `entities[].{role,team}`.

## Part 4 — Testing

### The equality oracle

Each repo commits one real `.zevtc` WvW fixture (anonymized via
`anonymizeFile` / `axilog anonymize`) plus the EI JSON that today's
pipeline produces for it. During the migration, each unit is pinned by a
test that computes its output both ways — from the frozen EI JSON via the
old code path, and from `ReportV1` via the new one — and asserts the
aggregates match.

Units migrate **one at a time**, each with its oracle test green before
the next starts. The old code path and its fixture are deleted only in the
final commit of each repo, once nothing references them.

Where the two legitimately differ (engine-side distance scalars, the
4-way down-contribution split, account-keyed relog dedupe), the oracle
asserts the documented relationship rather than equality, and the spec
entry for that unit records why.

### Additional tests

- **RLE decoder** — unit tests including `enc: 'raw'`, `enc: 'rle'`, a
  single-run series, and `len` disagreeing with `data.length`.
- **Coverage assertion** — parse the fixture with the repo's real parse
  options and assert every block that repo reads reports `present`.
- **`dist_to_com` tri-state** — absent, `-1`, and `>= 0` each render
  correctly.
- **axipulse:** `vitest --maxWorkers=2` (machine constraint).
- **arcdps-axipulse:** `cargo test`, plus `cargo xwin check --target
  x86_64-pc-windows-msvc` to prove the Windows cross-build still links.

## Part 5 — Sequencing

1. **axilog** — `parse_report_v1` facade; CLI and Node binding refactored
   onto it. Tag nothing yet.
2. **axilog** — `healing_received_1s` / `barrier_received_1s`, with a
   golden test. **Done** — released as **v1.2.0**; `@axiapps/axilog@1.2.0`
   is on npm.
3. **axipulse** — commit fixture + EI oracle JSON; add `report.ts` with a
   tested `decodeSeries`.
4. **axipulse** — migrate `src/shared/extract/*` unit by unit, oracle
   green at each step.
5. **axipulse** — swap the parse path to the `utilityProcess`; delete
   `eiParser.ts`, the IPC surface, the preload bindings, and the EI UI.
6. **arcdps-axipulse** — commit fixture; add `fight_data.rs` with
   `from_report`, oracle-tested against the frozen EI JSON.
7. **arcdps-axipulse** — migrate consumers unit by unit.
8. **arcdps-axipulse** — swap the parse path; delete the EI bundle,
   parser, settings, `slim.rs`, and the fetch script. Verify the Windows
   cross-build.
9. **arcdps-axipulse** — follow-up: measure the new per-fight footprint
   and raise `HISTORY_CAP`.

Steps 3–5 and 6–8 are independent once step 2 lands and may proceed in
parallel.

## Accepted risks

- **Numbers will move.** axilog is an independent reimplementation, not a
  reskin of EI. Down contribution in particular gains a 4-way split, and
  distance scalars are now engine-side. The oracle tests document each
  intentional difference; unexplained differences block the migration.
- **axilog is WvW-first** with no PvE encounter logic (a single
  whole-fight phase). Both AxiPulse products are WvW tools, so this is
  consistent with their scope, but neither will produce meaningful PvE
  output afterward. That was already effectively true.
- **Git-pinned Rust dependency.** `arcdps-axipulse` tracks an axilog tag
  rather than a crates.io release. Bumping it is a deliberate act, which
  is the desired behaviour for a plugin loaded into a live game process.
- **EI's `profession` and native's `profession`/`elite_spec` are not the
  same shape** (found in Task 3, `identity.ts`). EI's raw JSON conflates
  base profession and elite spec into a single display string on
  `profession` (e.g. `"Harbinger"` for a Necromancer running that spec) and
  never actually populates a separate `elite_spec` field, despite
  `EiPlayer.elite_spec` declaring one -- every real fixture value is
  `undefined`. Native splits these: `EntityOut.profession` is always the
  base class, `EntityOut.elite_spec` is the spec name or `''`. The correct
  oracle comparison is `native.elite_spec || native.profession ===
  ei.profession`, not a field-for-field match. `extractIdentity` itself is
  unaffected -- this only matters for the EI-comparison test, and for any
  future UI code that still expects EI's conflated string.
- **`EntityOut.elite_spec` can be `''` for a reason other than "no elite
  spec"**: per its own doc comment, axilog also emits `''` when the agent
  *has* an elite spec but the project's catalog cannot name it. Confirmed
  in the `wvw.zevtc` fixture: account `Anon175.7475` runs Thief's
  "Antiquary" spec per EI, but native reports `elite_spec: ''` because
  Antiquary isn't in axilog's current catalog. The `identity.ts` oracle
  test excludes this one account from its profession/spec equality check
  rather than weakening the assertion, and documents why inline. This is a
  real catalog gap axilog should eventually close, not a bug in this app.
