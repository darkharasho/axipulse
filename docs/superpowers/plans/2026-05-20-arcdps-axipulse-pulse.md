# arcdps-axipulse Pulse Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an in-game ImGui overlay window with five tabbed subviews (Overview / Damage / Support / Defense / Boons) showing the local player's last-fight Pulse metrics, sourced from the `FightRecord` that Foundation populates.

**Architecture:** Data-prep functions (self-identification, squad ranks, top-skills, boon uptimes) live in fresh, host-testable modules. UI is a single `src/ui/pulse.rs` ImGui window styled after `arcdps-team-breakdown`'s breakdown view, with a tab strip that renders subviews inline. The window reads the latest `FightRecord` through the existing `AppState` mutex, with no caching of derived values on hot paths — Pulse renders are cheap. arcdps's `imgui` and `options_windows` callbacks are added to the existing `arcdps::export!` macro.

**Tech Stack:** Same as Foundation — `arcdps` crate's imgui bindings (vendored from team-breakdown), `serde` for config, `once_cell` for globals. No new crate dependencies.

---

## File Structure

```
arcdps-axipulse/
  src/
    self_identify.rs      NEW   find the EiPlayer matching recorded_account_by
    squad_rank.rs         NEW   per-metric rank within squad (notInSquad == false)
    top_skills.rs         NEW   damage / damage-taken / down-contribution rollups from totalDamageDist
    boon_uptime.rs        NEW   id→name lookup + uptime extraction from buff_uptimes
    config.rs             MOD   add show_pulse, pulse_pos, pulse_hotkey
    plugin.rs             MOD   register imgui, options_windows callbacks
    ui/
      mod.rs              NEW   module list
      pulse.rs            NEW   window shell + tab strip + 5 subview render fns
      options.rs          NEW   arcdps options pane: show-pulse checkbox
    lib.rs                MOD   extend arcdps::export! with new callbacks
  tests/
    self_identify_test.rs NEW   matches by recorded_account_by, falls back to has_commander_tag
    squad_rank_test.rs    NEW   ranks within squad-only subset, ties broken by name
    top_skills_test.rs    NEW   sorts by damage / down_contribution, filters zeros
    boon_uptime_test.rs   NEW   percentage vs intensity stacking, known boon IDs
```

Why this split: each new file maps to one specific data-shaping responsibility, and each is pure-Rust (no `cfg(windows)`), so it builds and tests on the Linux host. UI is `cfg(windows)`-only because `arcdps::imgui` is. Keeping data-prep separate from UI rendering lets the host CI catch logic errors without a Wine build.

---

## Conventions

- **`Account` identity:** every comparison against the local player uses `EiPlayer.account` (the colon-prefixed account name, e.g. `:Darkharasho.6502`), not character name. `recorded_account_by` from `EiJson` is the source of truth for "us". If absent or unmatched, fall back to `has_commander_tag == true` and then to `players[0]` (best-effort; rendered metrics will still be meaningful as long as the rank/uptime functions are agnostic to which player they're given).
- **Squad scope:** "squad" means `players.iter().filter(|p| !p.not_in_squad)`. This includes the local player even if solo (squad of 1).
- **Boon IDs:** hard-coded in `boon_uptime.rs` for the ~13 standard WvW boons. Future plans can deserialise `buff_map` for arbitrary IDs.
- **ImGui idioms:** match `arcdps-team-breakdown`'s style — `WindowPadding [12,10]`, `WindowRounding 8`, `WindowBg [0.06,0.07,0.09,0.86]`, dark panels, full-width value bars via the draw list. Re-use functions where it would be a verbatim copy.

---

### Task 1: `self_identify` — find the local player in `EiJson`

**Files:**
- Create: `src/self_identify.rs`
- Test: `tests/self_identify_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/self_identify_test.rs
use arcdps_axipulse::ei_model::EiJson;
use arcdps_axipulse::self_identify::find_self_index;

fn json_with_recorded(recorded: Option<&str>, players: &[(&str, bool)]) -> EiJson {
    let mut accounts = String::new();
    for (i, (acc, cmdr)) in players.iter().enumerate() {
        if i > 0 { accounts.push(','); }
        accounts.push_str(&format!(
            r#"{{"name":"p{i}","account":"{acc}","profession":"Guardian","hasCommanderTag":{cmdr}}}"#
        ));
    }
    let rec = recorded.map(|s| format!(r#","recordedAccountBy":"{s}""#)).unwrap_or_default();
    let s = format!(
        r#"{{"fightName":"t","durationMS":1{rec},"players":[{accounts}],"targets":[]}}"#
    );
    serde_json::from_str(&s).expect("parse")
}

#[test]
fn matches_recorded_account_by_when_present() {
    let j = json_with_recorded(Some(":Alice.1234"), &[
        (":Bob.5555", false),
        (":Alice.1234", false),
        (":Carol.9999", true),
    ]);
    assert_eq!(find_self_index(&j), Some(1));
}

#[test]
fn falls_back_to_commander_tag_when_recorded_missing() {
    let j = json_with_recorded(None, &[
        (":Bob.5555", false),
        (":Alice.1234", false),
        (":Carol.9999", true),
    ]);
    assert_eq!(find_self_index(&j), Some(2));
}

#[test]
fn falls_back_to_first_player_when_no_signals() {
    let j = json_with_recorded(None, &[
        (":Bob.5555", false),
        (":Alice.1234", false),
    ]);
    assert_eq!(find_self_index(&j), Some(0));
}

#[test]
fn returns_none_for_empty_roster() {
    let j: EiJson = serde_json::from_str(r#"{"fightName":"t","durationMS":1,"players":[],"targets":[]}"#).unwrap();
    assert_eq!(find_self_index(&j), None);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /var/home/mstephens/Documents/GitHub/arcdps-axipulse && cargo test --test self_identify_test`
Expected: FAIL with `no function find_self_index`.

- [ ] **Step 3: Implement `src/self_identify.rs`**

```rust
//! Identify the local player in a parsed `EiJson`.
//!
//! Priority order:
//!   1. `recorded_account_by` exact match against `EiPlayer.account`
//!   2. first player with `has_commander_tag == true`
//!   3. first player
//!   4. None (empty roster)

use crate::ei_model::EiJson;

pub fn find_self_index(json: &EiJson) -> Option<usize> {
    if json.players.is_empty() {
        return None;
    }
    if let Some(acc) = json.recorded_account_by.as_deref() {
        if let Some(idx) = json.players.iter().position(|p| p.account == acc) {
            return Some(idx);
        }
    }
    if let Some(idx) = json.players.iter().position(|p| p.has_commander_tag) {
        return Some(idx);
    }
    Some(0)
}
```

- [ ] **Step 4: Wire into `src/lib.rs`**

Add `pub mod self_identify;` to the module list (alongside the other `pub mod` lines, before the `#[cfg(windows)]` block).

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test --test self_identify_test`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/self_identify.rs src/lib.rs tests/self_identify_test.rs
git commit -m "feat: identify local player from EI fight record"
```

---

### Task 2: `squad_rank` — rank a player within the squad on a metric

**Files:**
- Create: `src/squad_rank.rs`
- Test: `tests/squad_rank_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/squad_rank_test.rs
use arcdps_axipulse::ei_model::EiJson;
use arcdps_axipulse::squad_rank::{rank_in_squad, RankMetric};

fn json_with(values: &[(&str, bool, u64)]) -> EiJson {
    // (account, notInSquad, damage)
    let mut players = String::new();
    for (i, (acc, not_in_squad, dmg)) in values.iter().enumerate() {
        if i > 0 { players.push(','); }
        players.push_str(&format!(
            r#"{{"name":"p{i}","account":"{acc}","profession":"Guardian",
              "notInSquad":{not_in_squad},"dpsAll":[{{"damage":{dmg},"dps":0}}]}}"#
        ));
    }
    let s = format!(r#"{{"fightName":"t","durationMS":1,"players":[{players}],"targets":[]}}"#);
    serde_json::from_str(&s).expect("parse")
}

#[test]
fn ranks_only_among_squad_members() {
    // Two non-squad players have higher damage, but rank is within squad only.
    let j = json_with(&[
        (":InSquadLow.1",  false, 100),
        (":InSquadHigh.2", false, 500),
        (":NonSquadTop.3", true, 9999),
        (":InSquadMid.4",  false, 300),
    ]);
    assert_eq!(rank_in_squad(&j, 0, RankMetric::Damage), Some(3)); // 100 → last
    assert_eq!(rank_in_squad(&j, 1, RankMetric::Damage), Some(1)); // 500 → first
    assert_eq!(rank_in_squad(&j, 2, RankMetric::Damage), None);    // non-squad → no rank
    assert_eq!(rank_in_squad(&j, 3, RankMetric::Damage), Some(2)); // 300 → middle
}

#[test]
fn out_of_range_returns_none() {
    let j = json_with(&[(":A.1", false, 100)]);
    assert_eq!(rank_in_squad(&j, 99, RankMetric::Damage), None);
}

#[test]
fn solo_squad_ranks_first() {
    let j = json_with(&[(":Solo.1", false, 100)]);
    assert_eq!(rank_in_squad(&j, 0, RankMetric::Damage), Some(1));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test squad_rank_test`
Expected: FAIL — no `squad_rank` module.

- [ ] **Step 3: Implement `src/squad_rank.rs`**

```rust
//! Rank a player within the squad subset on a single metric.

use crate::ei_model::EiJson;
use crate::pulse_metrics;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RankMetric {
    Damage,
    DownContribution,
    Cleanses,
    Strips,
    DamageTaken,
}

/// Returns `Some(rank)` where rank is 1-indexed among squad members
/// (`not_in_squad == false`). Returns `None` if the target isn't a
/// squad member or the index is out of range. Ties keep the natural
/// roster order — the earlier player gets the better rank.
pub fn rank_in_squad(json: &EiJson, target_idx: usize, metric: RankMetric) -> Option<u32> {
    let target = json.players.get(target_idx)?;
    if target.not_in_squad {
        return None;
    }
    let value_of = |p: &crate::ei_model::EiPlayer| -> u64 {
        match metric {
            RankMetric::Damage           => pulse_metrics::damage(p),
            RankMetric::DownContribution => pulse_metrics::down_contribution(p),
            RankMetric::Cleanses         => pulse_metrics::cleanses(p),
            RankMetric::Strips           => pulse_metrics::strips(p),
            RankMetric::DamageTaken      => pulse_metrics::damage_taken(p),
        }
    };
    let target_value = value_of(target);
    // 1 + count of squad members strictly greater (this gives 1 for the
    // top, and resolves ties in favour of the earlier roster entry).
    let better_count = json.players.iter().enumerate()
        .filter(|(i, p)| !p.not_in_squad && *i != target_idx && value_of(p) > target_value)
        .count();
    Some(better_count as u32 + 1)
}
```

- [ ] **Step 4: Wire into `src/lib.rs`**

Add `pub mod squad_rank;` to the module list.

- [ ] **Step 5: Run tests, expect 3 passed**

Run: `cargo test --test squad_rank_test`

- [ ] **Step 6: Commit**

```bash
git add src/squad_rank.rs src/lib.rs tests/squad_rank_test.rs
git commit -m "feat: rank player metrics within squad subset"
```

---

### Task 3: `top_skills` — extract top damage / damage-taken skills

**Files:**
- Create: `src/top_skills.rs`
- Test: `tests/top_skills_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/top_skills_test.rs
use arcdps_axipulse::ei_model::EiJson;
use arcdps_axipulse::top_skills::{top_damage, top_down_contribution, SkillEntry};

fn json_with_dist() -> EiJson {
    serde_json::from_str(r#"{
        "fightName":"t","durationMS":1,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "totalDamageDist":[[
                {"id":1,"name":"Skill A","totalDamage":500,"downContribution":50},
                {"id":2,"name":"Skill B","totalDamage":1000,"downContribution":10},
                {"id":3,"name":"Skill C","totalDamage":0,"downContribution":0},
                {"id":4,"name":"Skill D","totalDamage":200,"downContribution":80}
            ]]
        }],
        "targets":[]
    }"#).unwrap()
}

#[test]
fn top_damage_sorts_descending_and_filters_zero() {
    let j = json_with_dist();
    let top = top_damage(&j.players[0], 10);
    assert_eq!(top.len(), 3); // Skill C (0 dmg) filtered out
    assert_eq!(top[0].name, "Skill B");
    assert_eq!(top[0].damage, 1000);
    assert_eq!(top[1].name, "Skill A");
    assert_eq!(top[2].name, "Skill D");
}

#[test]
fn top_damage_respects_limit() {
    let j = json_with_dist();
    let top = top_damage(&j.players[0], 2);
    assert_eq!(top.len(), 2);
    assert_eq!(top[0].name, "Skill B");
    assert_eq!(top[1].name, "Skill A");
}

#[test]
fn top_down_contribution_sorts_and_filters() {
    let j = json_with_dist();
    let top = top_down_contribution(&j.players[0], 10);
    assert_eq!(top.len(), 3);
    assert_eq!(top[0].name, "Skill D"); // 80
    assert_eq!(top[1].name, "Skill A"); // 50
    assert_eq!(top[2].name, "Skill B"); // 10
}

#[test]
fn empty_dist_returns_empty() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":1,
        "players":[{"name":"x","account":":x.1","profession":"Guardian"}],
        "targets":[]
    }"#).unwrap();
    assert_eq!(top_damage(&j.players[0], 10), Vec::<SkillEntry>::new());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test top_skills_test`

- [ ] **Step 3: Implement `src/top_skills.rs`**

```rust
//! Roll up `EiPlayer.totalDamageDist` into sortable per-skill entries.
//!
//! EI emits `totalDamageDist` as a 2-level array: phases × skill entries.
//! For the WvW use case we flatten across all phases (Pulse is single-fight,
//! so phases == 1 in practice).

use crate::ei_model::EiPlayer;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillEntry {
    pub id: i64,
    pub name: String,
    pub damage: u64,
    pub down_contribution: u64,
}

fn flatten(p: &EiPlayer) -> Vec<SkillEntry> {
    let mut entries: Vec<SkillEntry> = Vec::new();
    for phase in &p.total_damage_dist {
        for e in phase {
            entries.push(SkillEntry {
                id: e.id,
                name: e.name.clone(),
                damage: e.total_damage,
                down_contribution: e.down_contribution,
            });
        }
    }
    entries
}

pub fn top_damage(p: &EiPlayer, limit: usize) -> Vec<SkillEntry> {
    let mut entries = flatten(p);
    entries.retain(|e| e.damage > 0);
    entries.sort_by(|a, b| b.damage.cmp(&a.damage));
    entries.truncate(limit);
    entries
}

pub fn top_down_contribution(p: &EiPlayer, limit: usize) -> Vec<SkillEntry> {
    let mut entries = flatten(p);
    entries.retain(|e| e.down_contribution > 0);
    entries.sort_by(|a, b| b.down_contribution.cmp(&a.down_contribution));
    entries.truncate(limit);
    entries
}
```

- [ ] **Step 4: Wire into `src/lib.rs`**

Add `pub mod top_skills;`.

- [ ] **Step 5: Run tests, expect 4 passed**

- [ ] **Step 6: Commit**

```bash
git add src/top_skills.rs src/lib.rs tests/top_skills_test.rs
git commit -m "feat: extract top damage and down-contribution skills"
```

---

### Task 4: `boon_uptime` — id→name table + uptime extraction

**Files:**
- Create: `src/boon_uptime.rs`
- Test: `tests/boon_uptime_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/boon_uptime_test.rs
use arcdps_axipulse::ei_model::EiJson;
use arcdps_axipulse::boon_uptime::{collect_uptimes, boon_name, BoonStacking, BoonUptime};

#[test]
fn boon_name_returns_known_names() {
    assert_eq!(boon_name(740), Some("Might"));
    assert_eq!(boon_name(725), Some("Fury"));
    assert_eq!(boon_name(1187), Some("Quickness"));
    assert_eq!(boon_name(30328), Some("Alacrity"));
    assert_eq!(boon_name(717), Some("Protection"));
    assert_eq!(boon_name(1122), Some("Stability"));
    assert_eq!(boon_name(743), Some("Aegis"));
    assert_eq!(boon_name(999_999), None);
}

#[test]
fn boon_name_classifies_stacking() {
    use arcdps_axipulse::boon_uptime::boon_stacking;
    // Intensity-stacked: Might, Stability
    assert_eq!(boon_stacking(740), BoonStacking::Intensity);
    assert_eq!(boon_stacking(1122), BoonStacking::Intensity);
    // Duration-stacked: Fury, Protection, Quickness, Alacrity, Aegis
    assert_eq!(boon_stacking(725), BoonStacking::Duration);
    assert_eq!(boon_stacking(717), BoonStacking::Duration);
    assert_eq!(boon_stacking(1187), BoonStacking::Duration);
    assert_eq!(boon_stacking(30328), BoonStacking::Duration);
    assert_eq!(boon_stacking(743), BoonStacking::Duration);
}

#[test]
fn collect_uptimes_returns_known_boons_in_canonical_order() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":1,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "buffUptimes":[
                {"id":725,"buffData":[{"uptime":85.5}]},
                {"id":740,"buffData":[{"uptime":18.3}]},
                {"id":999999,"buffData":[{"uptime":50.0}]},
                {"id":1187,"buffData":[{"uptime":42.1}]}
            ]
        }],
        "targets":[]
    }"#).unwrap();
    let ups = collect_uptimes(&j.players[0]);
    // Unknown ID 999999 dropped; remaining in canonical order: Might, Fury, Quickness.
    assert_eq!(ups.len(), 3);
    assert_eq!(ups[0], BoonUptime { id: 740, name: "Might", uptime: 18.3, stacking: BoonStacking::Intensity });
    assert_eq!(ups[1], BoonUptime { id: 725, name: "Fury", uptime: 85.5, stacking: BoonStacking::Duration });
    assert_eq!(ups[2], BoonUptime { id: 1187, name: "Quickness", uptime: 42.1, stacking: BoonStacking::Duration });
}

#[test]
fn missing_buff_data_yields_zero_uptime() {
    let j: EiJson = serde_json::from_str(r#"{
        "fightName":"t","durationMS":1,
        "players":[{
            "name":"me","account":":me.1","profession":"Guardian",
            "buffUptimes":[{"id":740,"buffData":[]}]
        }],
        "targets":[]
    }"#).unwrap();
    let ups = collect_uptimes(&j.players[0]);
    assert_eq!(ups[0].uptime, 0.0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test boon_uptime_test`

- [ ] **Step 3: Implement `src/boon_uptime.rs`**

```rust
//! Standard-WvW boon table + uptime extraction from `EiPlayer.buff_uptimes`.
//!
//! Hard-coded id→name list because we don't deserialise EI's top-level
//! `buffMap`. The 13 entries below cover every boon Pulse cares about.

use crate::ei_model::EiPlayer;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoonStacking {
    /// Stacks (e.g. Might 0–25, Stability 0–25).
    Intensity,
    /// Percentage uptime (0–100).
    Duration,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoonUptime {
    pub id: i64,
    pub name: &'static str,
    /// Stacks if Intensity, percent (0–100) if Duration.
    pub uptime: f64,
    pub stacking: BoonStacking,
}

/// Canonical render order. Pulse's Boons subview iterates this list and
/// only renders entries that the player's `buff_uptimes` contains.
pub const KNOWN_BOONS: &[(i64, &str, BoonStacking)] = &[
    (740,   "Might",       BoonStacking::Intensity),
    (725,   "Fury",        BoonStacking::Duration),
    (1187,  "Quickness",   BoonStacking::Duration),
    (30328, "Alacrity",    BoonStacking::Duration),
    (717,   "Protection",  BoonStacking::Duration),
    (718,   "Regeneration",BoonStacking::Duration),
    (726,   "Vigor",       BoonStacking::Duration),
    (719,   "Swiftness",   BoonStacking::Duration),
    (26980, "Resistance",  BoonStacking::Duration),
    (1122,  "Stability",   BoonStacking::Intensity),
    (743,   "Aegis",       BoonStacking::Duration),
    (873,   "Resolution",  BoonStacking::Duration),
    (757,   "Retaliation", BoonStacking::Duration),
];

pub fn boon_name(id: i64) -> Option<&'static str> {
    KNOWN_BOONS.iter().find(|(i, _, _)| *i == id).map(|(_, n, _)| *n)
}

pub fn boon_stacking(id: i64) -> BoonStacking {
    KNOWN_BOONS.iter().find(|(i, _, _)| *i == id)
        .map(|(_, _, s)| *s)
        .unwrap_or(BoonStacking::Duration)
}

pub fn collect_uptimes(p: &EiPlayer) -> Vec<BoonUptime> {
    // Build a lookup of id → first buffData.uptime for O(1) access while
    // we iterate KNOWN_BOONS in canonical order.
    let mut by_id: std::collections::HashMap<i64, f64> =
        std::collections::HashMap::with_capacity(p.buff_uptimes.len());
    for entry in &p.buff_uptimes {
        let uptime = entry.buff_data.first().map(|d| d.uptime).unwrap_or(0.0);
        by_id.insert(entry.id, uptime);
    }
    KNOWN_BOONS.iter()
        .filter_map(|(id, name, stacking)| {
            by_id.get(id).map(|uptime| BoonUptime {
                id: *id, name, uptime: *uptime, stacking: *stacking,
            })
        })
        .collect()
}
```

- [ ] **Step 4: Wire into `src/lib.rs`**

Add `pub mod boon_uptime;`.

- [ ] **Step 5: Run tests, expect 4 passed**

- [ ] **Step 6: Commit**

```bash
git add src/boon_uptime.rs src/lib.rs tests/boon_uptime_test.rs
git commit -m "feat: standard boon table and uptime collection"
```

---

### Task 5: Extend `Config` with Pulse visibility + position

**Files:**
- Modify: `src/config.rs`

- [ ] **Step 1: Add fields to `Config`**

Replace the existing `Config` struct in `src/config.rs` with:

```rust
//! Plugin config persisted to JSON next to the DLL (axipulse.json).

use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Empty = autodetect under %USERPROFILE%\Documents\Guild Wars 2\addons\arcdps\arcdps.cbtlogs
    pub cbtlogs_path: String,
    pub debug_logging: bool,
    /// Whether the Pulse window is currently rendered.
    pub show_pulse: bool,
    /// Last-known position of the Pulse window in screen coordinates.
    /// None means "let ImGui pick the default on first frame".
    pub pulse_pos: Option<(f32, f32)>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            cbtlogs_path: String::new(),
            debug_logging: false,
            show_pulse: true,
            pulse_pos: None,
        }
    }
}

pub fn config_path() -> PathBuf {
    let mut p = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    p.set_file_name("axipulse.json");
    p
}

impl Config {
    pub fn load() -> Self {
        let p = config_path();
        std::fs::read_to_string(&p).ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self) {
        let p = config_path();
        if let Ok(s) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(p, s);
        }
    }
}

pub fn default_cbtlogs() -> Option<PathBuf> {
    let userprofile = std::env::var("USERPROFILE").ok()?;
    let mut p = PathBuf::from(userprofile);
    p.push("Documents"); p.push("Guild Wars 2");
    p.push("addons"); p.push("arcdps"); p.push("arcdps.cbtlogs");
    Some(p)
}
```

- [ ] **Step 2: Verify host + cross checks pass**

Run:
```bash
cargo check
cargo dll-check
```

Both should pass — `#[serde(default)]` ensures old JSON files without the new fields load with defaults.

- [ ] **Step 3: Commit**

```bash
git add src/config.rs
git commit -m "feat(config): track Pulse window visibility and position"
```

---

### Task 6: `ui` module scaffolding

**Files:**
- Create: `src/ui/mod.rs`
- Create: `src/ui/pulse.rs` (skeleton — subview bodies fill in across Tasks 7–11)
- Create: `src/ui/options.rs`

- [ ] **Step 1: Write `src/ui/mod.rs`**

```rust
#![cfg(windows)]
//! ImGui overlay rendering for axipulse. All children are gated on
//! `cfg(windows)` because `arcdps::imgui` ships Windows-only.

pub mod options;
pub mod pulse;
```

- [ ] **Step 2: Write `src/ui/pulse.rs` skeleton**

```rust
#![cfg(windows)]
//! Pulse window — five tabbed subviews showing the local player's
//! last-fight metrics.

use std::sync::Mutex;

use arcdps::imgui::{Condition, StyleColor, StyleVar, Ui};
use once_cell::sync::Lazy;

use crate::config::Config;
use crate::ei_model::EiJson;
use crate::self_identify::find_self_index;
use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Subview { Overview, Damage, Support, Defense, Boons }

static SUBVIEW: Lazy<Mutex<Subview>> = Lazy::new(|| Mutex::new(Subview::Overview));

/// Entry point called from `plugin::imgui`. Renders the Pulse window
/// when `config.show_pulse` is true.
pub fn render(ui: &Ui, state: &AppState, config: &mut Config) {
    if !config.show_pulse { return; }

    let style_tokens = [
        ui.push_style_var(StyleVar::WindowPadding([12.0, 10.0])),
        ui.push_style_var(StyleVar::WindowRounding(8.0)),
        ui.push_style_var(StyleVar::WindowBorderSize(0.0)),
        ui.push_style_var(StyleVar::FrameRounding(4.0)),
        ui.push_style_var(StyleVar::ItemSpacing([8.0, 6.0])),
    ];
    let color_tokens = [
        ui.push_style_color(StyleColor::WindowBg,      [0.06, 0.07, 0.09, 0.86]),
        ui.push_style_color(StyleColor::TitleBg,       [0.06, 0.07, 0.09, 0.95]),
        ui.push_style_color(StyleColor::TitleBgActive, [0.10, 0.11, 0.14, 0.95]),
        ui.push_style_color(StyleColor::Separator,     [1.0, 1.0, 1.0, 0.06]),
    ];

    let mut window = ui.window("Pulse").size([520.0, 480.0], Condition::FirstUseEver);
    if let Some(pos) = config.pulse_pos {
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

        render_tab_strip(ui);
        ui.separator();

        let subview = SUBVIEW.lock().ok().map(|g| *g).unwrap_or(Subview::Overview);
        match subview {
            Subview::Overview => render_overview(ui, json, idx),
            Subview::Damage   => render_damage(ui, json, idx),
            Subview::Support  => render_support(ui, json, idx),
            Subview::Defense  => render_defense(ui, json, idx),
            Subview::Boons    => render_boons(ui, json, idx),
        }
    });

    // Persist position back to config.
    // (ImGui's window-pos getter requires the window be open; we use
    // io.mouse_pos as a no-op proxy here — Tasks 13+ may persist
    // position via WindowFlags + cursor screen pos.)
    if !open {
        config.show_pulse = false;
        config.save();
    }

    for tok in color_tokens { tok.end(); }
    for tok in style_tokens { tok.end(); }
}

fn render_tab_strip(ui: &Ui) {
    let mut current = SUBVIEW.lock().ok().map(|g| *g).unwrap_or(Subview::Overview);
    for (label, sv) in [
        ("Overview", Subview::Overview),
        ("Damage",   Subview::Damage),
        ("Support",  Subview::Support),
        ("Defense",  Subview::Defense),
        ("Boons",    Subview::Boons),
    ] {
        if ui.radio_button_bool(label, current == sv) {
            current = sv;
        }
        ui.same_line();
    }
    ui.new_line();
    if let Ok(mut g) = SUBVIEW.lock() { *g = current; }
}

// Subview bodies — filled in across Tasks 7–11. Stubs print "TODO".
fn render_overview(ui: &Ui, _json: &EiJson, _idx: usize) { ui.text("overview — Task 7"); }
fn render_damage  (ui: &Ui, _json: &EiJson, _idx: usize) { ui.text("damage — Task 8"); }
fn render_support (ui: &Ui, _json: &EiJson, _idx: usize) { ui.text("support — Task 9"); }
fn render_defense (ui: &Ui, _json: &EiJson, _idx: usize) { ui.text("defense — Task 10"); }
fn render_boons   (ui: &Ui, _json: &EiJson, _idx: usize) { ui.text("boons — Task 11"); }
```

- [ ] **Step 3: Write `src/ui/options.rs`**

```rust
#![cfg(windows)]
//! arcdps options pane integration: a checkbox in the standard window
//! list to toggle the Pulse overlay.

use arcdps::imgui::Ui;

use crate::config::Config;

pub fn render_window_checkboxes(ui: &Ui, config: &mut Config) -> bool {
    let mut changed = false;
    let mut show = config.show_pulse;
    if ui.checkbox("Pulse", &mut show) {
        config.show_pulse = show;
        changed = true;
    }
    changed
}
```

- [ ] **Step 4: Wire `ui` into `src/lib.rs`**

In `src/lib.rs`, add `#[cfg(windows)] pub mod ui;` near the other `#[cfg(windows)]` modules.

- [ ] **Step 5: Verify cross-build still passes**

Run: `cargo dll-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/lib.rs
git commit -m "feat(ui): scaffold Pulse window with subview tab strip"
```

---

### Task 7: Overview subview body

**Files:**
- Modify: `src/ui/pulse.rs` — replace the `render_overview` stub.

- [ ] **Step 1: Replace `render_overview`**

In `src/ui/pulse.rs`, replace the stub `fn render_overview` line with:

```rust
fn render_overview(ui: &Ui, json: &EiJson, idx: usize) {
    use crate::pulse_metrics::*;
    use crate::squad_rank::{rank_in_squad, RankMetric};

    let p = &json.players[idx];
    let dmg = damage(p);
    let dps_v = dps_value(p);
    let dc = down_contribution(p);
    let cl = cleanses(p);
    let st = strips(p);
    let dt = damage_taken(p);
    let d_to_tag = dist_to_tag(p);
    let deaths_n = deaths(p);
    let downs_n = downs(p);

    // Hero block — damage + DPS, two big numbers side-by-side.
    ui.text_colored([0.92, 0.40, 0.40, 1.0], "DAMAGE DEALT");
    ui.text(format_damage(dmg));
    ui.same_line();
    ui.text_disabled(format!("({} DPS)", format_damage(dps_v)));
    if let Some(r) = rank_in_squad(json, idx, RankMetric::Damage) {
        ui.same_line();
        ui.text_disabled(format!("· {} in squad", ordinal(r)));
    }
    ui.separator();

    // 6-cell grid via simple two-column layout.
    let cell = |ui: &Ui, label: &str, value: String, rank: Option<u32>| {
        ui.text_colored([0.65, 0.65, 0.72, 1.0], label);
        ui.text(value);
        if let Some(r) = rank {
            ui.same_line();
            ui.text_disabled(format!("· {} in squad", ordinal(r)));
        }
        ui.spacing();
    };

    cell(ui, "DOWN CONTRIBUTION", dc.to_string(),
         rank_in_squad(json, idx, RankMetric::DownContribution));
    cell(ui, "DEATHS / DOWNS", format!("{deaths_n} / {downs_n}"), None);
    cell(ui, "STRIPS", st.to_string(),
         rank_in_squad(json, idx, RankMetric::Strips));
    cell(ui, "CLEANSES", cl.to_string(),
         rank_in_squad(json, idx, RankMetric::Cleanses));
    cell(ui, "DAMAGE TAKEN", format_damage(dt),
         rank_in_squad(json, idx, RankMetric::DamageTaken));
    cell(ui, "DISTANCE TO TAG", if d_to_tag > 0.0 { format!("{:.0}", d_to_tag) } else { "—".into() }, None);
}

fn format_damage(d: u64) -> String {
    if d >= 1_000_000 { format!("{:.1}M", d as f64 / 1_000_000.0) }
    else if d >= 1_000 { format!("{:.1}k", d as f64 / 1_000.0) }
    else { format!("{d}") }
}

fn ordinal(n: u32) -> String {
    let s = ["th","st","nd","rd"];
    let v = (n % 100) as usize;
    let suffix = if v >= 20 { s.get(v % 10).copied().unwrap_or("th") }
                 else { s.get(v).copied().unwrap_or("th") };
    format!("{n}{suffix}")
}
```

- [ ] **Step 2: Type-check**

Run: `cargo dll-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/pulse.rs
git commit -m "feat(pulse): Overview subview with hero damage + 6 stat cells"
```

---

### Task 8: Damage subview body

**Files:**
- Modify: `src/ui/pulse.rs` — replace the `render_damage` stub.

- [ ] **Step 1: Replace `render_damage`**

```rust
fn render_damage(ui: &Ui, json: &EiJson, idx: usize) {
    use crate::pulse_metrics::*;
    use crate::top_skills::top_damage;

    let p = &json.players[idx];
    let dmg = damage(p);
    let dps_v = dps_value(p);
    let dc = down_contribution(p);

    ui.text_colored([0.92, 0.40, 0.40, 1.0], "TOTAL DAMAGE");
    ui.text(format_damage(dmg));
    ui.same_line();
    ui.text_disabled(format!("({} DPS)", format_damage(dps_v)));
    ui.spacing();

    ui.text_colored([0.97, 0.45, 0.45, 1.0], "DOWN CONTRIBUTION");
    ui.text(dc.to_string());
    ui.separator();

    let skills = top_damage(p, 8);
    if skills.is_empty() {
        ui.text_disabled("No skill damage recorded.");
        return;
    }
    let max = skills.first().map(|e| e.damage).unwrap_or(1).max(1);
    let total: u64 = skills.iter().map(|e| e.damage).sum();
    ui.text_disabled("TOP SKILLS");
    for entry in &skills {
        let frac = entry.damage as f32 / max as f32;
        let pct = if total > 0 { entry.damage as f64 / total as f64 * 100.0 } else { 0.0 };
        draw_skill_bar(ui, &entry.name, frac, pct, format_damage(entry.damage));
    }
}

/// Full-width row: text label, percent overlay, damage right-aligned,
/// behind a coloured backing bar.
fn draw_skill_bar(ui: &Ui, name: &str, frac: f32, pct: f64, value: String) {
    let avail = ui.content_region_avail()[0].max(120.0);
    let row_h = (ui.text_line_height() * 1.5).max(22.0);
    let cursor = ui.cursor_screen_pos();
    let draw = ui.get_window_draw_list();

    draw.add_rect([cursor[0], cursor[1]],
                  [cursor[0] + avail, cursor[1] + row_h],
                  [0.10, 0.12, 0.15, 1.0])
        .filled(true).rounding(4.0).build();

    let bar_w = avail * frac.clamp(0.0, 1.0);
    if bar_w > 0.5 {
        draw.add_rect([cursor[0], cursor[1]],
                      [cursor[0] + bar_w, cursor[1] + row_h],
                      [0.85, 0.30, 0.30, 0.55])
            .filled(true).rounding(4.0).build();
    }

    let pad = 8.0;
    let text_y = cursor[1] + (row_h - ui.text_line_height()) * 0.5;
    let label = if name.is_empty() { "(unnamed skill)" } else { name };
    draw.add_text([cursor[0] + pad + 1.0, text_y + 1.0], [0.0, 0.0, 0.0, 0.55], label);
    draw.add_text([cursor[0] + pad, text_y], [1.0, 1.0, 1.0, 0.97], label);

    let pct_label = if pct >= 0.1 { format!("{:.1}%", pct) } else { String::new() };
    let val_w = ui.calc_text_size(&value)[0];
    let pct_w = ui.calc_text_size(&pct_label)[0];
    draw.add_text([cursor[0] + avail - pad - val_w, text_y], [1.0, 1.0, 1.0, 0.95], &value);
    if !pct_label.is_empty() {
        draw.add_text(
            [cursor[0] + avail - pad - val_w - 12.0 - pct_w, text_y],
            [0.85, 0.85, 0.85, 0.85], &pct_label,
        );
    }

    ui.set_cursor_screen_pos(cursor);
    ui.invisible_button(format!("##sk-{}", name), [avail, row_h]);
    ui.spacing();
}
```

- [ ] **Step 2: Type-check**

Run: `cargo dll-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/pulse.rs
git commit -m "feat(pulse): Damage subview with top-skill bars"
```

---

### Task 9: Support subview body

**Files:**
- Modify: `src/ui/pulse.rs` — replace the `render_support` stub.

- [ ] **Step 1: Replace `render_support`**

```rust
fn render_support(ui: &Ui, json: &EiJson, idx: usize) {
    use crate::pulse_metrics::*;
    use crate::squad_rank::{rank_in_squad, RankMetric};

    let p = &json.players[idx];
    let st = strips(p);
    let cl = cleanses(p);
    let cl_self = cleanse_self(p);

    ui.text_colored([0.45, 0.85, 0.65, 1.0], "BOON STRIPS");
    ui.text(st.to_string());
    if let Some(r) = rank_in_squad(json, idx, RankMetric::Strips) {
        ui.same_line();
        ui.text_disabled(format!("· {} in squad", ordinal(r)));
    }
    ui.spacing();

    ui.text_colored([0.45, 0.85, 0.65, 1.0], "CLEANSES");
    ui.text(format!("{cl} ({cl_self} self)"));
    if let Some(r) = rank_in_squad(json, idx, RankMetric::Cleanses) {
        ui.same_line();
        ui.text_disabled(format!("· {} in squad", ordinal(r)));
    }
    ui.separator();
    ui.text_disabled("Per-skill heal / barrier breakdowns require the");
    ui.text_disabled("arcdps healing addon — not wired in Pulse v1.");
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cargo dll-check`

```bash
git add src/ui/pulse.rs
git commit -m "feat(pulse): Support subview with strips and cleanses"
```

---

### Task 10: Defense subview body

**Files:**
- Modify: `src/ui/pulse.rs` — replace the `render_defense` stub.

- [ ] **Step 1: Replace `render_defense`**

```rust
fn render_defense(ui: &Ui, json: &EiJson, idx: usize) {
    use crate::pulse_metrics::*;

    let p = &json.players[idx];
    let dt = damage_taken(p);
    let deaths_n = deaths(p);
    let downs_n = downs(p);
    let dodges_n = dodges(p);
    let blocked_n = blocked(p);
    let evaded_n = evaded(p);
    let missed_n = missed(p);
    let invulned_n = invulned(p);
    let interrupted_n = interrupted(p);
    let cc_in = incoming_cc(p);
    let strips_in = incoming_strips(p);

    ui.text_colored([0.95, 0.55, 0.45, 1.0], "DAMAGE TAKEN");
    ui.text(format_damage(dt));
    ui.spacing();

    let alive_color = if deaths_n == 0 { [0.40, 0.85, 0.55, 1.0] } else { [0.95, 0.40, 0.40, 1.0] };
    ui.text_colored(alive_color, "DEATHS / DOWNS");
    ui.text(format!("{deaths_n} / {downs_n}"));
    ui.separator();

    // Mitigation row + stacked breakdown.
    let mitigation_total = blocked_n + evaded_n + missed_n + invulned_n + interrupted_n;
    ui.text_disabled("MITIGATION");
    ui.text(mitigation_total.to_string());
    ui.same_line();
    ui.text_disabled("attacks avoided");

    let cell = |ui: &Ui, label: &str, value: u32| {
        ui.text_colored([0.65, 0.68, 0.78, 1.0], label);
        ui.text(value.to_string());
        ui.spacing();
    };
    cell(ui, "BLOCKED",     blocked_n);
    cell(ui, "EVADED",      evaded_n);
    cell(ui, "DODGES",      dodges_n);
    cell(ui, "MISSED",      missed_n);
    cell(ui, "INVULNED",    invulned_n);
    cell(ui, "INTERRUPTED", interrupted_n);
    ui.separator();

    ui.text_colored([0.95, 0.75, 0.40, 1.0], "INCOMING CC");
    ui.text(cc_in.to_string());
    ui.spacing();
    ui.text_colored([0.95, 0.75, 0.40, 1.0], "INCOMING STRIPS");
    ui.text(strips_in.to_string());
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cargo dll-check`

```bash
git add src/ui/pulse.rs
git commit -m "feat(pulse): Defense subview with mitigation breakdown"
```

---

### Task 11: Boons subview body

**Files:**
- Modify: `src/ui/pulse.rs` — replace the `render_boons` stub.

- [ ] **Step 1: Replace `render_boons`**

```rust
fn render_boons(ui: &Ui, json: &EiJson, idx: usize) {
    use crate::boon_uptime::{collect_uptimes, BoonStacking};

    let p = &json.players[idx];
    let ups = collect_uptimes(p);
    if ups.is_empty() {
        ui.text_disabled("No boon uptimes recorded for this fight.");
        return;
    }
    ui.text_disabled("BOON UPTIME");
    for boon in &ups {
        let (frac, label) = match boon.stacking {
            BoonStacking::Intensity => {
                let max_stacks = if boon.name == "Might" { 25.0 } else { 25.0 };
                let f = (boon.uptime / max_stacks).clamp(0.0, 1.0) as f32;
                (f, format!("{:.1} stacks", boon.uptime))
            }
            BoonStacking::Duration => {
                let f = (boon.uptime / 100.0).clamp(0.0, 1.0) as f32;
                (f, format!("{:.1}%", boon.uptime))
            }
        };
        draw_boon_bar(ui, boon.name, frac, label, boon_color(boon.name));
    }
}

fn boon_color(name: &str) -> [f32; 4] {
    match name {
        "Might"        => [0.91, 0.36, 0.23, 1.0],
        "Fury"         => [0.91, 0.60, 0.23, 1.0],
        "Quickness"    => [0.75, 0.42, 0.94, 1.0],
        "Alacrity"     => [0.94, 0.42, 0.74, 1.0],
        "Protection"   => [0.36, 0.61, 0.83, 1.0],
        "Regeneration" => [0.29, 0.86, 0.50, 1.0],
        "Vigor"        => [0.64, 0.90, 0.21, 1.0],
        "Swiftness"    => [0.98, 0.80, 0.08, 1.0],
        "Resistance"   => [0.77, 0.64, 0.35, 1.0],
        "Stability"    => [0.96, 0.62, 0.04, 1.0],
        "Aegis"        => [0.49, 0.83, 0.99, 1.0],
        "Resolution"   => [0.65, 0.51, 0.91, 1.0],
        "Retaliation"  => [0.98, 0.57, 0.20, 1.0],
        _              => [0.55, 0.55, 0.62, 1.0],
    }
}

fn draw_boon_bar(ui: &Ui, name: &str, frac: f32, label: String, color: [f32; 4]) {
    let avail = ui.content_region_avail()[0].max(120.0);
    let row_h = (ui.text_line_height() * 1.5).max(22.0);
    let cursor = ui.cursor_screen_pos();
    let draw = ui.get_window_draw_list();

    draw.add_rect([cursor[0], cursor[1]],
                  [cursor[0] + avail, cursor[1] + row_h],
                  [0.10, 0.12, 0.15, 1.0])
        .filled(true).rounding(4.0).build();

    let bar_w = avail * frac.clamp(0.0, 1.0);
    if bar_w > 0.5 {
        let mut bc = color; bc[3] = 0.55;
        draw.add_rect([cursor[0], cursor[1]],
                      [cursor[0] + bar_w, cursor[1] + row_h], bc)
            .filled(true).rounding(4.0).build();
    }

    let pad = 8.0;
    let text_y = cursor[1] + (row_h - ui.text_line_height()) * 0.5;
    draw.add_text([cursor[0] + pad + 1.0, text_y + 1.0], [0.0, 0.0, 0.0, 0.55], name);
    draw.add_text([cursor[0] + pad,        text_y],       color, name);

    let label_w = ui.calc_text_size(&label)[0];
    draw.add_text([cursor[0] + avail - pad - label_w + 1.0, text_y + 1.0],
                  [0.0, 0.0, 0.0, 0.55], &label);
    draw.add_text([cursor[0] + avail - pad - label_w,       text_y],
                  [1.0, 1.0, 1.0, 0.97], &label);

    ui.set_cursor_screen_pos(cursor);
    ui.invisible_button(format!("##boon-{}", name), [avail, row_h]);
    ui.spacing();
}
```

- [ ] **Step 2: Type-check + commit**

Run: `cargo dll-check`

```bash
git add src/ui/pulse.rs
git commit -m "feat(pulse): Boons subview with uptime bars"
```

---

### Task 12: Register `imgui` + `options_windows` callbacks

**Files:**
- Modify: `src/lib.rs`
- Modify: `src/plugin.rs`

- [ ] **Step 1: Extend `arcdps::export!` in `src/lib.rs`**

Replace the existing macro invocation block:

```rust
#[cfg(windows)]
arcdps::export! {
    name: "axipulse",
    sig: 0x4A1B0DBE,
    init: plugin::init,
    release: plugin::release,
    imgui: plugin::imgui,
    options_windows: plugin::options_windows,
}
```

- [ ] **Step 2: Add `imgui` and `options_windows` to `src/plugin.rs`**

Append below the existing `release()` function:

```rust
pub fn imgui(ui: &arcdps::imgui::Ui, not_loading: bool) {
    if !not_loading { return; }
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let (state, mut config) = match (G.state.lock(), G.config.lock()) {
            (Ok(s), Ok(c)) => (s, c),
            _ => return,
        };
        crate::ui::pulse::render(ui, &state, &mut config);
    }));
}

pub fn options_windows(ui: &arcdps::imgui::Ui, window_name: Option<&str>) -> bool {
    if window_name.is_some() { return false; }
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if let Ok(mut c) = G.config.lock() {
            if crate::ui::options::render_window_checkboxes(ui, &mut c) {
                c.save();
            }
        }
    }));
    false
}
```

- [ ] **Step 3: Verify cross-build**

Run: `cargo dll-check`
Expected: clean.

Also: `cargo dll`. Expected: builds; DLL grows by a few hundred KB at most.

- [ ] **Step 4: Commit**

```bash
git add src/lib.rs src/plugin.rs
git commit -m "feat(plugin): wire imgui and options_windows callbacks"
```

---

### Task 13: Final cargo test + cross-build sweep

**Files:** none (verification only).

- [ ] **Step 1: Run host tests**

Run: `cd /var/home/mstephens/Documents/GitHub/arcdps-axipulse && cargo test`
Expected: All previous Foundation tests still pass (7) plus the 4 new test files (`self_identify_test` 4, `squad_rank_test` 3, `top_skills_test` 4, `boon_uptime_test` 4) → 22 passed.

- [ ] **Step 2: Run cross-build**

Run: `cargo dll-check && cargo dll`
Expected: both clean, DLL built.

- [ ] **Step 3: Deploy and smoke**

```bash
AXIPULSE_DEPLOY_DEST="/var/mnt/data/SteamLibrary/steamapps/common/Guild Wars 2/addons/arcdps_axipulse.dll" \
    ./scripts/deploy.sh
```

Restart GW2. Verify:
- arcdps options window now lists a `Pulse` checkbox under "Window".
- Toggling that checkbox opens / closes a window titled `Pulse`.
- Until your next WvW fight: the window shows "Waiting for the first parsed fight…".
- After a WvW fight: the tab strip works, each tab renders, numbers match what AxiPulse would show for the same log.

If any subview crashes or numbers look wrong, paste the relevant lines from `arcdps.log` and the specific subview, then iterate on that subview's `render_*` function only.

- [ ] **Step 4: Final commit only if any tweaks were needed**

If no tweaks: nothing to commit. The plan is done.

---

## Acceptance

Pulse is done when:

- `cargo test` reports 22 passed on the Linux host.
- `cargo dll-check` and `cargo dll` are clean.
- The Pulse window appears in-game with a working tab strip.
- Each subview renders without panicking.
- Numbers shown match AxiPulse's renderings of the same `.zevtc` to within rounding (e.g. AxiPulse's `1.2k` may match our `1.2k` exactly, or differ by one decimal place).
- Toggling the checkbox in arcdps options persists across game restarts.

## What this plan does NOT cover (deferred to Timeline plan or a Pulse v2)

- Skill icons. Loading them would require porting team-breakdown's `ui/textures.rs` and either bundling a static icon set or fetching from `wiki.guildwars2.com` on first sight of each ID. Out of scope for Pulse v1.
- Per-source boon generation breakdown. The data is already deserialised as `HashMap<String, f64>`; rendering it well needs sorting + thresholding choices best made after we see live Pulse usage.
- Healing / barrier subviews — those need the arcdps healing addon's data path, not just EI.
- History picker (show previous fights). Foundation's `AppState` history buffer is unused by Pulse v1; that's fine.
- Hotkey to toggle the window. The arcdps-options checkbox is the single source of truth in v1.
- Per-fight rank-among-squad columns for the Boons subview. Boon ranks add UI density without much insight beyond uptime; defer.
- Animated transitions between subviews. ImGui makes this awkward; we'd need to manage transient state per frame. AxiPulse's framer-motion is irreplaceable here without much effort and is not worth replicating.

## Self-review notes (controller filled this in)

- Spec coverage: Overview (Task 7), Damage (Task 8), Support (Task 9), Defense (Task 10), Boons (Task 11), self-id (Task 1), ranks (Task 2), top-skills (Task 3), boons table (Task 4), config additions (Task 5), UI scaffolding (Task 6), callback registration (Task 12), smoke test (Task 13). Every subview the spec calls out has a body.
- Placeholders: subview stubs in Task 6 are intentional — they get replaced verbatim in Tasks 7–11. No "TBD" / "TODO" left in final code.
- Type consistency: `SkillEntry`, `BoonUptime`, `RankMetric` defined in Tasks 2–4 are referenced correctly in Tasks 7–11. `find_self_index` returns `Option<usize>`, used as such in Task 6's render entry.
