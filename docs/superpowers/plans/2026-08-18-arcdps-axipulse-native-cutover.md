# arcdps-axipulse (Rust plugin) — Native axilog Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse logs in-process with axilog instead of shelling out to the bundled Elite Insights CLI, eliminating the .NET 8 runtime, the ~90 MB `GW2EICLI.zip`, the per-log subprocess, and the ~78 MB JSON document currently deserialized inside the game process.

**Architecture:** `ei_model.rs`'s EI deserialization structs are replaced by `fight_data.rs` — a purpose-built struct holding exactly what the UI reads, built once by `FightData::from_report(&ReportV1)` on the parser worker thread. The `ReportV1` is dropped immediately after, so the large allocation is never retained. That achieves `slim.rs`'s goal by construction, so `slim.rs` is deleted rather than ported.

**Tech Stack:** Rust 2021, `cdylib` for arcdps, imgui, `cargo-xwin` cross-compiling to `x86_64-pc-windows-msvc`, `axilog-api` 1.1.0.

**Spec:** `docs/superpowers/specs/2026-08-18-axilog-migration-design.md` (Parts 1, 3, 4) — in the `axipulse` repo.

**Depends on:** `docs/superpowers/plans/2026-08-18-axilog-v1.1.0-parse-facade.md` — axilog's `v1.1.0` tag must be pushed before Task 1.

**Repo:** `arcdps-axipulse` (`../arcdps-axipulse` relative to axipulse) — **all work in this plan happens there.**

## Global Constraints

- Parse options are **explicit**: `ParseOpts { replay: true, skill_damage: true, timeseries: true, rotation: true, ..Default::default() }`. Never `everything: true` — `modifiers` gates a full extra event pass this plugin does not use.
- A block whose `coverage` reads `not_computed` is a **hard error**. Never render a zero for it, never fall back to EI.
- **The `ReportV1` must not be retained.** `FightRecord` holds `FightData` only. Any code that stores or clones a `ReportV1` past `from_report` defeats the entire memory rationale.
- `ui/map.rs`, `ui/pulse.rs`, `ui/timeline.rs` and `Derived` are **not restructured**. They change by field access only.
- `dist_to_com` is tri-state: absent = pass never ran, `-1` = EI's "nothing qualified" sentinel, `>= 0` = a real distance. Never render `-1`.
- Two times are NOT log-relative: `encounter.markers[].time_ms` and `entities[].commander.segments`. Subtract `encounter.log_start_ms` first.
- `mimalloc` stays. Its private per-thread heaps are why parsing does not contend the shared process-heap lock with the game render thread under Wine — in-process parsing makes that *more* important, not less.
- Every task must keep `cargo xwin check --target x86_64-pc-windows-msvc` green. A change that only builds on Linux is not done.

---

### Task 1: Dependency, fixture, and the equality oracle

**Files:**
- Modify: `Cargo.toml`
- Create: `tests/fixtures/wvw.zevtc`, `tests/fixtures/wvw.ei.json`, `tests/fixtures/README.md`
- Create: `tests/common/mod.rs`

**Interfaces:**
- Produces:
  - `tests::common::fixture_bytes() -> Vec<u8>`
  - `tests::common::native() -> axilog_api::v1::ReportV1`
  - `tests::common::ei() -> crate::ei_model::EiJson` (deleted in Task 8)
  - `tests::common::PARSE_OPTS: axilog_api::ParseOpts`

- [ ] **Step 1: Add the dependency**

In `Cargo.toml`, under `[dependencies]`:

```toml
axilog-api = { git = "https://github.com/darkharasho/axilog.git", tag = "v1.1.0" }
```

Then:
```bash
cd ../arcdps-axipulse && cargo fetch && cargo check
```
Expected: resolves and compiles. If the tag is missing, Plan 1 Task 6 has not been pushed yet — stop here.

- [ ] **Step 2: Verify the Windows cross-build still links**

```bash
cd ../arcdps-axipulse && cargo xwin check --target x86_64-pc-windows-msvc
```
Expected: clean. `axilog-api`'s tree is pure Rust (`thiserror`, `flate2`, `serde`, `serde_json`), so no new toolchain is needed. If this fails, resolve it now — every later task depends on it.

- [ ] **Step 3: Commit the fixture**

Reuse the same anonymized fixture the axipulse plan produced (`axipulse/tests/fixtures/wvw.zevtc`) so both repos are validated against the identical fight:

```bash
mkdir -p tests/fixtures
cp ../axipulse/tests/fixtures/wvw.zevtc tests/fixtures/
cp ../axipulse/tests/fixtures/wvw.ei.json tests/fixtures/
```

Create `tests/fixtures/README.md`:

```markdown
# Test fixtures

- `wvw.zevtc` — an anonymized mid-size WvW fight, shared byte-for-byte
  with `axipulse/tests/fixtures/wvw.zevtc` so both products are validated
  against the same fight.
- `wvw.ei.json` — Elite Insights output for that log, frozen before the
  migration. It is the equality oracle: each `FightData` field family is
  migrated by asserting the native computation matches this. **Delete it,
  and `ei_model.rs`, in the final migration commit.**
```

- [ ] **Step 4: Write the oracle helper and its smoke test**

Create `tests/common/mod.rs`:

```rust
//! Shared fixture loading for the migration's equality-oracle tests.

use std::path::PathBuf;

pub const PARSE_OPTS: axilog_api::ParseOpts = axilog_api::ParseOpts {
    replay: true,
    skill_damage: true,
    timeseries: true,
    rotation: true,
    missiles: false,
    modifiers: false,
    everything: false,
};

fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

pub fn fixture_bytes() -> Vec<u8> {
    std::fs::read(fixture_dir().join("wvw.zevtc")).expect("fixture readable")
}

pub fn native() -> axilog_api::v1::ReportV1 {
    axilog_api::parse_report_v1(&fixture_bytes(), &PARSE_OPTS, Some("wvw.zevtc"))
        .expect("fixture parses")
}

pub fn ei() -> arcdps_axipulse::ei_model::EiJson {
    let raw = std::fs::read_to_string(fixture_dir().join("wvw.ei.json"))
        .expect("EI baseline readable");
    serde_json::from_str(&raw).expect("EI baseline deserializes")
}
```

Create `tests/oracle_test.rs`:

```rust
mod common;

#[test]
fn fixtures_describe_the_same_fight() {
    let n = common::native();
    let e = common::ei();
    let delta = (n.encounter.duration_ms as i64 - e.duration_ms as i64).abs();
    assert!(delta < 1000, "durations differ by {delta}ms");
}

#[test]
fn rosters_agree() {
    let n = common::native();
    let e = common::ei();
    let mut native_accounts: Vec<&str> = n.entities.iter()
        .filter(|x| x.role == "squad")
        .filter_map(|x| x.account.as_deref())
        .collect();
    let mut ei_accounts: Vec<&str> = e.players.iter()
        .filter(|p| !p.is_fake && !p.not_in_squad)
        .map(|p| p.account.as_str())
        .collect();
    native_accounts.sort_unstable();
    ei_accounts.sort_unstable();
    assert_eq!(native_accounts, ei_accounts);
}

#[test]
fn every_block_this_plugin_reads_is_present() {
    let n = common::native();
    for block in ["damage", "defenses", "cc", "boons", "support",
                  "contribution", "healing", "rotation", "replay", "series"] {
        assert_eq!(
            n.coverage.get(block).map(String::as_str),
            Some("present"),
            "block {block} not computed -- PARSE_OPTS has drifted"
        );
    }
}

#[test]
fn local_player_resolves_to_an_entity_id() {
    let n = common::native();
    let id = n.encounter.recorded_by.expect("fixture has a recorder");
    assert!(n.entities.iter().any(|e| e.id == id));
}
```

If `ei_model` is not currently public, add `pub mod ei_model;` to `src/lib.rs` for the migration's duration — Task 8 deletes it.

- [ ] **Step 5: Run the tests**

Run: `cd ../arcdps-axipulse && cargo test --test oracle_test`
Expected: 4 passing. The coverage test is the drift guard — it fails loudly if axilog moves a surface behind a new gate.

- [ ] **Step 6: Commit**

```bash
cd ../arcdps-axipulse
git add Cargo.toml Cargo.lock tests/fixtures tests/common tests/oracle_test.rs src/lib.rs
git commit -m "test: pin axilog-api v1.1.0 and add the equality-oracle fixture"
```

---

### Task 2: `fight_data.rs` — roster and identity

**Files:**
- Create: `src/fight_data.rs`
- Create: `tests/fight_data_identity_test.rs`
- Modify: `src/lib.rs` (`pub mod fight_data;`)

**Interfaces:**
- Produces:
  ```rust
  pub struct FightData {
      pub duration_ms: u64,
      pub map_name: String,
      pub map_id: Option<u32>,
      pub started_at_unix: Option<u64>,
      pub log_start_ms: u64,
      pub self_idx: Option<usize>,
      pub commander_idx: Option<usize>,
      pub players: Vec<PlayerData>,   // role == squad or friendly_player
      pub enemies: Vec<EnemyData>,    // role == enemy_player
  }
  pub struct PlayerData {
      pub entity_id: u32, pub account: String, pub character: String,
      pub profession: String, pub elite_spec: String,
      pub subgroup: i32, pub team: String, pub in_squad: bool,
      pub is_commander: bool,
  }
  pub struct EnemyData {
      pub entity_id: u32, pub name: String, pub team: String,
      pub profession: String,
  }
  impl FightData { pub fn from_report(r: &axilog_api::v1::ReportV1) -> Self }
  ```

Later tasks add fields to `PlayerData`; the struct grows, `from_report` grows with it, and nothing else changes shape.

- [ ] **Step 1: Write the failing test**

Create `tests/fight_data_identity_test.rs`:

```rust
mod common;
use arcdps_axipulse::fight_data::FightData;

#[test]
fn roster_matches_the_ei_oracle() {
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);

    let mut got: Vec<&str> = f.players.iter()
        .filter(|p| p.in_squad).map(|p| p.account.as_str()).collect();
    let mut want: Vec<&str> = e.players.iter()
        .filter(|p| !p.is_fake && !p.not_in_squad).map(|p| p.account.as_str()).collect();
    got.sort_unstable();
    want.sort_unstable();
    assert_eq!(got, want);
}

#[test]
fn identity_fields_match_the_ei_oracle() {
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);
    for p in f.players.iter().filter(|p| p.in_squad) {
        let ep = e.players.iter().find(|x| x.account == p.account)
            .unwrap_or_else(|| panic!("no EI player for {}", p.account));
        assert_eq!(p.profession, ep.profession, "{}", p.account);
        assert_eq!(p.elite_spec, ep.elite_spec, "{}", p.account);
        assert_eq!(p.subgroup, ep.group, "{}", p.account);
    }
}

#[test]
fn self_and_commander_resolve() {
    let f = FightData::from_report(&common::native());
    let si = f.self_idx.expect("fixture has a recorder");
    assert!(si < f.players.len());
    if let Some(ci) = f.commander_idx {
        assert!(f.players[ci].is_commander);
    }
}

#[test]
fn encounter_scalars_match_the_ei_oracle() {
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);
    assert!((f.duration_ms as i64 - e.duration_ms as i64).abs() < 1000);
    assert!(!f.map_name.is_empty());
    // started_at_unix is ABSENT, not zero, on a log with no CBTS_LOGSTART.
    if let Some(t) = f.started_at_unix { assert!(t > 1_600_000_000); }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_identity_test`
Expected: FAIL — `unresolved module fight_data`.

- [ ] **Step 3: Implement**

Create `src/fight_data.rs` with the structs above and `from_report`. Notes that matter:

- Iterate `r.entities` once, partitioning on `role`. `role` is a string: `"squad"`, `"friendly_player"`, `"enemy_player"`, `"npc"`. Drop `"npc"`.
- `in_squad` is `role == "squad"`; `friendly_player` entities go in `players` with `in_squad: false`.
- `self_idx` is the index in `players` whose `entity_id == r.encounter.recorded_by`. This replaces `self_identify.rs` entirely.
- `commander_idx` is the first player with `commander.is_some()`.
- `elite_spec` is an empty string when the agent has none — never a numeric id. Keep the empty string; the UI already handles it.
- Keep an `entity_id -> players index` map as a private field or a returned side map; every later task needs it to join blocks back to rows.

Add `pub mod fight_data;` to `src/lib.rs`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_identity_test`
Expected: 4 passing.

- [ ] **Step 5: Check the cross-build**

Run: `cargo xwin check --target x86_64-pc-windows-msvc`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd ../arcdps-axipulse
git add src/fight_data.rs src/lib.rs tests/fight_data_identity_test.rs
git commit -m "feat(fight_data): project the native roster and encounter identity"
```

---

### Task 3: Damage, defense, support and contribution scalars

**Files:**
- Modify: `src/fight_data.rs`
- Create: `tests/fight_data_scalars_test.rs`

**Interfaces:**
- Produces: these fields on `PlayerData`:

| Field | Native path |
|---|---|
| `damage: u64` | `blocks.damage.by_entity[id].total` |
| `dps: u64` | `blocks.damage.by_entity[id].dps` |
| `damage_taken: u64` | `blocks.damage.by_entity[id].taken` |
| `breakbar_damage: u64` | `blocks.damage.by_entity[id].breakbar_damage_dealt` |
| `downs_dealt: u32` | `blocks.damage.by_entity[id].downs_dealt` |
| `kills_dealt: u32` | `blocks.damage.by_entity[id].kills_dealt` |
| `deaths: u32` | `blocks.defenses.by_entity[id].deaths` |
| `downs: u32` | `blocks.defenses.by_entity[id].downs_taken` |
| `incoming_cc: u32` | `blocks.defenses.by_entity[id].received_cc_count` |
| `incoming_strips: u32` | `blocks.defenses.by_entity[id].boon_strips_taken` |
| `applied_cc: u32` | `blocks.cc.by_entity[id].applied_total` |
| `strips: u32` | `blocks.support.by_entity[id].strips` |
| `cleanses: u32` | `blocks.support.by_entity[id].cleanses` |
| `cleanses_self: u32` | `blocks.support.by_entity[id].cleanses_self` |
| `resurrects: u32` | `blocks.support.by_entity[id].resurrects` |
| `healing_out: u64` | `blocks.healing.by_entity[id].outgoing_allies` |
| `barrier_out: u64` | `blocks.healing.by_entity[id].barrier_out` |
| `downed_healing_out: u64` | `blocks.healing.by_entity[id].downed_healing_out` |
| `down_contribution: u64` | `blocks.contribution.by_entity[id].downs_contribution.damage` |

- [ ] **Step 1: Write the failing test**

Create `tests/fight_data_scalars_test.rs`. For each squad player, assert every integer event count above equals its EI counterpart **exactly** (`strips`, `cleanses`, `deaths`, `downs`, `resurrects`, `incoming_cc`, `incoming_strips`), and assert the summed quantities (`damage`, `damage_taken`, `healing_out`, `barrier_out`) agree within 1%:

```rust
mod common;
use arcdps_axipulse::fight_data::FightData;

fn close(a: u64, b: u64) -> bool {
    if a == 0 && b == 0 { return true }
    let hi = a.max(b) as f64;
    ((a as f64 - b as f64).abs() / hi) < 0.01
}

#[test]
fn event_counts_match_the_ei_oracle_exactly() {
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);
    for p in f.players.iter().filter(|p| p.in_squad) {
        let ep = e.players.iter().find(|x| x.account == p.account).unwrap();
        assert_eq!(p.deaths, ep.defenses[0].dead_count, "{} deaths", p.account);
        assert_eq!(p.downs, ep.defenses[0].down_count, "{} downs", p.account);
        assert_eq!(p.strips, ep.support[0].boon_strips, "{} strips", p.account);
        assert_eq!(p.cleanses, ep.support[0].condi_cleanse, "{} cleanses", p.account);
    }
}

#[test]
fn summed_quantities_match_the_ei_oracle_within_one_percent() {
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);
    for p in f.players.iter().filter(|p| p.in_squad) {
        let ep = e.players.iter().find(|x| x.account == p.account).unwrap();
        assert!(close(p.damage, ep.dps_all[0].damage), "{} damage", p.account);
        assert!(close(p.damage_taken, ep.defenses[0].damage_taken), "{} taken", p.account);
    }
}

#[test]
fn down_contribution_is_the_damage_slice() {
    // Native splits contribution four ways; EI reported one number, which
    // corresponds to the damage slice. Assert the documented RELATIONSHIP.
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);
    for p in f.players.iter().filter(|p| p.in_squad) {
        let ep = e.players.iter().find(|x| x.account == p.account).unwrap();
        assert!(
            p.down_contribution as f64 <= ep.stats_all[0].down_contribution as f64 * 1.01,
            "{} down contribution exceeded EI's total", p.account,
        );
    }
}
```

Field names on the EI side come from `src/ei_model.rs` — read it and use its actual Rust names, not the JSON names.

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_scalars_test`
Expected: FAIL — no such fields on `PlayerData`.

- [ ] **Step 3: Implement**

Extend `PlayerData` and `from_report` per the table. Add a private helper that fetches a block or panics with the coverage state, mirroring axipulse's `requireBlock`:

```rust
fn require<'a, T>(block: Option<&'a T>, name: &str, coverage: &std::collections::BTreeMap<String, String>) -> &'a T {
    block.unwrap_or_else(|| panic!(
        "axilog report is missing the \"{name}\" block (coverage: {})",
        coverage.get(name).map(String::as_str).unwrap_or("absent"),
    ))
}
```

A player entity with no row in a block is a **measured zero** (the block is present), so default those to 0 — that is different from a missing block, which panics.

- [ ] **Step 4: Run to verify it passes**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_scalars_test`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
cd ../arcdps-axipulse
git add src/fight_data.rs tests/fight_data_scalars_test.rs
git commit -m "feat(fight_data): project damage, defense, support and contribution scalars"
```

---

### Task 4: Per-skill distributions

**Files:**
- Modify: `src/fight_data.rs`
- Modify: `src/top_skills.rs`, `src/top_heals.rs`
- Create: `tests/fight_data_skills_test.rs`

**Interfaces:**
- Produces on `PlayerData`:
  - `damage_by_skill: Vec<SkillRow>` ← `blocks.damage.by_entity[id].by_skill`
  - `down_contribution_by_skill: Vec<SkillRow>` ← `blocks.contribution.by_entity[id].downs_contribution_by_skill` (**ungated** — unlike the damage rows)
  - `healing_by_skill: Vec<SkillRow>` ← `blocks.healing.by_entity[id].detail.by_skill`
  - `barrier_by_skill: Vec<SkillRow>` ← `blocks.healing.by_entity[id].detail.barrier_by_skill`
  - `pub struct SkillRow { pub skill_id: u32, pub name: String, pub icon: Option<String>, pub total: u64, pub hits: u32, pub downed: u64 }`

Names and icons come from `catalogs.skills[skillId].{name,icon}` — **no name appears outside `catalogs` and `entities` in this format**, so the join is mandatory. Store the resolved name on the row so `top_skills.rs` and `top_heals.rs` do not need the catalog at render time.

- [ ] **Step 1: Write the failing test**

Assert, for the local player, that `damage_by_skill` is non-empty, every row has a non-empty `name`, the summed `total` is within 1% of `PlayerData::damage`, and the top row by `total` matches the top row of the EI player's `total_damage_dist[0]` by skill id.

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_skills_test`
Expected: FAIL — no such fields.

- [ ] **Step 3: Implement**

Extend `from_report`, then update `top_skills.rs` and `top_heals.rs` to take `&PlayerData` instead of `&EiPlayer`. Their sort-and-take-8 logic is unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_skills_test --test top_skills_test`
Expected: all passing. `tests/top_skills_test.rs` needs its EI fixture swapped for `common::native()`.

- [ ] **Step 5: Commit**

```bash
cd ../arcdps-axipulse
git add src/fight_data.rs src/top_skills.rs src/top_heals.rs tests/fight_data_skills_test.rs tests/top_skills_test.rs
git commit -m "feat(fight_data): project per-skill damage, healing and barrier distributions"
```

---

### Task 5: Boons and per-second series

**Files:**
- Modify: `src/fight_data.rs`
- Modify: `src/boon_uptime.rs`, `src/timeline_boons.rs`, `src/timeline_buckets.rs`, `src/timeline_health.rs`, `src/pulse_metrics.rs`
- Create: `tests/fight_data_series_test.rs`

**Interfaces:**
- Produces on `PlayerData`:
  - `boons: Vec<BoonRow>` ← `blocks.boons.by_entity[id]`, with `BoonRow { buff_id, name, stacking, uptime_pct, avg_stacks, gen_self, gen_group, gen_squad, states: Vec<(u64, i32)> }`
  - `damage_1s: Vec<u64>`, `damage_taken_1s: Vec<u64>` ← `blocks.series.by_entity[id].{damage,damage_taken}`
  - `healing_received_1s: Vec<u64>`, `barrier_received_1s: Vec<u64>` ← `blocks.series.by_entity[id].{healing_received_1s,barrier_received_1s}` — **new in axilog 1.1.0**
  - `health_percents: Vec<(u64, f32)>` ← `blocks.series.by_entity[id].health_percents` (a step-function pair list, NOT a `SeriesOut`)
  - A free function `decode_series(s: &axilog_api::v1::SeriesOut) -> Vec<u64>`

**The RLE decoder.** `SeriesOut` is `{ interval_ms, len, enc, data }` where `enc` is `"raw"` or `"rle"` and **`len` is the DECODED length, not `data.length`**. axilog ships no Rust helper. Write it in `fight_data.rs` and test it first.

`stacking` comes from `catalogs.buffs[buffId].stacking` (`"intensity"` or `"duration"`) — do not infer it from the buff id. Read `uptime_pct` for duration buffs and `avg_stacks` for intensity buffs.

- [ ] **Step 1: Write the failing decoder test**

Create `tests/fight_data_series_test.rs`, starting with the decoder in isolation:

```rust
mod common;
use arcdps_axipulse::fight_data::{decode_series, FightData};
use axilog_api::v1::SeriesOut;

#[test]
fn decodes_raw_series() {
    let s = SeriesOut { interval_ms: 1000, len: 3, enc: "raw".into(),
                        data: serde_json::json!([1, 2, 3]) };
    assert_eq!(decode_series(&s), vec![1, 2, 3]);
}

#[test]
fn expands_rle_runs() {
    let s = SeriesOut { interval_ms: 1000, len: 5, enc: "rle".into(),
                        data: serde_json::json!([[0, 3], [7, 2]]) };
    assert_eq!(decode_series(&s), vec![0, 0, 0, 7, 7]);
}

#[test]
#[should_panic(expected = "expected 5")]
fn rejects_a_length_mismatch() {
    let s = SeriesOut { interval_ms: 1000, len: 5, enc: "rle".into(),
                        data: serde_json::json!([[1, 2]]) };
    decode_series(&s);
}

#[test]
fn every_fixture_series_decodes_to_its_declared_length() {
    let n = common::native();
    let series = n.blocks.series.as_ref().expect("series present");
    for (id, e) in &series.by_entity {
        assert_eq!(decode_series(&e.damage).len(), e.damage.len as usize, "entity {id}");
        assert_eq!(decode_series(&e.damage_taken).len(), e.damage_taken.len as usize, "entity {id}");
    }
}

#[test]
fn incoming_healing_matches_the_ei_oracle() {
    let n = common::native();
    let e = common::ei();
    let f = FightData::from_report(&n);
    let p = &f.players[f.self_idx.unwrap()];
    let ep = e.players.iter().find(|x| x.account == p.account).unwrap();
    let ei_last = ep.ext_healing_stats.as_ref()
        .and_then(|h| h.healing_received_1s.first())
        .and_then(|v| v.last()).copied().unwrap_or(0);
    let got = *p.healing_received_1s.last().unwrap_or(&0);
    assert!(ei_last > 0, "fixture must exercise the healing extension");
    assert!(((got as f64 - ei_last as f64).abs() / ei_last as f64) < 0.01);
}
```

Adjust `SeriesOut`'s literal construction to whatever `axilog-schema` actually declares — check with `grep -n "pub struct SeriesOut" -A 8 ~/.cargo/git/checkouts/axilog-*/*/crates/axilog-schema/src/v1/series.rs`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_series_test`
Expected: FAIL — `decode_series` not found.

- [ ] **Step 3: Implement**

Write `decode_series` in `fight_data.rs`, panicking on a length mismatch with a message containing `expected {len}`. Extend `PlayerData` and `from_report`. Then update `boon_uptime.rs`, `timeline_boons.rs`, `timeline_buckets.rs`, `timeline_health.rs` and `pulse_metrics.rs` to read `&PlayerData` instead of `&EiPlayer` — their arithmetic is unchanged, only the source fields move.

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
cd ../arcdps-axipulse
cargo test --test fight_data_series_test --test boon_uptime_test --test timeline_boons_test --test timeline_buckets_test --test timeline_health_test --test pulse_metrics_test
```
Expected: all passing. The five pre-existing suites need their EI fixtures swapped for `common::native()`.

- [ ] **Step 5: Commit**

```bash
cd ../arcdps-axipulse
git add src/fight_data.rs src/boon_uptime.rs src/timeline_*.rs src/pulse_metrics.rs tests/
git commit -m "feat(fight_data): project boons and per-second series, add the RLE decoder"
```

---

### Task 6: Replay, distance and teams

**Files:**
- Modify: `src/fight_data.rs`
- Modify: `src/timeline_distance.rs`, `src/wvw_teams.rs`, `src/fight_composition.rs`, `src/map/wvw.rs`
- Create: `tests/fight_data_replay_test.rs`

**Interfaces:**
- Produces on `PlayerData`:
  - `positions: Vec<(f32, f32)>` ← `blocks.replay.tracks` (raw world inches)
  - `down_ranges: Vec<(u64, u64)>`, `dead_ranges: Vec<(u64, u64)>` ← `blocks.replay.by_entity[id].{down,dead}`
  - `dc_ranges: Vec<(u64, u64)>` ← `blocks.replay.by_entity[id].dc`
  - `active_ms: u64` ← `blocks.replay.by_entity[id].active_ms`
  - `dist_to_com: Option<f32>` — **`None` for both absent AND `-1`**
  - `casts: Vec<CastRow>` ← `blocks.rotation.by_entity[id]` (already flat and time-ordered)
- And on `FightData`: `arena: Option<Arena>` ← `blocks.replay.arena`.

**Projection.** Positions are raw world inches. `ui/map.rs` currently uses EI's `inchToPixel` and 750px-squeezed `sizes`; replace both with the `arena` rect:

```rust
let px = (x - a.world_min_x) / (a.world_max_x - a.world_min_x) * a.image_width;
let py = (1.0 - (y - a.world_min_y) / (a.world_max_y - a.world_min_y)) * a.image_height;
```

World y grows northward and image y grows downward — hence the flip.

**`wvw_teams.rs`.** Its 189 lines of `teamID`/`teamId`/`isFake` inference collapse to grouping `entities[].team` by `role`. Delete the inference; keep the colour mapping.

- [ ] **Step 1: Write the failing test**

Assert: every player's `positions` array has the same length (one polling grid); `dead_ranges.len()` equals `deaths`; `dist_to_com` is `None` or `>= 0.0` and **never** `-1.0`; the commander's first position projects inside `[0, image_width] × [0, image_height]`; and `casts` is non-decreasing in time.

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test fight_data_replay_test`
Expected: FAIL — no such fields.

- [ ] **Step 3: Implement**

Extend `PlayerData`/`FightData`, then update `timeline_distance.rs`, `wvw_teams.rs`, `fight_composition.rs` and `map/wvw.rs`. In `timeline_distance.rs`, preserve the existing runback-exclusion behaviour — read the function before rewriting it.

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
cd ../arcdps-axipulse
cargo test --test fight_data_replay_test --test timeline_distance_test --test wvw_map_replay_parse_test --test wvw_zone_resolve_test
```
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
cd ../arcdps-axipulse
git add src/fight_data.rs src/timeline_distance.rs src/wvw_teams.rs src/fight_composition.rs src/map/wvw.rs tests/
git commit -m "feat(fight_data): project replay tracks, intervals, casts and the arena rect"
```

---

### Task 7: Rewire `Derived`, `state` and the UI

**Files:**
- Modify: `src/derived.rs`, `src/squad_rank.rs`, `src/state.rs`
- Modify: `src/ui/main.rs`, `src/ui/pulse.rs`, `src/ui/timeline.rs`, `src/ui/map.rs`, `src/ui/team_bar.rs`
- Delete: `src/self_identify.rs`, `tests/self_identify_test.rs`

**Interfaces:**
- `Derived::compute(&FightData) -> Derived` (was `(&EiJson)`). Its field list is unchanged.
- `FightRecord.data: FightData` (was `EiJson`).
- `squad_rank::rank_in_squad(&FightData, usize) -> ...` (was `(&EiJson, usize)`).

**`self_identify.rs` is deleted outright** — `FightData::self_idx` is resolved from `encounter.recorded_by` in Task 2, so the 24-line heuristic has no caller.

- [ ] **Step 1: Write the failing test**

Extend `tests/squad_rank_test.rs` to build a `FightData` from `common::native()` and assert every rank falls in `[1, squad_size]` and that the local player's damage rank matches ranking the EI oracle's squad by `dps_all[0].damage`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test squad_rank_test`
Expected: FAIL — `Derived::compute` still expects `&EiJson`.

- [ ] **Step 3: Change the signatures**

Change `Derived::compute`, `squad_rank::rank_in_squad` and `FightRecord.data` to `FightData`. Then let the compiler drive the UI changes: `cargo check` and fix each error. They are field renames, chiefly:

| Old | New |
|---|---|
| `json.players[i].group` | `fight.players[i].subgroup` |
| `json.players[i].team_id` | `fight.players[i].team` (a `String`) |
| `json.duration_ms` | `fight.duration_ms` |
| `json.fight_name` | `fight.map_name` |
| `find_self_index(json)` | `fight.self_idx` |
| `json.combat_replay_meta_data.polling_rate` | the `arena` projection from Task 6 |

**`fight_name` had EI's `"Detailed WvW - "` prefix** that `plugin.rs:354` strips. `encounter.map` carries no such prefix — delete the `strip_prefix` call rather than leaving it as a no-op.

- [ ] **Step 4: Delete the dead identifier**

```bash
cd ../arcdps-axipulse
git rm src/self_identify.rs tests/self_identify_test.rs
```
Remove its `mod` declaration from `src/lib.rs`.

- [ ] **Step 5: Run the full suite and both builds**

Run:
```bash
cd ../arcdps-axipulse
cargo test
cargo xwin check --target x86_64-pc-windows-msvc
```
Expected: green and clean.

- [ ] **Step 6: Commit**

```bash
cd ../arcdps-axipulse
git add -A src tests
git commit -m "refactor: read FightData throughout Derived, state and the UI"
```

---

### Task 8: Swap the parse path and delete Elite Insights

**Files:**
- Modify: `src/plugin.rs` (`:325-360`)
- Modify: `src/lib.rs`, `src/config.rs`, `src/ui/options.rs`, `Cargo.toml`
- Delete: `src/ei_parser.rs`, `src/ei_bundle.rs`, `src/ei_settings.rs`, `src/ei_model.rs`, `src/slim.rs`, `scripts/fetch_ei.sh`, `tests/ei_bundle_test.rs`, `tests/ei_model_test.rs`, `tests/ei_settings_test.rs`, `tests/slim_test.rs`, `tests/fixtures/wvw.ei.json`
- Modify: `.github/workflows/release.yml` (drop the EI/.NET bundling steps)

**Interfaces:**
- Produces: `parse_log(path: &Path) -> Result<FightData, ParseError>` in a new `src/parse.rs` — replacing `ei_parser::parse_log(&install_root, &settings, &path)`. No install root, no settings.

- [ ] **Step 1: Write the failing test**

Create `tests/parse_test.rs`:

```rust
mod common;
use arcdps_axipulse::parse::parse_log;

#[test]
fn parses_the_fixture_to_fight_data() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/wvw.zevtc");
    let f = parse_log(&path).expect("parses");
    assert!(!f.players.is_empty());
    assert!(f.duration_ms > 0);
    assert!(f.self_idx.is_some());
}

#[test]
fn reports_a_useful_error_on_a_missing_file() {
    assert!(parse_log(std::path::Path::new("/nonexistent.zevtc")).is_err());
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ../arcdps-axipulse && cargo test --test parse_test`
Expected: FAIL — `unresolved module parse`.

- [ ] **Step 3: Implement the new parse path**

Create `src/parse.rs`:

```rust
//! Reading a log, start to finish, inside the game process.
//!
//! There is no subprocess, no .NET runtime and no intermediate JSON: the
//! bytes go straight into axilog and come back out as a `FightData`. The
//! `ReportV1` is dropped at the end of `parse_log` and never retained --
//! that is the whole reason `slim.rs` no longer exists.

use std::path::Path;
use crate::fight_data::FightData;

const PARSE_OPTS: axilog_api::ParseOpts = axilog_api::ParseOpts {
    replay: true,
    skill_damage: true,
    timeseries: true,
    rotation: true,
    missiles: false,
    modifiers: false,
    everything: false,
};

#[derive(Debug)]
pub enum ParseError {
    Io(std::io::Error),
    Parse(String),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::Io(e) => write!(f, "reading the log failed: {e}"),
            ParseError::Parse(e) => write!(f, "parsing the log failed: {e}"),
        }
    }
}

pub fn parse_log(path: &Path) -> Result<FightData, ParseError> {
    let bytes = std::fs::read(path).map_err(ParseError::Io)?;
    let name = path.file_name().and_then(|s| s.to_str());
    let report = axilog_api::parse_report_v1(&bytes, &PARSE_OPTS, name)
        .map_err(|e| ParseError::Parse(e.to_string()))?;
    Ok(FightData::from_report(&report))
    // `report` drops here. Nothing downstream ever sees a ReportV1.
}
```

Add `pub mod parse;` to `src/lib.rs`.

- [ ] **Step 4: Rewire `plugin.rs`**

Replace `:325-360` so it calls `crate::parse::parse_log(&path)`, drops the `install_root` and `settings` lookups, drops `slim_after_derive`, and drops the `"Detailed WvW - "` strip. The `FightRecord` construction becomes:

```rust
    match crate::parse::parse_log(&path) {
        Ok(fight) => {
            let derived = std::sync::Arc::new(crate::derived::Derived::compute(&fight));
            let map = fight.map_name.clone();
            let counts = crate::wvw_teams::count_teams(&fight);
            let record = FightRecord {
                log_path: path,
                parsed_at: std::time::SystemTime::now(),
                data: fight,
                derived,
            };
```

- [ ] **Step 5: Delete Elite Insights**

```bash
cd ../arcdps-axipulse
git rm src/ei_parser.rs src/ei_bundle.rs src/ei_settings.rs src/ei_model.rs src/slim.rs \
       scripts/fetch_ei.sh \
       tests/ei_bundle_test.rs tests/ei_model_test.rs tests/ei_settings_test.rs tests/slim_test.rs \
       tests/fixtures/wvw.ei.json
```

Then by hand:
- Remove those `mod` declarations from `src/lib.rs`.
- Remove the EI/.NET panel from `src/ui/options.rs` and the EI settings fields from `src/config.rs`.
- Remove `common::ei()` from `tests/common/mod.rs` and every oracle assertion that used it — the oracle has served its purpose and the EI types it needs are gone. Keep the coverage-drift test and every native-only assertion.
- Remove `tests/fixtures/README.md`'s `wvw.ei.json` entry.
- Drop the EI download and .NET bundling steps from `.github/workflows/release.yml`.

Check whether `zip` and `flate2` still have a user before removing them from `Cargo.toml`:

```bash
grep -rn "zip::\|flate2::\|use zip\|use flate2" src/
```
Remove each dependency only if that grep returns nothing for it. `tile_fetcher.rs` and `updater.rs` are the likely remaining users — do not assume.

- [ ] **Step 6: Full verification**

Run:
```bash
cd ../arcdps-axipulse
cargo test
cargo xwin check --target x86_64-pc-windows-msvc
cargo dll
grep -rn "EiJson\|ei_parser\|ei_bundle\|GW2EICLI\|dotnet\|\.NET" src/ Cargo.toml .github/
```
Expected: green tests, clean cross-check, a built DLL, and **no output from the grep**.

- [ ] **Step 7: Manual smoke test in game**

Install the built DLL, run a WvW fight, and confirm: the parse toast appears within about a second of the log landing (it took seconds-to-minutes before), Pulse shows non-zero damage / strips / boons / healing, Timeline draws every lane including incoming healing and barrier, Map draws positions with the commander centred and the correct arena image, and the team bar shows the right enemy team colours. Confirm the options panel no longer offers an EI or .NET section.

- [ ] **Step 8: Commit**

```bash
cd ../arcdps-axipulse
git add -A
git commit -m "feat: parse logs in-process with axilog, remove Elite Insights and the .NET bundle"
```

---

### Task 9: Measure the new footprint and raise `HISTORY_CAP`

**Files:**
- Modify: `src/state.rs` (the `HISTORY_CAP` constant and its comment)

`HISTORY_CAP` was cut from 32 to 8 because a retained `EiJson` cost ~15-25 MB slimmed and ~78 MB before. `FightData` should be far smaller — but the spec is explicit that this is raised on a **measurement, not on faith**, which is why it is a separate task after the migration ships.

- [ ] **Step 1: Measure**

Add a temporary log line in `plugin.rs` after `FightRecord` construction:

```rust
log::warn!(
    "axipulse: FightData retained size ~{} KB",
    std::mem::size_of_val(&record.data) / 1024
        + record.data.players.iter().map(|p|
            p.positions.len() * 8
            + p.damage_1s.len() * 8
            + p.damage_taken_1s.len() * 8
            + p.boons.iter().map(|b| b.states.len() * 12).sum::<usize>()
        ).sum::<usize>() / 1024,
);
```

Run a real mid-size WvW fight and read the number from the arcdps log.

- [ ] **Step 2: Set the cap from the measurement**

Pick a cap that bounds worst-case retention around ~200 MB, matching the reasoning already in the constant's comment. Update both the value and the comment with the measured per-fight figure and the date it was measured.

- [ ] **Step 3: Remove the temporary logging and verify**

Delete the log line, then:
```bash
cd ../arcdps-axipulse && cargo test && cargo xwin check --target x86_64-pc-windows-msvc
```
Expected: green and clean.

- [ ] **Step 4: Commit**

```bash
cd ../arcdps-axipulse
git add src/state.rs src/plugin.rs
git commit -m "perf(state): raise HISTORY_CAP now that FightData replaces the retained EI JSON"
```

---

## Done when

- `cargo test` and `cargo xwin check --target x86_64-pc-windows-msvc` are green, and `cargo dll` builds.
- `grep -rn "EiJson\|ei_parser\|GW2EICLI\|dotnet" src/ Cargo.toml .github/` returns nothing.
- The shipped DLL carries no `.NET` runtime and no `GW2EICLI.zip`.
- A real WvW fight parses in about a second with no post-fight hitch, and Pulse, Timeline and Map all render correctly.
