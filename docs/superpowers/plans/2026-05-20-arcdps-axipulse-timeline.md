# arcdps-axipulse Timeline Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an in-game ImGui overlay window showing the local player's last fight over time as six stacked swim-lanes (Health, Damage Dealt, Damage Taken, Distance to Tag, Offensive Boons, Defensive Boons), with per-lane visibility toggles.

**Architecture:** Pure data-prep modules (`timeline_buckets`, `timeline_health`, `timeline_distance`, `timeline_boons`) turn the EI JSON into uniform per-second arrays and `(start_ms, end_ms)` segment lists. The UI module `ui/timeline.rs` opens a second arcdps window (Pulse stays as-is) and draws each lane via the imgui draw list — area lanes fill a polygon below a sampled curve; boon lanes render `(start, end)` rectangles at varying y-offsets per buff. We flip `EiSettings::parse_combat_replay = true` so EI emits the `combat_replay_data.positions` array we need for Distance to Tag. No hover crosshair, no drag-select, no animations — static charts. CC and Healing/Barrier lanes are deferred (CC needs a buff-classification table; healing needs the arcdps healing addon).

**Tech Stack:** Same as Foundation/Pulse — `arcdps::imgui`, vendored bindings, `serde`. No new crate dependencies.

---

## File Structure

```
arcdps-axipulse/
  src/
    timeline_buckets.rs    NEW   cumulative-to-per-second + bucket helpers
    timeline_health.rs     NEW   health-percent step function → bucket array
    timeline_distance.rs   NEW   distance-to-commander from combat_replay positions
    timeline_boons.rs      NEW   buff states → (start_ms, end_ms) intervals
    config.rs              MOD   add show_timeline, timeline_pos, timeline_layers
    ei_settings.rs         MOD   flip parse_combat_replay = true
    ui/
      mod.rs               MOD   add `pub mod timeline;`
      timeline.rs          NEW   the overlay window with 6 swim-lanes
      options.rs           MOD   add Timeline checkbox
    plugin.rs              MOD   imgui callback also renders timeline window
    lib.rs                 MOD   add `pub mod timeline_*;`
  tests/
    timeline_buckets_test.rs    NEW
    timeline_health_test.rs     NEW
    timeline_distance_test.rs   NEW
    timeline_boons_test.rs      NEW
```

Why this split:
- Each data-prep module owns one transformation (per-second bucketing / health step-function / distance / boon intervals). Tests use synthetic JSON so we don't need a new fixture.
- All `timeline_*` modules are pure Rust (`#[cfg(windows)]`-free) so they run on the Linux host CI.
- UI stays out of `src/`; only `ui/timeline.rs` references arcdps imgui.

---

## Conventions

- **Bucket size:** 1000ms (1s) for v1. EI emits `damage1S` already bucketed at 1s — we keep that. Health uses 1s buckets too. The UI doesn't need finer granularity than 1px per second.
- **Lane height:** 48px for area lanes; boon lanes auto-size by row count (12px per buff row + 8px padding). 4 offensive boons → 56px, 4 defensive boons → 56px.
- **Time axis:** ticks at 0 / quarter / half / three-quarter / end of fight, shown as `m:ss`.
- **Self identification:** Reuse `crate::self_identify::find_self_index` from Pulse.
- **Commander identification:** First player with `has_commander_tag == true`. If none, Distance to Tag lane renders "No commander tagged this fight."
- **Boon sets:**
  - **Offensive:** Might (740), Fury (725), Quickness (1187), Alacrity (30328)
  - **Defensive:** Protection (717), Resistance (26980), Stability (1122), Aegis (743)
- **Inactive vs active:** EI's `buff_uptimes[].states` is `[[t0, v0], [t1, v1], ...]` where `v > 0` means active (stacks for intensity, 1 for duration). A segment is `[t_become_active, t_become_inactive)`. If the last state has `v > 0`, the segment runs to `duration_ms`.

---

### Task 1: Flip `parse_combat_replay = true`

**Files:**
- Modify: `src/ei_settings.rs`

This makes EI emit the `combat_replay_data.positions` array we need for Distance to Tag. Side effects: parses are slower (~3-5x for big fights based on EI's own perf notes) and the JSON is bigger.

- [ ] **Step 1: Edit the default**

In `src/ei_settings.rs`, change:

```rust
            // Timeline plan will flip this to true — needed for player
            // positions and the replay polling rate. Off here so Foundation
            // parses stay fast and the JSON small.
            parse_combat_replay: false,
```

to:

```rust
            parse_combat_replay: true,
```

The leading doc-comment lines about Timeline can be removed since the flip is now the actual default.

- [ ] **Step 2: Update the existing test in `tests/ei_settings_test.rs`**

The test `includes_required_axipulse_flags` already asserts on substrings. Add `assert!(conf.contains("ParseCombatReplay=True"));` near the other flag assertions. No new test file.

Open `tests/ei_settings_test.rs`, find the `assert!(conf.contains("ParsePhases=True"));` line, and add directly below it:

```rust
    assert!(conf.contains("ParseCombatReplay=True"));
```

- [ ] **Step 3: Run tests**

Run: `cd /var/home/mstephens/Documents/GitHub/arcdps-axipulse && cargo test --test ei_settings_test`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/ei_settings.rs tests/ei_settings_test.rs
git commit -m "feat(settings): enable parse_combat_replay for Timeline data"
```

---

### Task 2: `timeline_buckets` — per-second extraction

**Files:**
- Create: `src/timeline_buckets.rs`
- Test: `tests/timeline_buckets_test.rs`

EI's `damage1S` and `damage_taken_1s` arrays are cumulative damage at each second. We want per-second deltas for area-chart rendering, padded to the fight duration.

- [ ] **Step 1: Write the failing test**

```rust
// tests/timeline_buckets_test.rs
use arcdps_axipulse::timeline_buckets::{cumulative_to_per_second, extract_damage_dealt, extract_damage_taken};
use arcdps_axipulse::ei_model::EiJson;

#[test]
fn cumulative_to_per_second_takes_first_difference() {
    let cum = vec![0u64, 100, 250, 400, 400, 550];
    let per = cumulative_to_per_second(&cum);
    assert_eq!(per, vec![0, 100, 150, 150, 0, 150]);
}

#[test]
fn cumulative_to_per_second_handles_empty() {
    let per = cumulative_to_per_second(&[]);
    assert!(per.is_empty());
}

#[test]
fn extract_damage_dealt_uses_phase_zero() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":5000,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "damage1S":[[0,100,300,300,500,500]]
        }],"targets":[]
    }"#).unwrap();
    let per = extract_damage_dealt(&j.players[0]);
    assert_eq!(per, vec![0, 100, 200, 0, 200, 0]);
}

#[test]
fn extract_damage_taken_uses_phase_zero() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":5000,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "damageTaken1S":[[0,50,75,75]]
        }],"targets":[]
    }"#).unwrap();
    let per = extract_damage_taken(&j.players[0]);
    assert_eq!(per, vec![0, 50, 25, 0]);
}

#[test]
fn extract_damage_dealt_returns_empty_when_absent() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":5000,
        "players":[{"name":"x","account":":x.1","profession":"Guardian"}],
        "targets":[]
    }"#).unwrap();
    assert_eq!(extract_damage_dealt(&j.players[0]), Vec::<u64>::new());
}
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cargo test --test timeline_buckets_test`
Expected: FAIL — `timeline_buckets` module doesn't exist.

- [ ] **Step 3: Implement**

```rust
//! Turn EI's cumulative per-second damage arrays into deltas suitable
//! for area-chart rendering.

use crate::ei_model::EiPlayer;

/// `[c0, c1, c2, ...] → [c0, c1-c0, c2-c1, ...]`. Empty in → empty out.
pub fn cumulative_to_per_second(cumulative: &[u64]) -> Vec<u64> {
    if cumulative.is_empty() { return Vec::new(); }
    let mut out = Vec::with_capacity(cumulative.len());
    out.push(cumulative[0]);
    for i in 1..cumulative.len() {
        out.push(cumulative[i].saturating_sub(cumulative[i - 1]));
    }
    out
}

/// Aggregated outgoing damage per second from EI's phase-0 totals.
pub fn extract_damage_dealt(p: &EiPlayer) -> Vec<u64> {
    let Some(phase) = p.damage_1s.get(0) else { return Vec::new(); };
    cumulative_to_per_second(phase)
}

/// Aggregated incoming damage per second.
pub fn extract_damage_taken(p: &EiPlayer) -> Vec<u64> {
    let Some(phase) = p.damage_taken_1s.get(0) else { return Vec::new(); };
    cumulative_to_per_second(phase)
}
```

- [ ] **Step 4: Wire into `src/lib.rs`**

Add `pub mod timeline_buckets;` next to the other `pub mod` lines.

- [ ] **Step 5: Run tests, expect 5 passed**

Run: `cargo test --test timeline_buckets_test`

- [ ] **Step 6: Commit**

```bash
git add src/timeline_buckets.rs src/lib.rs tests/timeline_buckets_test.rs
git commit -m "feat(timeline): per-second damage extraction"
```

---

### Task 3: `timeline_health` — health % step-function buckets

**Files:**
- Create: `src/timeline_health.rs`
- Test: `tests/timeline_health_test.rs`

EI emits `health_percents` as `[[t_ms, percent], ...]` — a step function. We sample once per second for the timeline lane.

- [ ] **Step 1: Write the failing test**

```rust
// tests/timeline_health_test.rs
use arcdps_axipulse::timeline_health::sample_health_per_second;
use arcdps_axipulse::ei_model::EiJson;

#[test]
fn samples_step_function_at_each_second() {
    // Steps: 0ms→100%, 2500ms→80%, 4000ms→60%
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":6000,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "healthPercents":[[0,100],[2500,80],[4000,60]]
        }],"targets":[]
    }"#).unwrap();
    let samples = sample_health_per_second(&j.players[0], 6000);
    // 7 samples (0, 1, 2, 3, 4, 5, 6 seconds).
    assert_eq!(samples, vec![100.0, 100.0, 100.0, 80.0, 60.0, 60.0, 60.0]);
}

#[test]
fn empty_health_yields_full() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":3000,
        "players":[{"name":"x","account":":x.1","profession":"Guardian"}],
        "targets":[]
    }"#).unwrap();
    let samples = sample_health_per_second(&j.players[0], 3000);
    assert_eq!(samples, vec![100.0, 100.0, 100.0, 100.0]);
}

#[test]
fn zero_duration_returns_empty() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":0,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "healthPercents":[[0,100]]
        }],"targets":[]
    }"#).unwrap();
    let samples = sample_health_per_second(&j.players[0], 0);
    assert!(samples.is_empty());
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```rust
//! Sample `EiPlayer.health_percents` (a step function) at 1Hz.

use crate::ei_model::EiPlayer;

/// One sample per second from 0 to `duration_ms` inclusive. Each value
/// is the player's health percentage AT that second, from the most
/// recent state at or before that timestamp. Pre-fight state is 100%.
pub fn sample_health_per_second(p: &EiPlayer, duration_ms: u64) -> Vec<f64> {
    if duration_ms == 0 { return Vec::new(); }
    let states: Vec<(f64, f64)> = p.health_percents.iter()
        .filter_map(|pair| if pair.len() >= 2 { Some((pair[0], pair[1])) } else { None })
        .collect();

    let seconds = (duration_ms / 1000) as usize + 1;
    let mut out = Vec::with_capacity(seconds);
    let mut state_idx = 0usize;
    let mut current = states.first().map(|s| s.1).unwrap_or(100.0);

    for sec in 0..seconds {
        let t = (sec as f64) * 1000.0;
        while state_idx < states.len() && states[state_idx].0 <= t {
            current = states[state_idx].1;
            state_idx += 1;
        }
        out.push(current);
    }
    out
}
```

- [ ] **Step 4: Wire `pub mod timeline_health;` into `src/lib.rs`**

- [ ] **Step 5: Run tests, expect 3 passed**

- [ ] **Step 6: Commit**

```bash
git add src/timeline_health.rs src/lib.rs tests/timeline_health_test.rs
git commit -m "feat(timeline): sample health percent at 1Hz"
```

---

### Task 4: `timeline_distance` — distance-to-commander samples

**Files:**
- Create: `src/timeline_distance.rs`
- Test: `tests/timeline_distance_test.rs`

EI's `combat_replay_data.positions` is sampled at the rate noted in `combat_replay_meta_data.polling_rate` (typically 150ms). We compute euclidean distance between the local player and the commander at each polling sample, average within each 1-second bucket, and scale by `inch_to_pixel` to get distance in inches.

- [ ] **Step 1: Write the failing test**

```rust
// tests/timeline_distance_test.rs
use arcdps_axipulse::timeline_distance::distance_to_commander_per_second;
use arcdps_axipulse::ei_model::EiJson;

#[test]
fn computes_distance_in_inches_using_inch_to_pixel() {
    // Polling 1000ms, inch_to_pixel = 1.0 → distance == raw euclidean.
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":3000,
        "combatReplayMetaData":{"inchToPixel":1.0,"pollingRate":1000},
        "players":[
            {"name":"me","account":":me.1","profession":"Guardian",
             "combatReplayData":{"positions":[[0.0,0.0],[3.0,4.0],[6.0,8.0]]}},
            {"name":"cmdr","account":":cmdr.1","profession":"Warrior",
             "hasCommanderTag":true,
             "combatReplayData":{"positions":[[0.0,0.0],[0.0,0.0],[0.0,0.0]]}}
        ],
        "targets":[]
    }"#).unwrap();
    let samples = distance_to_commander_per_second(&j, 0, 3000);
    // Sample 0: hypot(0,0)=0; sample 1: hypot(3,4)=5; sample 2: hypot(6,8)=10
    assert_eq!(samples.len(), 4);
    assert!((samples[0] - 0.0).abs() < 0.01);
    assert!((samples[1] - 5.0).abs() < 0.01);
    assert!((samples[2] - 10.0).abs() < 0.01);
}

#[test]
fn returns_empty_when_no_commander() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":2000,
        "combatReplayMetaData":{"inchToPixel":1.0,"pollingRate":1000},
        "players":[
            {"name":"me","account":":me.1","profession":"Guardian",
             "combatReplayData":{"positions":[[0.0,0.0],[1.0,0.0]]}}
        ],
        "targets":[]
    }"#).unwrap();
    let samples = distance_to_commander_per_second(&j, 0, 2000);
    assert!(samples.is_empty(), "no commander → no distance lane");
}

#[test]
fn returns_empty_when_self_lacks_replay_data() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":2000,
        "combatReplayMetaData":{"inchToPixel":1.0,"pollingRate":1000},
        "players":[
            {"name":"me","account":":me.1","profession":"Guardian"},
            {"name":"c","account":":c.1","profession":"Warrior","hasCommanderTag":true,
             "combatReplayData":{"positions":[[0.0,0.0],[1.0,0.0]]}}
        ],
        "targets":[]
    }"#).unwrap();
    let samples = distance_to_commander_per_second(&j, 0, 2000);
    assert!(samples.is_empty());
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```rust
//! Euclidean distance between the local player and the commander at
//! each 1-second tick, in in-game inches.

use crate::ei_model::EiJson;

pub fn distance_to_commander_per_second(json: &EiJson, self_idx: usize, duration_ms: u64) -> Vec<f64> {
    let Some(meta) = json.combat_replay_meta_data.as_ref() else { return Vec::new() };
    let polling_rate = meta.polling_rate.unwrap_or(150).max(1) as f64;
    let inch_to_pixel = meta.inch_to_pixel.unwrap_or(1.0).max(1e-6);

    let Some(me) = json.players.get(self_idx) else { return Vec::new() };
    let Some(me_replay) = me.combat_replay_data.as_ref() else { return Vec::new() };
    if me_replay.positions.is_empty() { return Vec::new(); }

    let Some(commander) = json.players.iter().find(|p| p.has_commander_tag) else { return Vec::new() };
    let Some(cmdr_replay) = commander.combat_replay_data.as_ref() else { return Vec::new() };
    if cmdr_replay.positions.is_empty() { return Vec::new(); }

    let samples_per_sec = (1000.0 / polling_rate).max(1.0).round() as usize;
    let seconds = (duration_ms / 1000) as usize + 1;
    let n = me_replay.positions.len().min(cmdr_replay.positions.len());

    let mut out = Vec::with_capacity(seconds);
    for sec in 0..seconds {
        let start = sec * samples_per_sec;
        if start >= n { out.push(out.last().copied().unwrap_or(0.0)); continue; }
        let end = (start + samples_per_sec).min(n);
        let mut sum = 0.0;
        let mut count = 0.0;
        for i in start..end {
            let (mx, my) = me_replay.positions[i];
            let (cx, cy) = cmdr_replay.positions[i];
            let dx = mx - cx;
            let dy = my - cy;
            sum += (dx * dx + dy * dy).sqrt() / inch_to_pixel;
            count += 1.0;
        }
        out.push(if count > 0.0 { sum / count } else { 0.0 });
    }
    out
}
```

- [ ] **Step 4: Wire `pub mod timeline_distance;` into `src/lib.rs`**

- [ ] **Step 5: Run tests, expect 3 passed**

- [ ] **Step 6: Commit**

```bash
git add src/timeline_distance.rs src/lib.rs tests/timeline_distance_test.rs
git commit -m "feat(timeline): distance-to-commander per second"
```

---

### Task 5: `timeline_boons` — extract boon active intervals

**Files:**
- Create: `src/timeline_boons.rs`
- Test: `tests/timeline_boons_test.rs`

EI's `buff_uptimes[].states` is a list of `[time_ms, value]` pairs. Active = `value > 0`. We need contiguous `[start_ms, end_ms)` segments per buff for bar-lane rendering.

- [ ] **Step 1: Write the failing test**

```rust
// tests/timeline_boons_test.rs
use arcdps_axipulse::ei_model::EiJson;
use arcdps_axipulse::timeline_boons::{
    active_segments, offensive_boons, defensive_boons, BoonSeries, Segment,
};

#[test]
fn active_segments_finds_runs_of_positive_values() {
    // states: t=0 v=0, t=500 v=3 (became active), t=2000 v=0 (inactive),
    //         t=3000 v=1 (active again, runs to end)
    let states = vec![
        vec![0.0,    0.0],
        vec![500.0,  3.0],
        vec![2000.0, 0.0],
        vec![3000.0, 1.0],
    ];
    let segs = active_segments(&states, 5000);
    assert_eq!(segs, vec![
        Segment { start_ms: 500, end_ms: 2000 },
        Segment { start_ms: 3000, end_ms: 5000 },
    ]);
}

#[test]
fn active_segments_no_states_yields_empty() {
    assert!(active_segments(&[], 5000).is_empty());
}

#[test]
fn active_segments_starting_active_at_zero() {
    let states = vec![vec![0.0, 5.0], vec![1500.0, 0.0]];
    let segs = active_segments(&states, 3000);
    assert_eq!(segs, vec![Segment { start_ms: 0, end_ms: 1500 }]);
}

#[test]
fn offensive_boons_returns_might_fury_quickness_alacrity() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":2000,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "buffUptimes":[
                {"id":740,"buffData":[],"states":[[0,5],[1000,0]]},
                {"id":725,"buffData":[],"states":[[0,1],[1500,0]]},
                {"id":1187,"buffData":[],"states":[[500,1],[1500,0]]},
                {"id":30328,"buffData":[],"states":[]},
                {"id":999,"buffData":[],"states":[[0,1]]}
            ]
        }],"targets":[]
    }"#).unwrap();
    let series = offensive_boons(&j.players[0], 2000);
    assert_eq!(series.len(), 4);
    assert_eq!(series[0].id, 740);
    assert_eq!(series[0].name, "Might");
    assert_eq!(series[0].segments, vec![Segment { start_ms: 0, end_ms: 1000 }]);
    assert_eq!(series[3].id, 30328);
    assert_eq!(series[3].name, "Alacrity");
    assert!(series[3].segments.is_empty());
}

#[test]
fn defensive_boons_returns_prot_resistance_stability_aegis() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":2000,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "buffUptimes":[
                {"id":717,"buffData":[],"states":[[0,1],[800,0]]},
                {"id":1122,"buffData":[],"states":[[100,2],[500,0]]}
            ]
        }],"targets":[]
    }"#).unwrap();
    let series = defensive_boons(&j.players[0], 2000);
    assert_eq!(series.len(), 4);
    assert_eq!(series[0].id, 717);
    assert_eq!(series[0].name, "Protection");
    assert_eq!(series[0].segments, vec![Segment { start_ms: 0, end_ms: 800 }]);
    assert_eq!(series[2].id, 1122);
    assert_eq!(series[2].name, "Stability");
}
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```rust
//! Extract per-buff active-interval lists from `EiPlayer.buff_uptimes`.

use crate::ei_model::EiPlayer;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone)]
pub struct BoonSeries {
    pub id: i64,
    pub name: &'static str,
    pub segments: Vec<Segment>,
}

const OFFENSIVE_IDS: &[(i64, &str)] = &[
    (740,   "Might"),
    (725,   "Fury"),
    (1187,  "Quickness"),
    (30328, "Alacrity"),
];

const DEFENSIVE_IDS: &[(i64, &str)] = &[
    (717,   "Protection"),
    (26980, "Resistance"),
    (1122,  "Stability"),
    (743,   "Aegis"),
];

/// Walk `states` (each entry `[time_ms, value]`) and return the
/// `[start, end)` intervals where `value > 0`. If the buff is still
/// active at the end of the states list, the segment closes at
/// `duration_ms`.
pub fn active_segments(states: &[Vec<f64>], duration_ms: u64) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    let mut active_start: Option<u64> = None;
    for pair in states {
        if pair.len() < 2 { continue; }
        let t = pair[0].max(0.0) as u64;
        let v = pair[1];
        match (active_start, v > 0.0) {
            (None, true) => active_start = Some(t),
            (Some(start), false) => {
                out.push(Segment { start_ms: start, end_ms: t });
                active_start = None;
            }
            _ => {}
        }
    }
    if let Some(start) = active_start {
        out.push(Segment { start_ms: start, end_ms: duration_ms });
    }
    out
}

fn series_for(p: &EiPlayer, list: &[(i64, &'static str)], duration_ms: u64) -> Vec<BoonSeries> {
    list.iter().map(|(id, name)| {
        let segments = p.buff_uptimes.iter()
            .find(|b| b.id == *id)
            .map(|b| active_segments(&b.states, duration_ms))
            .unwrap_or_default();
        BoonSeries { id: *id, name, segments }
    }).collect()
}

pub fn offensive_boons(p: &EiPlayer, duration_ms: u64) -> Vec<BoonSeries> {
    series_for(p, OFFENSIVE_IDS, duration_ms)
}

pub fn defensive_boons(p: &EiPlayer, duration_ms: u64) -> Vec<BoonSeries> {
    series_for(p, DEFENSIVE_IDS, duration_ms)
}
```

- [ ] **Step 4: Wire `pub mod timeline_boons;` into `src/lib.rs`**

- [ ] **Step 5: Run tests, expect 5 passed**

- [ ] **Step 6: Commit**

```bash
git add src/timeline_boons.rs src/lib.rs tests/timeline_boons_test.rs
git commit -m "feat(timeline): extract offensive and defensive boon segments"
```

---

### Task 6: Extend `Config` with Timeline visibility, position, and layer toggles

**Files:**
- Modify: `src/config.rs`

- [ ] **Step 1: Replace `Config` definition**

Open `src/config.rs` and replace the struct + default impl with:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Empty = autodetect under %USERPROFILE%\Documents\Guild Wars 2\addons\arcdps\arcdps.cbtlogs
    pub cbtlogs_path: String,
    pub debug_logging: bool,
    /// Whether the Pulse window is currently rendered.
    pub show_pulse: bool,
    pub pulse_pos: Option<(f32, f32)>,
    /// Whether the Timeline window is currently rendered.
    pub show_timeline: bool,
    pub timeline_pos: Option<(f32, f32)>,
    /// Per-lane visibility toggles for the Timeline.
    pub timeline_layers: TimelineLayers,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TimelineLayers {
    pub health: bool,
    pub damage_dealt: bool,
    pub damage_taken: bool,
    pub distance_to_tag: bool,
    pub offensive_boons: bool,
    pub defensive_boons: bool,
}

impl Default for TimelineLayers {
    fn default() -> Self {
        Self {
            health: true,
            damage_dealt: true,
            damage_taken: true,
            distance_to_tag: true,
            offensive_boons: true,
            defensive_boons: true,
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            cbtlogs_path: String::new(),
            debug_logging: false,
            show_pulse: true,
            pulse_pos: None,
            show_timeline: true,
            timeline_pos: None,
            timeline_layers: TimelineLayers::default(),
        }
    }
}
```

- [ ] **Step 2: Verify host + cross build**

Run: `cd /var/home/mstephens/Documents/GitHub/arcdps-axipulse && cargo check && cargo dll-check`. Both clean.

- [ ] **Step 3: Commit**

```bash
git add src/config.rs
git commit -m "feat(config): track Timeline window state and layer toggles"
```

---

### Task 7: UI scaffolding for the Timeline window

**Files:**
- Modify: `src/ui/mod.rs` — add `pub mod timeline;`
- Create: `src/ui/timeline.rs` — window shell with stub body
- Modify: `src/ui/options.rs` — add Timeline checkbox

- [ ] **Step 1: Add to `src/ui/mod.rs`**

Open `src/ui/mod.rs`. Add `pub mod timeline;` below the existing `pub mod pulse;`.

- [ ] **Step 2: Write `src/ui/timeline.rs`**

```rust
#![cfg(windows)]
//! Timeline window — six stacked swim-lanes over the local player's
//! last fight. Lanes are independently toggleable via the layer panel.

use arcdps::imgui::{Condition, StyleColor, StyleVar, Ui};

use crate::config::Config;
use crate::ei_model::EiJson;
use crate::self_identify::find_self_index;
use crate::state::AppState;

const BG_WINDOW:     [f32; 4] = [0.055, 0.065, 0.085, 0.92];
const BG_CARD:       [f32; 4] = [0.085, 0.10,  0.13,  0.95];
const BG_CARD_BORDER:[f32; 4] = [1.0, 1.0, 1.0, 0.06];
const TEXT_PRIMARY:  [f32; 4] = [0.97, 0.97, 1.00, 1.0];
const TEXT_MUTED:    [f32; 4] = [0.52, 0.54, 0.62, 1.0];

const COLOR_HEALTH:   [f32; 4] = [0.29, 0.86, 0.50, 1.0];
const COLOR_DMG:      [f32; 4] = [0.95, 0.38, 0.38, 1.0];
const COLOR_TAKEN:    [f32; 4] = [0.97, 0.55, 0.42, 1.0];
const COLOR_DIST:     [f32; 4] = [0.95, 0.75, 0.40, 1.0];
const COLOR_OFF:      [f32; 4] = [0.42, 0.65, 0.94, 1.0];
const COLOR_DEF:      [f32; 4] = [0.32, 0.78, 0.92, 1.0];

const LANE_LABEL_W: f32 = 92.0;
const LANE_PAD_Y:   f32 = 2.0;
const AREA_LANE_H:  f32 = 48.0;
const BOON_ROW_H:   f32 = 12.0;
const BOON_GAP:     f32 = 2.0;

pub fn render(ui: &Ui, state: &AppState, config: &mut Config) {
    if !config.show_timeline { return; }

    let style_tokens = [
        ui.push_style_var(StyleVar::WindowPadding([12.0, 10.0])),
        ui.push_style_var(StyleVar::WindowRounding(10.0)),
        ui.push_style_var(StyleVar::WindowBorderSize(0.0)),
        ui.push_style_var(StyleVar::ItemSpacing([8.0, 8.0])),
    ];
    let color_tokens = [
        ui.push_style_color(StyleColor::WindowBg,      BG_WINDOW),
        ui.push_style_color(StyleColor::TitleBg,       [0.055, 0.065, 0.085, 0.95]),
        ui.push_style_color(StyleColor::TitleBgActive, [0.085, 0.10,  0.13,  0.95]),
        ui.push_style_color(StyleColor::Separator,     [1.0, 1.0, 1.0, 0.06]),
    ];

    let mut window = ui.window("Timeline").size([720.0, 480.0], Condition::FirstUseEver);
    if let Some(pos) = config.timeline_pos {
        window = window.position([pos.0, pos.1], Condition::FirstUseEver);
    }
    let mut open = true;
    window.opened(&mut open).build(|| {
        let current = state.current();
        if current.is_none() {
            ui.text_disabled("Waiting for the first parsed fight…");
            return;
        }
        let record = current.unwrap();
        let json = &record.data;
        let Some(idx) = find_self_index(json) else {
            ui.text_disabled("Could not identify local player in this fight.");
            return;
        };

        render_layer_toggles(ui, &mut config.timeline_layers);
        ui.separator();
        render_time_axis(ui, json.duration_ms);
        render_lanes(ui, json, idx, &config.timeline_layers);
    });

    if !open {
        config.show_timeline = false;
        config.save();
    }

    for tok in color_tokens { tok.pop(); }
    for tok in style_tokens { tok.pop(); }
}

fn render_layer_toggles(ui: &Ui, layers: &mut crate::config::TimelineLayers) {
    let pairs = [
        ("Health",     &mut layers.health),
        ("Dmg Dealt",  &mut layers.damage_dealt),
        ("Dmg Taken",  &mut layers.damage_taken),
        ("Dist Tag",   &mut layers.distance_to_tag),
        ("Off Boons",  &mut layers.offensive_boons),
        ("Def Boons",  &mut layers.defensive_boons),
    ];
    for (i, (label, value)) in pairs.into_iter().enumerate() {
        ui.checkbox(label, value);
        if i + 1 < 6 { ui.same_line(); }
    }
}

fn render_time_axis(ui: &Ui, duration_ms: u64) {
    let avail = ui.content_region_avail()[0].max(LANE_LABEL_W + 60.0);
    let cursor = ui.cursor_screen_pos();
    let data_x = cursor[0] + LANE_LABEL_W;
    let data_w = avail - LANE_LABEL_W;
    let draw = ui.get_window_draw_list();

    let tick_count = 5usize;
    for i in 0..tick_count {
        let frac = i as f32 / (tick_count - 1) as f32;
        let t_ms = (frac as u64) * duration_ms / 1; // avoid overflow on tiny logs
        let t_ms = ((i as u64) * duration_ms) / ((tick_count - 1) as u64);
        let x = data_x + data_w * frac;
        let label = format_mmss(t_ms);
        let w = ui.calc_text_size(&label)[0];
        let lx = if i == 0 { x } else if i + 1 == tick_count { x - w } else { x - w * 0.5 };
        draw.add_text([lx, cursor[1]], TEXT_MUTED, &label);
    }
    ui.dummy([avail, ui.text_line_height() + 4.0]);
}

fn render_lanes(ui: &Ui, json: &EiJson, idx: usize, layers: &crate::config::TimelineLayers) {
    use crate::timeline_buckets::{extract_damage_dealt, extract_damage_taken};
    use crate::timeline_health::sample_health_per_second;
    use crate::timeline_distance::distance_to_commander_per_second;
    use crate::timeline_boons::{offensive_boons, defensive_boons};

    let p = &json.players[idx];
    let dur = json.duration_ms;

    if layers.health {
        let samples = sample_health_per_second(p, dur);
        draw_area_lane(ui, "Health", COLOR_HEALTH, &samples_to_f32(&samples), 100.0);
    }
    if layers.damage_dealt {
        let v: Vec<f32> = extract_damage_dealt(p).into_iter().map(|x| x as f32).collect();
        draw_area_lane_auto(ui, "Dmg Dealt", COLOR_DMG, &v);
    }
    if layers.damage_taken {
        let v: Vec<f32> = extract_damage_taken(p).into_iter().map(|x| x as f32).collect();
        draw_area_lane_auto(ui, "Dmg Taken", COLOR_TAKEN, &v);
    }
    if layers.distance_to_tag {
        let samples = distance_to_commander_per_second(json, idx, dur);
        if samples.is_empty() {
            draw_empty_lane(ui, "Dist Tag", COLOR_DIST, "no commander tagged");
        } else {
            let v: Vec<f32> = samples.into_iter().map(|x| x as f32).collect();
            draw_area_lane_auto(ui, "Dist Tag", COLOR_DIST, &v);
        }
    }
    if layers.offensive_boons {
        let series = offensive_boons(p, dur);
        draw_boon_lane(ui, "Off Boons", COLOR_OFF, &series, dur);
    }
    if layers.defensive_boons {
        let series = defensive_boons(p, dur);
        draw_boon_lane(ui, "Def Boons", COLOR_DEF, &series, dur);
    }
}

fn samples_to_f32(v: &[f64]) -> Vec<f32> { v.iter().map(|x| *x as f32).collect() }

/// Area lane that auto-scales to the maximum value (with a 1.0 minimum).
fn draw_area_lane_auto(ui: &Ui, label: &str, accent: [f32; 4], samples: &[f32]) {
    let max = samples.iter().copied().fold(1.0_f32, f32::max);
    draw_area_lane(ui, label, accent, samples, max);
}

/// Area lane normalised so `max` maps to the top of the lane.
fn draw_area_lane(ui: &Ui, label: &str, accent: [f32; 4], samples: &[f32], max: f32) {
    let avail = ui.content_region_avail()[0].max(LANE_LABEL_W + 60.0);
    let cursor = ui.cursor_screen_pos();
    let data_x = cursor[0] + LANE_LABEL_W;
    let data_w = avail - LANE_LABEL_W;
    let y = cursor[1];
    let h = AREA_LANE_H;
    let draw = ui.get_window_draw_list();

    draw.add_text([cursor[0] + LANE_LABEL_W - ui.calc_text_size(label)[0] - 6.0, y + (h - ui.text_line_height()) * 0.5], accent, label);
    draw.add_rect([data_x, y], [data_x + data_w, y + h], BG_CARD).filled(true).rounding(4.0).build();
    draw.add_rect([data_x, y], [data_x + data_w, y + h], BG_CARD_BORDER).rounding(4.0).build();

    if samples.len() >= 2 && max > 0.0 {
        let n = samples.len();
        let mut prev_x = data_x;
        let mut prev_y = y + h - (samples[0] / max).clamp(0.0, 1.0) * (h - 4.0) - 2.0;
        for i in 1..n {
            let x = data_x + data_w * (i as f32 / (n - 1) as f32);
            let v = (samples[i] / max).clamp(0.0, 1.0);
            let yv = y + h - v * (h - 4.0) - 2.0;
            // Filled trapezoid from x-axis up to curve.
            let mut fill = accent; fill[3] = 0.30;
            draw.add_triangle([prev_x, y + h], [x, y + h], [x, yv]).filled(true).color(fill).build();
            draw.add_triangle([prev_x, y + h], [x, yv], [prev_x, prev_y]).filled(true).color(fill).build();
            draw.add_line([prev_x, prev_y], [x, yv], accent).thickness(1.2).build();
            prev_x = x;
            prev_y = yv;
        }
    }

    ui.dummy([avail, h + LANE_PAD_Y]);
}

fn draw_empty_lane(ui: &Ui, label: &str, accent: [f32; 4], reason: &str) {
    let avail = ui.content_region_avail()[0].max(LANE_LABEL_W + 60.0);
    let cursor = ui.cursor_screen_pos();
    let data_x = cursor[0] + LANE_LABEL_W;
    let data_w = avail - LANE_LABEL_W;
    let y = cursor[1];
    let h = AREA_LANE_H;
    let draw = ui.get_window_draw_list();

    draw.add_text([cursor[0] + LANE_LABEL_W - ui.calc_text_size(label)[0] - 6.0, y + (h - ui.text_line_height()) * 0.5], accent, label);
    draw.add_rect([data_x, y], [data_x + data_w, y + h], BG_CARD).filled(true).rounding(4.0).build();
    draw.add_rect([data_x, y], [data_x + data_w, y + h], BG_CARD_BORDER).rounding(4.0).build();
    let rw = ui.calc_text_size(reason)[0];
    draw.add_text([data_x + (data_w - rw) * 0.5, y + (h - ui.text_line_height()) * 0.5], TEXT_MUTED, reason);
    ui.dummy([avail, h + LANE_PAD_Y]);
}

fn draw_boon_lane(
    ui: &Ui,
    label: &str,
    accent: [f32; 4],
    series: &[crate::timeline_boons::BoonSeries],
    duration_ms: u64,
) {
    let avail = ui.content_region_avail()[0].max(LANE_LABEL_W + 60.0);
    let cursor = ui.cursor_screen_pos();
    let data_x = cursor[0] + LANE_LABEL_W;
    let data_w = avail - LANE_LABEL_W;
    let y = cursor[1];
    let h = (series.len() as f32) * (BOON_ROW_H + BOON_GAP) + 4.0;
    let h = h.max(AREA_LANE_H);
    let draw = ui.get_window_draw_list();

    draw.add_text([cursor[0] + LANE_LABEL_W - ui.calc_text_size(label)[0] - 6.0, y + (h - ui.text_line_height()) * 0.5], accent, label);
    draw.add_rect([data_x, y], [data_x + data_w, y + h], BG_CARD).filled(true).rounding(4.0).build();
    draw.add_rect([data_x, y], [data_x + data_w, y + h], BG_CARD_BORDER).rounding(4.0).build();

    if duration_ms == 0 {
        ui.dummy([avail, h + LANE_PAD_Y]);
        return;
    }

    let mut fill = accent; fill[3] = 0.55;
    for (row, s) in series.iter().enumerate() {
        let row_y = y + 2.0 + row as f32 * (BOON_ROW_H + BOON_GAP);
        for seg in &s.segments {
            let sx = data_x + data_w * (seg.start_ms.min(duration_ms) as f32 / duration_ms as f32);
            let ex = data_x + data_w * (seg.end_ms.min(duration_ms) as f32 / duration_ms as f32);
            if ex - sx < 1.0 { continue; }
            draw.add_rect([sx, row_y], [ex, row_y + BOON_ROW_H], fill).filled(true).rounding(2.0).build();
        }
        // Row label (right-aligned over the row, small, accent colour).
        let name_w = ui.calc_text_size(s.name)[0];
        draw.add_text(
            [data_x + data_w - name_w - 4.0, row_y + (BOON_ROW_H - ui.text_line_height()).max(0.0) * 0.5],
            accent, s.name,
        );
    }
    ui.dummy([avail, h + LANE_PAD_Y]);
}

fn format_mmss(ms: u64) -> String {
    let sec = ms / 1000;
    let m = sec / 60;
    let s = sec % 60;
    format!("{m}:{s:02}")
}
```

- [ ] **Step 3: Add Timeline checkbox to `src/ui/options.rs`**

Replace the function body in `src/ui/options.rs` with:

```rust
pub fn render_window_checkboxes(ui: &Ui, config: &mut Config) -> bool {
    let mut changed = false;
    let mut show = config.show_pulse;
    if ui.checkbox("Pulse", &mut show) {
        config.show_pulse = show;
        changed = true;
    }
    let mut showt = config.show_timeline;
    if ui.checkbox("Timeline", &mut showt) {
        config.show_timeline = showt;
        changed = true;
    }
    changed
}
```

- [ ] **Step 4: Wire Timeline into the imgui callback in `src/plugin.rs`**

Find the existing `pub fn imgui(ui: ..., not_loading: bool)` and modify its body so it renders both windows:

```rust
pub fn imgui(ui: &arcdps::imgui::Ui, not_loading: bool) {
    if !not_loading { return; }
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let (state, mut config) = match (G.state.lock(), G.config.lock()) {
            (Ok(s), Ok(c)) => (s, c),
            _ => return,
        };
        crate::ui::pulse::render(ui, &state, &mut config);
        crate::ui::timeline::render(ui, &state, &mut config);
    }));
}
```

- [ ] **Step 5: Verify cross-build**

`cargo dll-check`. Clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/plugin.rs
git commit -m "feat(ui): Timeline window with layer toggles and six swim-lanes"
```

---

### Task 8: Final verification + deploy

**Files:** none (verification).

- [ ] **Step 1: Host tests**

Run: `cd /var/home/mstephens/Documents/GitHub/arcdps-axipulse && cargo test`
Expected: previous 22 tests still pass plus the new ones (`timeline_buckets_test` 5, `timeline_health_test` 3, `timeline_distance_test` 3, `timeline_boons_test` 5, updated `ei_settings_test` 2) → 38 total.

- [ ] **Step 2: Cross build**

Run: `cargo dll-check && cargo dll`
Expected: both clean. DLL size ~38 MB unchanged (UI growth is small).

- [ ] **Step 3: Deploy**

```bash
AXIPULSE_DEPLOY_DEST="/var/mnt/data/SteamLibrary/steamapps/common/Guild Wars 2/addons/arcdps_axipulse.dll" \
    ./scripts/deploy.sh
```

- [ ] **Step 4: Smoke test (user)**

Restart GW2. Verify:
- arcdps options → Windows section shows BOTH `Pulse` and `Timeline` checkboxes.
- Toggling `Timeline` opens / closes a window titled `Timeline`.
- Before next fight: window says "Waiting for the first parsed fight…".
- After a WvW fight: six lanes visible (or only the ones toggled on). Health lane shows green area, damage lanes show red/orange shapes, distance lane shows a yellow curve (or "no commander tagged" if no tag), boon lanes show coloured bars at sub-row offsets.
- Layer toggle checkboxes at the top of the window show/hide individual lanes.

If any lane renders wrong, paste the relevant log lines and a screenshot. Each lane's logic is isolated to one function (`draw_area_lane` / `draw_boon_lane`) so fixes are localised.

- [ ] **Step 5: Commit only if any tweaks were needed**

If smoke passes cleanly: nothing more to commit. Plan is done.

---

## Acceptance

Timeline is done when:

- `cargo test` reports 38 passed on the Linux host.
- `cargo dll-check` and `cargo dll` are clean.
- Both Pulse and Timeline windows appear in-game with separate arcdps checkboxes.
- Each lane renders without panicking.
- Distance to Tag lane correctly shows "no commander tagged" when none, or a meaningful curve when there is one.
- Boon lanes show distinct bars per buff with their names labelled.
- Lane toggles persist across game restarts (via `Config::save()` on close).

## What this plan does NOT cover (could be a Timeline v2)

- **Hover crosshair + tooltip.** AxiPulse's web version shows a vertical line and a per-lane value box at the cursor. ImGui doesn't have great mouse tracking inside immediate-mode draws; this needs `is_mouse_hovering_rect` + per-lane reverse-index into sample arrays. Tractable but ~50–100 additional lines.
- **Drag-to-select windowing.** Same family of work as hover. Not on the critical path for v1.
- **Healing / Barrier lanes.** Need the arcdps healing addon's data path; EI emits them under `extHealingStats` / `extBarrierStats` which we haven't deserialised. Add when the addon plumbing lands.
- **Hard CC / Soft CC lanes.** Need a buff-classification table (Stun/Daze/Knockdown/etc + Cripple/Chilled/Slow/etc) and the same `active_segments` machinery applied to enemy-applied buffs on us. Future work.
- **Phase markers.** EI emits phases; v1 ignores them and treats the fight as one continuous timeline.
- **Per-fight history picker.** Foundation's `AppState` history is unused by Timeline v1 (renders the current fight only).
- **PlotLines fallback.** ImGui has a built-in `plot_lines`; we use the draw list directly because it gives us the area-fill aesthetic AxiPulse uses.

## Self-review notes

- Spec coverage: Health (Task 3), Damage Dealt (Task 2), Damage Taken (Task 2), Distance to Tag (Task 4), Offensive/Defensive Boons (Task 5), per-lane toggles (Task 6), window shell + axis + lane dispatch (Task 7), settings flip (Task 1), verification (Task 8). Every lane the spec calls out has a body.
- Placeholders: none. Stubs in Task 7's window shell are eliminated by the same task — the lane bodies are inline. No `// TODO` remains in final code.
- Type consistency: `BoonSeries`, `Segment` defined in Task 5 are used in Task 7 (`draw_boon_lane`). `TimelineLayers` defined in Task 6 used in Task 7 (`render_lanes`, `render_layer_toggles`). `find_self_index` from Pulse reused unchanged. `format_mmss` is local to `ui/timeline.rs` and not exposed.
