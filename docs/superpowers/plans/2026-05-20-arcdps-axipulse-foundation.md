# arcdps-axipulse Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a new Rust arcdps plugin (`arcdps_axipulse`) that watches the arcdps `cbtlogs` directory, runs a bundled Elite Insights CLI on each new `.evtc`/`.zevtc`, deserialises the resulting JSON into a typed Rust model, and stores the most recent fight in shared state ready for UI plans to consume.

**Architecture:** Re-use the `arcdps-team-breakdown` plugin scaffold (MSVC build via `cargo-xwin`, `arcdps::export!`, `once_cell::Lazy<Mutex<…>>` globals, vendored `arcdps` crate). EI is bundled as a `.zip` embedded into the DLL at build time via `include_bytes!`; on first plugin init it is extracted into `%LOCALAPPDATA%\Axipulse\eicli\` if not already present. A background watcher thread (`notify` crate) detects new logs, debounces writes, runs the EI CLI in a subprocess, decompresses the `.json.gz`, deserialises with `serde_json` into our subset model, and pushes the result into `AppState` behind a mutex. This plan stops at "parsed fight in memory" — Pulse and Timeline rendering are separate plans.

**Tech Stack:** Rust 2021, `arcdps` (vendored fork from team-breakdown), `serde`/`serde_json`, `notify` for filesystem watching, `flate2` for gzip, `zip` for embedded EI archive extraction. Target: `x86_64-pc-windows-msvc` via `cargo-xwin` cross-compile from Linux.

---

## File Structure

```
arcdps-axipulse/                    NEW sibling repo of arcdps-team-breakdown
  Cargo.toml                          deps, MSVC target config, cargo aliases
  rust-toolchain.toml                 pinned toolchain (msvc target installed)
  README.md                           build + install instructions
  CLAUDE.md                           build pitfalls (mirror team-breakdown's)
  scripts/
    deploy.sh                         atomic install into addons/arcdps/
    fetch_ei.sh                       one-time helper: download GW2EICLI.zip into vendor/
  vendor/
    arcdps/                           copied from arcdps-team-breakdown
    GW2EICLI.zip                      bundled EI release archive (gitignored, fetched via script)
  src/
    lib.rs                            arcdps::export! macro, module list
    plugin.rs                         init/release/combat/imgui callbacks + globals
    config.rs                         persisted settings (cbtlogs override, EI version, debug)
    ei_bundle.rs                      extract bundled GW2EICLI.zip on first run
    ei_parser.rs                      run EI subprocess + gunzip + deserialise
    ei_settings.rs                    generate settings.conf for EI CLI
    ei_model.rs                       serde structs for the EI JSON subset we need
    watcher.rs                        notify-based cbtlogs watcher, debounced
    state.rs                          AppState: current_fight + history ring buffer
    pulse_metrics.rs                  derive Pulse numbers from EiPlayer (port of dashboardMetrics.ts)
    diag.rs                           panic-safe logging helpers (mirror team-breakdown)
  tests/
    ei_model_test.rs                  serde round-trip on a fixture JSON
    pulse_metrics_test.rs             derives match known fixture values
    ei_settings_test.rs               settings.conf generation matches axipulse output
    ei_bundle_test.rs                 zip extraction into a temp dir
  fixtures/
    sample-fight.json                 trimmed real EI output, ~1MB, gitignored
```

Module split mirrors `arcdps-team-breakdown`: `plugin.rs` holds globals and arcdps callbacks; everything else is `#[cfg(windows)]`-free where possible so it can be unit-tested on the Linux host. Only `plugin.rs` and `watcher.rs` need `#[cfg(windows)]` gating; `ei_parser.rs`, `ei_model.rs`, `ei_settings.rs`, `pulse_metrics.rs`, `state.rs`, and `ei_bundle.rs` build and test on Linux.

---

### Task 1: Project scaffold

**Files:**
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`
- Create: `src/lib.rs`
- Create: `.gitignore`
- Create: `.cargo/config.toml`

- [ ] **Step 1: Initialise new sibling repo**

In the parent dir (`/var/home/mstephens/Documents/GitHub/`):

```bash
mkdir arcdps-axipulse && cd arcdps-axipulse
git init
cp -r ../arcdps-team-breakdown/vendor ./vendor
```

- [ ] **Step 2: Write `Cargo.toml`**

```toml
[package]
name = "arcdps_axipulse"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[target.'cfg(windows)'.dependencies]
arcdps = { path = "vendor/arcdps", features = ["extras", "log"] }
windows = { version = "0.62", features = [
    "Win32_Foundation",
    "Win32_System_Memory",
] }

[dependencies]
once_cell = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
log = "0.4"
notify = "6"
zip = { version = "2", default-features = false, features = ["deflate"] }
flate2 = "1"

[dev-dependencies]
tempfile = "3"

[profile.release]
lto = true
codegen-units = 1
strip = "symbols"
```

- [ ] **Step 3: Write `rust-toolchain.toml`**

```toml
[toolchain]
channel = "stable"
targets = ["x86_64-pc-windows-msvc"]
```

- [ ] **Step 4: Write `.cargo/config.toml`**

Mirrors team-breakdown's cargo aliases so `cargo dll` Just Works.

```toml
[alias]
dll = ["build", "--release", "--target", "x86_64-pc-windows-msvc"]
dll-dev = ["build", "--target", "x86_64-pc-windows-msvc"]
dll-check = ["check", "--target", "x86_64-pc-windows-msvc"]
```

- [ ] **Step 5: Write `.gitignore`**

```
/target
/vendor/GW2EICLI.zip
/fixtures/sample-fight.json
```

- [ ] **Step 6: Write minimal `src/lib.rs`**

```rust
//! arcdps_axipulse: post-fight personal performance overlay.

pub mod config;
pub mod diag;
pub mod ei_bundle;
pub mod ei_model;
pub mod ei_parser;
pub mod ei_settings;
pub mod pulse_metrics;
pub mod state;

#[cfg(windows)]
pub mod plugin;
#[cfg(windows)]
pub mod watcher;

#[cfg(windows)]
arcdps::export! {
    name: "axipulse",
    sig: 0x4A1B0DBE,
    init: plugin::init,
    release: plugin::release,
}
```

- [ ] **Step 7: Verify host-target check passes**

Run: `cargo dll-check`
Expected: builds clean (modules empty so far — only the macro skeleton).

If it fails because submodules don't exist yet, comment out the `pub mod` lines that haven't been created and add them back as later tasks land. Or create empty `pub fn placeholder() {}` files now to satisfy resolution.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml rust-toolchain.toml .cargo .gitignore src/lib.rs vendor
git commit -m "chore: scaffold arcdps_axipulse plugin"
```

---

### Task 2: EI archive fetch script

**Files:**
- Create: `scripts/fetch_ei.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Downloads the latest GW2EICLI.zip into vendor/ for bundling into the DLL.
# Re-run when bumping the bundled EI version.
set -euo pipefail

OUT="vendor/GW2EICLI.zip"
URL=$(curl -fsSL https://api.github.com/repos/baaron4/GW2-Elite-Insights-Parser/releases/latest \
    | grep -oE 'https://[^"]+GW2EICLI\.zip')

if [[ -z "$URL" ]]; then
    echo "could not resolve GW2EICLI.zip download URL" >&2
    exit 1
fi

echo "downloading $URL"
mkdir -p vendor
curl -fL --progress-bar -o "$OUT.tmp" "$URL"
mv "$OUT.tmp" "$OUT"
ls -lh "$OUT"
```

- [ ] **Step 2: Make executable and fetch**

```bash
chmod +x scripts/fetch_ei.sh
./scripts/fetch_ei.sh
```

Expected: `vendor/GW2EICLI.zip` exists (~30–80 MB).

- [ ] **Step 3: Commit (script only — zip is gitignored)**

```bash
git add scripts/fetch_ei.sh
git commit -m "chore: add fetch_ei.sh helper for bundled EI"
```

---

### Task 3: `ei_bundle` — extract bundled EI on first run

**Files:**
- Create: `src/ei_bundle.rs`
- Test: `tests/ei_bundle_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/ei_bundle_test.rs
use std::fs;
use tempfile::TempDir;

#[test]
fn extracts_zip_into_target_dir() {
    // Build a tiny in-memory zip with one file, write it to a temp path,
    // and prove ei_bundle::extract_zip lands the contents at `out`.
    let tmp = TempDir::new().unwrap();
    let zip_path = tmp.path().join("test.zip");
    let mut zip = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
    zip.start_file::<_, ()>("hello.txt", zip::write::SimpleFileOptions::default()).unwrap();
    use std::io::Write;
    zip.write_all(b"world").unwrap();
    zip.finish().unwrap();

    let out = tmp.path().join("out");
    arcdps_axipulse::ei_bundle::extract_zip(&zip_path, &out).unwrap();
    assert_eq!(fs::read_to_string(out.join("hello.txt")).unwrap(), "world");
}

#[test]
fn install_writes_marker_and_skips_when_already_installed() {
    let tmp = TempDir::new().unwrap();
    let install_root = tmp.path().join("install");

    // Build a dummy zip carrying the EI exe so install treats it as valid.
    let zip_path = tmp.path().join("ei.zip");
    {
        let mut zip = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
        zip.start_file::<_, ()>("GuildWars2EliteInsights-CLI.exe",
            zip::write::SimpleFileOptions::default()).unwrap();
        use std::io::Write;
        zip.write_all(b"dummy").unwrap();
        zip.finish().unwrap();
    }
    let bytes = fs::read(&zip_path).unwrap();

    arcdps_axipulse::ei_bundle::install_from_bytes(&bytes, "0.1.0", &install_root).unwrap();
    assert!(install_root.join("eicli").join("GuildWars2EliteInsights-CLI.exe").exists());
    assert_eq!(fs::read_to_string(install_root.join("eicli-version.txt")).unwrap(), "0.1.0");

    // Second call with the same version should be a no-op (we detect this
    // by deleting the exe and confirming install does NOT recreate it).
    fs::remove_file(install_root.join("eicli").join("GuildWars2EliteInsights-CLI.exe")).unwrap();
    arcdps_axipulse::ei_bundle::install_from_bytes(&bytes, "0.1.0", &install_root).unwrap();
    assert!(!install_root.join("eicli").join("GuildWars2EliteInsights-CLI.exe").exists());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --test ei_bundle_test`
Expected: FAIL with "no function `extract_zip`" / `install_from_bytes`.

- [ ] **Step 3: Write `src/ei_bundle.rs`**

```rust
//! Manage the bundled EI CLI archive: extract on first run, skip when
//! the on-disk version matches the bundled version.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

/// Version of EI bundled into this build. Bump when re-running
/// `scripts/fetch_ei.sh`. Used as a cache-buster so the next plugin
/// load re-extracts the new bytes over the old install.
pub const BUNDLED_EI_VERSION: &str = "0.0.0-replace-on-fetch";

/// Bytes of the bundled GW2EICLI.zip. `include_bytes!` is resolved at
/// compile time; if `vendor/GW2EICLI.zip` is missing the build will
/// fail with a clear file-not-found error — run `scripts/fetch_ei.sh`.
pub const BUNDLED_EI_ZIP: &[u8] = include_bytes!("../vendor/GW2EICLI.zip");

/// Extract a zip into `out_dir`, creating it if it doesn't exist.
/// Wipes any pre-existing contents of `out_dir` first to avoid stale
/// files from older EI versions.
pub fn extract_zip(zip_path: &Path, out_dir: &Path) -> io::Result<()> {
    let bytes = fs::read(zip_path)?;
    extract_bytes(&bytes, out_dir)
}

fn extract_bytes(bytes: &[u8], out_dir: &Path) -> io::Result<()> {
    if out_dir.exists() {
        fs::remove_dir_all(out_dir)?;
    }
    fs::create_dir_all(out_dir)?;

    let reader = std::io::Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(reader)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let dest = out_dir.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&dest)?;
            continue;
        }
        if let Some(parent) = dest.parent() { fs::create_dir_all(parent)?; }
        let mut out = fs::File::create(&dest)?;
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf)?;
        out.write_all(&buf)?;
    }
    Ok(())
}

/// Install the bundled EI archive under `install_root`:
///   install_root/eicli/                ← extracted EI files
///   install_root/eicli-version.txt     ← version marker
/// If the marker already matches `version`, do nothing.
pub fn install_from_bytes(zip_bytes: &[u8], version: &str, install_root: &Path) -> io::Result<()> {
    let marker = install_root.join("eicli-version.txt");
    if let Ok(existing) = fs::read_to_string(&marker) {
        if existing == version {
            return Ok(());
        }
    }
    fs::create_dir_all(install_root)?;
    extract_bytes(zip_bytes, &install_root.join("eicli"))?;
    fs::write(&marker, version)?;
    Ok(())
}

/// Resolve the install root the plugin uses at runtime:
/// `%LOCALAPPDATA%\Axipulse\` on Windows, `$HOME/.local/share/axipulse`
/// on Linux for the unit-test host (never used by the DLL at runtime).
pub fn default_install_root() -> Option<PathBuf> {
    #[cfg(windows)] {
        std::env::var_os("LOCALAPPDATA").map(|s| PathBuf::from(s).join("Axipulse"))
    }
    #[cfg(not(windows))] {
        std::env::var_os("HOME").map(|s| PathBuf::from(s).join(".local/share/axipulse"))
    }
}

/// Path to the EI CLI executable inside `install_root`.
pub fn ei_cli_exe(install_root: &Path) -> PathBuf {
    install_root.join("eicli").join("GuildWars2EliteInsights-CLI.exe")
}
```

For the build to succeed under test the `BUNDLED_EI_ZIP` constant references a real `vendor/GW2EICLI.zip` — Task 2 placed it there. If the zip is large (>50 MB) the resulting DLL will be large too; that's intentional.

- [ ] **Step 4: Run tests, confirm pass**

Run: `cargo test --test ei_bundle_test`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/ei_bundle.rs tests/ei_bundle_test.rs
git commit -m "feat: bundle EI CLI and extract on first run"
```

---

### Task 4: `ei_settings` — write EI settings.conf

Port of `axipulse/src/main/eiParser.ts:generateEiConf` so we feed EI the same flags AxiPulse does (raw timeline arrays on, JSON output gzipped, etc.).

**Files:**
- Create: `src/ei_settings.rs`
- Test: `tests/ei_settings_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/ei_settings_test.rs
use arcdps_axipulse::ei_settings::{generate_ei_conf, EiSettings};

#[test]
fn includes_required_axipulse_flags() {
    let settings = EiSettings::default();
    let conf = generate_ei_conf(&settings, "C:\\out");

    // Must mirror what axipulse passes — these are load-bearing for the
    // metrics Pulse and Timeline rely on.
    assert!(conf.contains("SaveOutJSON=True"));
    assert!(conf.contains("CompressRaw=True"));
    assert!(conf.contains("SaveOutHTML=False"));
    assert!(conf.contains("DetailledWvW=True"));
    assert!(conf.contains("RawTimelineArrays=True"));
    assert!(conf.contains("ComputeDamageModifiers=True"));
    assert!(conf.contains("ParsePhases=True"));
    assert!(conf.contains("UploadToDPSReports=False"));
    assert!(conf.contains("CustomTooShort=2200"));
    assert!(conf.contains("OutLocation=C:\\out"));
}

#[test]
fn boolean_flags_serialise_as_True_False() {
    let mut settings = EiSettings::default();
    settings.detailled_wvw = false;
    let conf = generate_ei_conf(&settings, "/tmp");
    assert!(conf.contains("DetailledWvW=False"));
    assert!(!conf.contains("DetailledWvW=false"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test ei_settings_test`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```rust
//! Generate the settings.conf passed to GW2EICLI.exe.
//! Mirrors axipulse/src/main/eiParser.ts:generateEiConf so the JSON
//! shape Pulse/Timeline depend on stays identical.

#[derive(Debug, Clone)]
pub struct EiSettings {
    pub detailled_wvw: bool,
    pub compute_damage_modifiers: bool,
    pub parse_phases: bool,
    pub skip_failed_tries: bool,
    pub anonymous: bool,
    pub custom_too_short: u32,
    pub save_out_html: bool,
    pub parse_combat_replay: bool,
    pub raw_timeline_arrays: bool,
    pub single_threaded: bool,
    pub memory_limit: u32,
}

impl Default for EiSettings {
    fn default() -> Self {
        Self {
            detailled_wvw: true,
            compute_damage_modifiers: true,
            parse_phases: true,
            skip_failed_tries: false,
            anonymous: false,
            custom_too_short: 2200,
            save_out_html: false,
            parse_combat_replay: false,
            raw_timeline_arrays: true,
            single_threaded: false,
            memory_limit: 0,
        }
    }
}

fn bool_str(v: bool) -> &'static str { if v { "True" } else { "False" } }

pub fn generate_ei_conf(s: &EiSettings, out_location: &str) -> String {
    let mut lines = Vec::with_capacity(24);
    lines.push("SaveOutJSON=True".to_string());
    lines.push(format!("SaveOutHTML={}", bool_str(s.save_out_html)));
    lines.push("SaveOutCSV=False".to_string());
    lines.push("SaveOutTrace=False".to_string());
    lines.push("CompressRaw=True".to_string());
    lines.push("SaveAtOut=False".to_string());
    lines.push(format!("OutLocation={out_location}"));
    lines.push(format!("DetailledWvW={}", bool_str(s.detailled_wvw)));
    lines.push(format!("RawTimelineArrays={}", bool_str(s.raw_timeline_arrays)));
    lines.push(format!("ComputeDamageModifiers={}", bool_str(s.compute_damage_modifiers)));
    lines.push(format!("ParseCombatReplay={}", bool_str(s.parse_combat_replay)));
    lines.push(format!("ParsePhases={}", bool_str(s.parse_phases)));
    lines.push(format!("SingleThreaded={}", bool_str(s.single_threaded)));
    lines.push(format!("SkipFailedTries={}", bool_str(s.skip_failed_tries)));
    lines.push(format!("Anonymous={}", bool_str(s.anonymous)));
    lines.push("ParseMultipleLogs=False".to_string());
    lines.push("UploadToDPSReports=False".to_string());
    lines.push("UploadToWingman=False".to_string());
    lines.push("IndentJSON=False".to_string());
    lines.push(format!("MemoryLimit={}", s.memory_limit));
    lines.push(format!("CustomTooShort={}", s.custom_too_short));
    lines.push("LightTheme=False".to_string());
    lines.push("HtmlExternalScripts=False".to_string());
    lines.join("\n") + "\n"
}
```

- [ ] **Step 4: Verify**

Run: `cargo test --test ei_settings_test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ei_settings.rs tests/ei_settings_test.rs
git commit -m "feat: generate EI settings.conf matching axipulse"
```

---

### Task 5: `ei_model` — serde structs for the EI JSON subset

Mirror `axipulse/src/shared/types.ts:EiJson`. Only deserialise the fields the Pulse and Timeline plans will need — anything else is `#[serde(default)]` ignored.

**Files:**
- Create: `src/ei_model.rs`
- Test: `tests/ei_model_test.rs`
- Create: `fixtures/sample-fight.json` (out of band — see Step 1)

- [ ] **Step 1: Obtain a fixture log**

Use any short WvW `.zevtc` you have lying around (or pull one from `axipulse/screenshots`/test data). Run AxiPulse against it once, then pull the EI JSON output (uncompressed) from the temp dir AxiPulse uses, and trim it to a single short fight if it's huge. Save to `fixtures/sample-fight.json`. Keep this gitignored — the schema is the contract, not the bytes.

If you have no fixture, write one minimal hand-crafted JSON covering every field below. The test only needs the shape to deserialise.

- [ ] **Step 2: Write the failing test**

```rust
// tests/ei_model_test.rs
use arcdps_axipulse::ei_model::EiJson;

#[test]
fn deserialises_sample_fight() {
    let bytes = std::fs::read("fixtures/sample-fight.json")
        .expect("fixtures/sample-fight.json not present — see Task 5 step 1");
    let parsed: EiJson = serde_json::from_slice(&bytes).expect("EiJson deserialise");
    assert!(parsed.duration_ms > 0, "duration_ms should be positive");
    assert!(!parsed.players.is_empty(), "fight should have players");
    let p0 = &parsed.players[0];
    assert!(!p0.profession.is_empty(), "first player has profession");
    // Sanity: dpsAll[0].damage must be reachable.
    let _ = p0.dps_all.get(0).map(|d| d.damage).unwrap_or(0);
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test --test ei_model_test`
Expected: FAIL with "no struct `EiJson`".

- [ ] **Step 4: Implement `src/ei_model.rs`**

```rust
//! Strongly-typed subset of EI's JSON output. Only the fields used by
//! Pulse and Timeline plans are deserialised; everything else is
//! ignored. Field names use camelCase via `#[serde(rename_all)]` since
//! EI emits camelCase.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EiJson {
    pub fight_name: String,
    #[serde(default)]
    pub zone: Option<String>,
    #[serde(default, alias = "mapName", alias = "map")]
    pub map_name: Option<String>,
    #[serde(rename = "durationMS")]
    pub duration_ms: u64,
    #[serde(default)]
    pub success: bool,
    #[serde(default)]
    pub time_start_std: Option<String>,
    #[serde(default)]
    pub recorded_by: Option<String>,
    #[serde(default)]
    pub recorded_account_by: Option<String>,
    pub players: Vec<EiPlayer>,
    #[serde(default)]
    pub targets: Vec<EiTarget>,
    #[serde(default)]
    pub combat_replay_meta_data: Option<EiReplayMeta>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EiPlayer {
    pub name: String,
    pub account: String,
    pub profession: String,
    #[serde(default)]
    pub elite_spec: String,
    #[serde(default)]
    pub group: i64,
    #[serde(default)]
    pub has_commander_tag: bool,
    #[serde(default)]
    pub not_in_squad: bool,
    #[serde(default, alias = "teamID", alias = "teamId")]
    pub team_id: Option<i64>,

    #[serde(default)]
    pub dps_all: Vec<DpsAll>,
    #[serde(default)]
    pub stats_all: Vec<StatsAll>,
    #[serde(default)]
    pub defenses: Vec<Defenses>,
    #[serde(default)]
    pub support: Vec<Support>,

    /// damage1S[targetIdx] = per-second cumulative damage to that target.
    /// Index 0 is the aggregate across all targets (EI convention).
    #[serde(default, rename = "damage1S")]
    pub damage_1s: Vec<Vec<u64>>,
    #[serde(default, rename = "targetDamage1S")]
    pub target_damage_1s: Vec<Vec<u64>>,
    #[serde(default, rename = "damageTaken1S")]
    pub damage_taken_1s: Vec<Vec<u64>>,

    #[serde(default)]
    pub total_damage_dist: Vec<Vec<DamageDistEntry>>,

    #[serde(default)]
    pub buff_uptimes: Vec<BuffEntry>,

    #[serde(default)]
    pub health_percents: Vec<(f64, f64)>,
    #[serde(default)]
    pub combat_replay_data: Option<ReplayData>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DpsAll {
    pub damage: u64,
    pub dps: u64,
    #[serde(default)]
    pub breakbar_damage: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsAll {
    #[serde(default)]
    pub down_contribution: u64,
    #[serde(default)]
    pub dist_to_com: f64,
    #[serde(default)]
    pub stack_dist: f64,
    #[serde(default)]
    pub applied_crowd_control: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Defenses {
    #[serde(default)]
    pub damage_taken: u64,
    #[serde(default)]
    pub dead_count: u32,
    #[serde(default)]
    pub down_count: u32,
    #[serde(default)]
    pub dodge_count: u32,
    #[serde(default)]
    pub blocked_count: u32,
    #[serde(default)]
    pub evaded_count: u32,
    #[serde(default)]
    pub missed_count: u32,
    #[serde(default)]
    pub invulned_count: u32,
    #[serde(default)]
    pub interrupted_count: u32,
    #[serde(default)]
    pub received_crowd_control: u64,
    #[serde(default)]
    pub boon_strips: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Support {
    #[serde(default)]
    pub condi_cleanse: u64,
    #[serde(default)]
    pub condi_cleanse_self: u64,
    #[serde(default)]
    pub boon_strips: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DamageDistEntry {
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub total_damage: u64,
    #[serde(default)]
    pub down_contribution: u64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuffEntry {
    pub id: i64,
    #[serde(default)]
    pub buff_data: Vec<BuffData>,
    #[serde(default)]
    pub states: Vec<(f64, f64)>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuffData {
    #[serde(default)]
    pub uptime: f64,
    #[serde(default)]
    pub generation: f64,
    #[serde(default)]
    pub overstack: f64,
    #[serde(default)]
    pub wasted: f64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EiTarget {
    pub name: String,
    #[serde(default)]
    pub enemy_player: bool,
    #[serde(default, alias = "teamID", alias = "teamId")]
    pub team_id: Option<i64>,
    #[serde(default)]
    pub profession: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EiReplayMeta {
    #[serde(default)]
    pub inch_to_pixel: Option<f64>,
    #[serde(default)]
    pub polling_rate: Option<u64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayData {
    #[serde(default)]
    pub positions: Vec<(f64, f64)>,
    #[serde(default)]
    pub start: Option<i64>,
}
```

- [ ] **Step 5: Run test**

Run: `cargo test --test ei_model_test`
Expected: PASS. If a field type misaligns (EI sometimes emits `int` where the TS thinks `number`), tweak the type to a wider `i64`/`f64`/`serde_json::Value` and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/ei_model.rs tests/ei_model_test.rs
git commit -m "feat: deserialise EI JSON subset"
```

---

### Task 6: `pulse_metrics` — derive Pulse numbers from `EiPlayer`

Port of `axipulse/src/shared/dashboardMetrics.ts`. Pure functions on a single `EiPlayer`. Tested against the fixture so any future EI schema drift surfaces immediately.

**Files:**
- Create: `src/pulse_metrics.rs`
- Test: `tests/pulse_metrics_test.rs`

- [ ] **Step 1: Write the failing test**

```rust
// tests/pulse_metrics_test.rs
use arcdps_axipulse::ei_model::EiJson;
use arcdps_axipulse::pulse_metrics::*;

fn load_fixture() -> EiJson {
    let bytes = std::fs::read("fixtures/sample-fight.json").expect("fixture");
    serde_json::from_slice(&bytes).expect("parse")
}

#[test]
fn derives_for_first_player() {
    let json = load_fixture();
    let p = &json.players[0];

    // We don't hard-code the actual numbers here (fixture-specific) —
    // just check the derives return real values from the right indices.
    let dmg = damage(p);
    let dps = dps_value(p);
    assert!(dps == 0 || dmg / json.duration_ms.max(1).max(1000) * 1000 > 0,
        "dps/damage relationship sane");
    let _ = cleanses(p);
    let _ = strips(p);
    let _ = dist_to_tag(p);
    let _ = damage_taken(p);
    let _ = deaths(p);
    let _ = downs(p);
    let _ = down_contribution(p);
}

#[test]
fn down_contribution_falls_back_to_dist_sum() {
    // Build a player where statsAll[0].downContribution == 0 but
    // totalDamageDist has nonzero downContribution; expect the fallback.
    let json: EiJson = serde_json::from_str(r#"{
        "fightName": "test",
        "durationMS": 1000,
        "players": [{
            "name": "X", "account": ":x", "profession": "Guardian",
            "statsAll": [{ "downContribution": 0 }],
            "totalDamageDist": [[{ "id": 1, "name": "skill", "totalDamage": 100, "downContribution": 42 }]]
        }],
        "targets": []
    }"#).unwrap();
    assert_eq!(down_contribution(&json.players[0]), 42);
}
```

- [ ] **Step 2: Run test, confirm fail**

Run: `cargo test --test pulse_metrics_test`
Expected: FAIL — no `pulse_metrics` functions.

- [ ] **Step 3: Implement**

```rust
//! Per-player Pulse derives. Port of axipulse/src/shared/dashboardMetrics.ts.
//! Pure functions of an &EiPlayer; never mutate.

use crate::ei_model::EiPlayer;

pub fn damage(p: &EiPlayer) -> u64        { p.dps_all.get(0).map(|d| d.damage).unwrap_or(0) }
pub fn dps_value(p: &EiPlayer) -> u64     { p.dps_all.get(0).map(|d| d.dps).unwrap_or(0) }
pub fn breakbar_damage(p: &EiPlayer) -> u64 {
    p.dps_all.get(0).map(|d| d.breakbar_damage).unwrap_or(0)
}

pub fn cleanses(p: &EiPlayer) -> u64 {
    match p.support.get(0) {
        Some(s) => s.condi_cleanse + s.condi_cleanse_self,
        None => 0,
    }
}
pub fn cleanse_self(p: &EiPlayer) -> u64 {
    p.support.get(0).map(|s| s.condi_cleanse_self).unwrap_or(0)
}
pub fn strips(p: &EiPlayer) -> u64 {
    p.support.get(0).map(|s| s.boon_strips).unwrap_or(0)
}

pub fn dist_to_tag(p: &EiPlayer) -> f64 {
    let s = match p.stats_all.get(0) { Some(s) => s, None => return 0.0 };
    if s.dist_to_com > 0.0 { s.dist_to_com } else { s.stack_dist }
}

pub fn damage_taken(p: &EiPlayer) -> u64 { p.defenses.get(0).map(|d| d.damage_taken).unwrap_or(0) }
pub fn deaths(p: &EiPlayer)       -> u32 { p.defenses.get(0).map(|d| d.dead_count).unwrap_or(0) }
pub fn downs(p: &EiPlayer)        -> u32 { p.defenses.get(0).map(|d| d.down_count).unwrap_or(0) }
pub fn dodges(p: &EiPlayer)       -> u32 { p.defenses.get(0).map(|d| d.dodge_count).unwrap_or(0) }
pub fn blocked(p: &EiPlayer)      -> u32 { p.defenses.get(0).map(|d| d.blocked_count).unwrap_or(0) }
pub fn evaded(p: &EiPlayer)       -> u32 { p.defenses.get(0).map(|d| d.evaded_count).unwrap_or(0) }
pub fn missed(p: &EiPlayer)       -> u32 { p.defenses.get(0).map(|d| d.missed_count).unwrap_or(0) }
pub fn invulned(p: &EiPlayer)     -> u32 { p.defenses.get(0).map(|d| d.invulned_count).unwrap_or(0) }
pub fn interrupted(p: &EiPlayer)  -> u32 { p.defenses.get(0).map(|d| d.interrupted_count).unwrap_or(0) }
pub fn incoming_cc(p: &EiPlayer)  -> u64 { p.defenses.get(0).map(|d| d.received_crowd_control).unwrap_or(0) }
pub fn incoming_strips(p: &EiPlayer) -> u64 { p.defenses.get(0).map(|d| d.boon_strips).unwrap_or(0) }

/// statsAll[0] is authoritative when populated. In WvW EI may aggregate
/// targets and leave the field at 0; fall back to summing
/// `downContribution` across totalDamageDist (matches axipulse).
pub fn down_contribution(p: &EiPlayer) -> u64 {
    let from_stats = p.stats_all.get(0).map(|s| s.down_contribution).unwrap_or(0);
    if from_stats > 0 { return from_stats; }
    p.total_damage_dist.iter().flatten().map(|e| e.down_contribution).sum()
}
```

- [ ] **Step 4: Verify**

Run: `cargo test --test pulse_metrics_test`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/pulse_metrics.rs tests/pulse_metrics_test.rs
git commit -m "feat: derive Pulse metrics from EI player"
```

---

### Task 7: `ei_parser` — run EI subprocess and decompress JSON

**Files:**
- Create: `src/ei_parser.rs`

(No unit test — this shells out to a real EI binary; covered by manual smoke in Task 10.)

- [ ] **Step 1: Implement**

```rust
//! Run the bundled EI CLI against an .evtc/.zevtc and return the parsed JSON.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::ei_bundle::ei_cli_exe;
use crate::ei_model::EiJson;
use crate::ei_settings::{generate_ei_conf, EiSettings};

#[derive(Debug)]
pub enum ParseError {
    SettingsWrite(std::io::Error),
    SubprocessSpawn(std::io::Error),
    SubprocessExit { code: Option<i32>, stderr: String },
    NoJsonOutput,
    ReadOutput(std::io::Error),
    Gunzip(std::io::Error),
    Deserialise(serde_json::Error),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SettingsWrite(e)   => write!(f, "writing settings.conf: {e}"),
            Self::SubprocessSpawn(e) => write!(f, "spawning EI CLI: {e}"),
            Self::SubprocessExit { code, stderr } =>
                write!(f, "EI CLI exited code={code:?}; stderr={stderr}"),
            Self::NoJsonOutput       => write!(f, "EI produced no .json.gz output"),
            Self::ReadOutput(e)      => write!(f, "reading EI JSON output: {e}"),
            Self::Gunzip(e)          => write!(f, "gunzip EI output: {e}"),
            Self::Deserialise(e)     => write!(f, "deserialising EI JSON: {e}"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Parse a log to an EiJson. Caller owns the install_root (typically
/// the result of `ei_bundle::default_install_root().unwrap()`).
pub fn parse_log(
    install_root: &Path,
    settings: &EiSettings,
    log_path: &Path,
) -> Result<EiJson, ParseError> {
    let work = mktempdir(install_root).map_err(ParseError::SettingsWrite)?;
    let conf_path = work.join("settings.conf");
    fs::write(&conf_path, generate_ei_conf(settings, work.to_string_lossy().as_ref()))
        .map_err(ParseError::SettingsWrite)?;

    let exe = ei_cli_exe(install_root);
    let mut child = Command::new(&exe)
        .arg("-c").arg(&conf_path)
        .arg(log_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(ParseError::SubprocessSpawn)?;

    // EI typically finishes a WvW fight in <30s; cap at 10 minutes like AxiPulse.
    let timeout = Duration::from_secs(600);
    let result = wait_with_timeout(&mut child, timeout);
    let output = match result {
        Some(o) => o,
        None => {
            let _ = child.kill();
            return Err(ParseError::SubprocessExit {
                code: None,
                stderr: "EI parse timed out after 10 minutes".to_string(),
            });
        }
    };
    if !output.status.success() {
        let _ = fs::remove_dir_all(&work);
        return Err(ParseError::SubprocessExit {
            code: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }

    // EI names the output by the fight; find any .json.gz under work.
    let json_gz = fs::read_dir(&work)
        .map_err(ParseError::ReadOutput)?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().and_then(|e| e.to_str()) == Some("gz"));
    let json_gz = match json_gz {
        Some(p) => p,
        None => { let _ = fs::remove_dir_all(&work); return Err(ParseError::NoJsonOutput); }
    };

    let bytes = fs::read(&json_gz).map_err(ParseError::ReadOutput)?;
    let mut gz = flate2::read::GzDecoder::new(&bytes[..]);
    let mut decompressed = Vec::with_capacity(bytes.len() * 4);
    gz.read_to_end(&mut decompressed).map_err(ParseError::Gunzip)?;
    let _ = fs::remove_dir_all(&work);

    serde_json::from_slice(&decompressed).map_err(ParseError::Deserialise)
}

fn mktempdir(root: &Path) -> std::io::Result<PathBuf> {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos()).unwrap_or(0);
    let dir = root.join(format!("ei-parse-{pid}-{nanos}"));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Std lib has no built-in wait-with-timeout; poll via `try_wait`.
/// Cheaper than a thread-per-process given parses are foreground tasks.
fn wait_with_timeout(child: &mut std::process::Child, timeout: Duration) -> Option<std::process::Output> {
    let start = std::time::Instant::now();
    loop {
        match child.try_wait().ok().flatten() {
            Some(_status) => {
                // Drain stdout/stderr after exit so we get the bytes.
                let stdout = child.stdout.take().map(read_all).unwrap_or_default();
                let stderr = child.stderr.take().map(read_all).unwrap_or_default();
                let status = child.wait().ok()?;
                return Some(std::process::Output { status, stdout, stderr });
            }
            None => {
                if start.elapsed() >= timeout { return None; }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn read_all<R: std::io::Read>(mut r: R) -> Vec<u8> {
    let mut out = Vec::new();
    let _ = r.read_to_end(&mut out);
    out
}
```

- [ ] **Step 2: Type-check**

Run: `cargo dll-check` and `cargo check` (host).
Expected: both compile clean.

- [ ] **Step 3: Commit**

```bash
git add src/ei_parser.rs
git commit -m "feat: run EI subprocess and decompress JSON output"
```

---

### Task 8: `state` — shared AppState holding current/history fights

**Files:**
- Create: `src/state.rs`

- [ ] **Step 1: Implement**

```rust
//! Plugin state: the most recent parsed fight, plus a small ring of
//! history. Pulse and Timeline plans both read from here.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::time::SystemTime;

use crate::ei_model::EiJson;

const HISTORY_CAP: usize = 32;

#[derive(Debug, Clone)]
pub struct FightRecord {
    pub log_path: PathBuf,
    pub parsed_at: SystemTime,
    pub data: EiJson,
}

#[derive(Debug, Default)]
pub struct AppState {
    /// Most recent fight to surface to the UI.
    current: Option<FightRecord>,
    /// Older fights, newest at the back. Capped at HISTORY_CAP.
    history: VecDeque<FightRecord>,
}

impl AppState {
    pub fn new() -> Self { Self::default() }

    pub fn push_fight(&mut self, record: FightRecord) {
        if let Some(prev) = self.current.take() {
            self.history.push_back(prev);
            while self.history.len() > HISTORY_CAP {
                self.history.pop_front();
            }
        }
        self.current = Some(record);
    }

    pub fn current(&self) -> Option<&FightRecord> { self.current.as_ref() }
    pub fn history_len(&self) -> usize { self.history.len() }
    pub fn history(&self, idx: usize) -> Option<&FightRecord> { self.history.get(idx) }
}
```

- [ ] **Step 2: Verify**

Run: `cargo check` (host).
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/state.rs
git commit -m "feat: AppState with current fight + history ring"
```

---

### Task 9: `watcher` — notify-based cbtlogs watcher

Re-implements axipulse/src/main/watcher.ts in Rust using the `notify` crate. Lives behind `#[cfg(windows)]` because the plugin only runs there; on host it never compiles.

**Files:**
- Create: `src/watcher.rs`

- [ ] **Step 1: Implement**

```rust
//! Filesystem watcher on the cbtlogs directory. Posts new .evtc/.zevtc
//! paths to a callback after the file size has stabilised (i.e. arcdps
//! is done writing).

#![cfg(windows)]

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecursiveMode, Watcher};

pub fn spawn_watcher<F>(cbtlogs_dir: PathBuf, on_log: F) -> std::io::Result<()>
where
    F: Fn(PathBuf) + Send + 'static,
{
    thread::Builder::new()
        .name("axipulse-watcher".into())
        .spawn(move || run(cbtlogs_dir, on_log))?;
    Ok(())
}

fn run<F: Fn(PathBuf) + Send + 'static>(dir: PathBuf, on_log: F) {
    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = match notify::recommended_watcher(tx) {
        Ok(w) => w,
        Err(e) => { log::warn!("axipulse watcher init failed: {e}"); return; }
    };
    if let Err(e) = watcher.watch(&dir, RecursiveMode::Recursive) {
        log::warn!("axipulse watcher cannot watch {dir:?}: {e}");
        return;
    }
    log::warn!("axipulse watcher started on {dir:?}");

    for res in rx {
        let Ok(event) = res else { continue };
        if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) { continue; }
        for path in event.paths {
            if !is_log_extension(&path) { continue; }
            if !await_stable(&path) {
                log::warn!("axipulse: log {path:?} never stabilised, skipping");
                continue;
            }
            on_log(path);
        }
    }
}

fn is_log_extension(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("evtc") || e.eq_ignore_ascii_case("zevtc"))
        .unwrap_or(false)
}

/// Block until the file's size stops changing for two consecutive samples
/// 250ms apart, with a 30s cap. Returns true if it stabilised non-empty.
fn await_stable(path: &Path) -> bool {
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut last: Option<u64> = None;
    while Instant::now() < deadline {
        let size = std::fs::metadata(path).ok().map(|m| m.len()).unwrap_or(0);
        if size > 0 && Some(size) == last {
            return true;
        }
        last = Some(size);
        thread::sleep(Duration::from_millis(250));
    }
    false
}
```

- [ ] **Step 2: Type-check**

Run: `cargo dll-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/watcher.rs
git commit -m "feat: cbtlogs watcher posts new logs after size stabilises"
```

---

### Task 10: `config`, `diag`, `plugin` — wire it all into arcdps

**Files:**
- Create: `src/config.rs`
- Create: `src/diag.rs`
- Create: `src/plugin.rs`

- [ ] **Step 1: Implement `src/diag.rs`**

```rust
//! Panic-safe write-to-log helper. Mirrors team-breakdown's diag.rs in
//! spirit but minimal: arcdps's `log` macros already route to arcdps.log
//! when the `log` feature is enabled in Cargo.toml.

use std::sync::atomic::{AtomicBool, Ordering};

static ENABLED: AtomicBool = AtomicBool::new(false);

pub fn set_enabled(v: bool) { ENABLED.store(v, Ordering::Relaxed); }
pub fn enabled() -> bool { ENABLED.load(Ordering::Relaxed) }

#[macro_export]
macro_rules! diag {
    ($($arg:tt)*) => {
        if $crate::diag::enabled() {
            ::log::warn!("axipulse: {}", format!($($arg)*));
        }
    }
}
```

- [ ] **Step 2: Implement `src/config.rs`**

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
}

impl Default for Config {
    fn default() -> Self {
        Self { cbtlogs_path: String::new(), debug_logging: false }
    }
}

pub fn config_path() -> PathBuf {
    // Sibling-of-DLL on Windows; doesn't matter on host (never loaded).
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

- [ ] **Step 3: Implement `src/plugin.rs`**

```rust
//! Top-level arcdps callbacks + globals. Init extracts the bundled EI
//! archive, starts the cbtlogs watcher, and wires watcher → parser →
//! state push.

#![cfg(windows)]

use std::path::PathBuf;
use std::sync::Mutex;

use once_cell::sync::Lazy;

use crate::config::{default_cbtlogs, Config};
use crate::ei_bundle::{default_install_root, install_from_bytes, BUNDLED_EI_VERSION, BUNDLED_EI_ZIP};
use crate::ei_parser::{parse_log, ParseError};
use crate::ei_settings::EiSettings;
use crate::state::{AppState, FightRecord};

struct Globals {
    state: Mutex<AppState>,
    config: Mutex<Config>,
    install_root: Mutex<Option<PathBuf>>,
    settings: Mutex<EiSettings>,
}

static G: Lazy<Globals> = Lazy::new(|| Globals {
    state: Mutex::new(AppState::new()),
    config: Mutex::new(Config::load()),
    install_root: Mutex::new(None),
    settings: Mutex::new(EiSettings::default()),
});

pub fn init() -> Result<(), Option<String>> {
    let _ = &*G;
    crate::diag::set_enabled(G.config.lock().ok().map(|c| c.debug_logging).unwrap_or(false));

    // Extract bundled EI into %LOCALAPPDATA%\Axipulse\.
    let Some(install_root) = default_install_root() else {
        log::warn!("axipulse init: no install root (LOCALAPPDATA missing); aborting");
        return Ok(());
    };
    if let Err(e) = install_from_bytes(BUNDLED_EI_ZIP, BUNDLED_EI_VERSION, &install_root) {
        log::warn!("axipulse init: EI extract failed: {e}; subsequent parses will error");
    } else {
        log::warn!("axipulse init: EI installed at {install_root:?}");
    }
    if let Ok(mut slot) = G.install_root.lock() { *slot = Some(install_root); }

    // Start watcher.
    let cbtlogs = match G.config.lock().ok().map(|c| c.cbtlogs_path.clone()).filter(|s| !s.is_empty()) {
        Some(s) => Some(PathBuf::from(s)),
        None => default_cbtlogs(),
    };
    if let Some(dir) = cbtlogs {
        if dir.exists() {
            let _ = crate::watcher::spawn_watcher(dir, on_new_log);
        } else {
            log::warn!("axipulse init: cbtlogs {dir:?} does not exist; watcher not started");
        }
    } else {
        log::warn!("axipulse init: no cbtlogs path resolved; watcher not started");
    }

    Ok(())
}

pub fn release() {
    if let Ok(c) = G.config.lock() { c.save(); }
}

/// Called from the watcher thread for each stabilised .evtc/.zevtc.
fn on_new_log(path: PathBuf) {
    let install_root = match G.install_root.lock().ok().and_then(|g| g.clone()) {
        Some(r) => r,
        None => { log::warn!("axipulse: on_new_log fired before install_root set"); return; }
    };
    let settings = G.settings.lock().ok().map(|s| s.clone()).unwrap_or_default();
    log::warn!("axipulse: parsing {path:?}");
    match parse_log(&install_root, &settings, &path) {
        Ok(json) => {
            let record = FightRecord {
                log_path: path,
                parsed_at: std::time::SystemTime::now(),
                data: json,
            };
            log::warn!(
                "axipulse: parsed {:?}, {}ms, {} players",
                record.log_path.file_name(),
                record.data.duration_ms,
                record.data.players.len(),
            );
            if let Ok(mut s) = G.state.lock() { s.push_fight(record); }
        }
        Err(ParseError::SubprocessExit { code, stderr }) => {
            log::warn!("axipulse: parse failed (code={code:?}): {stderr}");
        }
        Err(e) => log::warn!("axipulse: parse failed: {e}"),
    }
}
```

- [ ] **Step 4: Update `src/lib.rs` to include any missing modules**

Make sure `pub mod config;` and `pub mod diag;` are present (they should be from Task 1 step 6).

- [ ] **Step 5: Build the DLL**

Run: `cargo dll`
Expected: produces `target/x86_64-pc-windows-msvc/release/arcdps_axipulse.dll`. If the resulting binary is huge (>80MB), that's expected — the EI zip is bundled in.

- [ ] **Step 6: Commit**

```bash
git add src/config.rs src/diag.rs src/plugin.rs
git commit -m "feat: wire watcher + parser into arcdps plugin"
```

---

### Task 11: deploy script + manual smoke test

**Files:**
- Create: `scripts/deploy.sh`
- Create: `README.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: Adapt team-breakdown's deploy script**

```bash
#!/usr/bin/env bash
# Atomic install of arcdps_axipulse.dll into the GW2 addons dir under Wine.
# Never `cp` straight into the live folder — see CLAUDE.md.
set -euo pipefail

SRC="target/x86_64-pc-windows-msvc/release/arcdps_axipulse.dll"
DEST="${AXIPULSE_DEPLOY_DEST:-$HOME/Games/guild-wars-2/drive_c/Program Files/Guild Wars 2/bin64/arcdps_axipulse.dll}"

if [[ ! -f "$SRC" ]]; then
    echo "build artifact missing: $SRC — run 'cargo dll' first" >&2
    exit 1
fi

TMP="${DEST}.new"
cp "$SRC" "$TMP"
mv "$TMP" "$DEST"
ls -lh "$DEST"
```

`chmod +x scripts/deploy.sh`.

- [ ] **Step 2: Write minimal README**

```markdown
# arcdps_axipulse

A Rust ArcDPS plugin that runs the bundled Elite Insights CLI against each
.evtc your client writes, parses the JSON output, and (in follow-up plans)
renders Pulse and Timeline overlays in-game.

## Build

```
./scripts/fetch_ei.sh        # one-time: pull GW2EICLI.zip into vendor/
cargo dll                    # release MSVC build via cargo-xwin
./scripts/deploy.sh          # atomic install into addons/arcdps/
```

Foundation milestone: launches and parses logs; no UI yet. Verify by
fighting in WvW and checking arcdps.log for `axipulse: parsed ...` lines.
```

- [ ] **Step 3: Mirror team-breakdown's CLAUDE.md warnings**

```markdown
## Project Context

A Rust ArcDPS plugin that runs the bundled Elite Insights CLI on each
new .evtc/.zevtc, deserialises the JSON, and (future) renders Pulse and
Timeline overlays.

## Build

Must be MSVC. Cross-compile from Linux with `cargo-xwin`:
- `cargo dll`        release artifact at `target/x86_64-pc-windows-msvc/release/arcdps_axipulse.dll`
- `cargo dll-dev`    unoptimised iteration build
- `cargo dll-check`  type-check only
- `cargo test`       host-side unit tests (non-cfg(windows) modules)

Never `cargo build --target x86_64-pc-windows-gnu` for the DLL — the
GNU binary links but crashes on load inside GW2.

## Deploying

Always use `./scripts/deploy.sh` (tmp + atomic rename). Never `cp` the
DLL straight into `addons/` while GW2 is running — under Wine, `cp`
truncates the existing inode in place and corrupts pages of the loaded
DLL that GW2 has mmap'd as executable.
```

- [ ] **Step 4: Manual smoke test**

1. Verify `vendor/GW2EICLI.zip` is present (from Task 2).
2. `cargo dll`
3. `./scripts/deploy.sh`
4. Launch GW2, enter WvW, finish a short fight.
5. Tail `arcdps.log` (under `addons/arcdps/`) and confirm a line like:
   ```
   axipulse: parsed Some("20260520-foo.zevtc"), 41200ms, 17 players
   ```
6. If parse fails, the log will say so — common causes are missing
   `vendor/GW2EICLI.zip` at build time, or the cbtlogs path autodetect
   missing (set `cbtlogs_path` manually in `axipulse.json` next to the
   DLL).

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy.sh README.md CLAUDE.md
git commit -m "docs: deploy script, README, CLAUDE.md"
```

---

## Acceptance

Foundation is done when:

- `cargo test` passes all unit tests on the Linux host.
- `cargo dll` produces a DLL.
- The DLL loads in GW2 (visible in arcdps's window list as "axipulse").
- arcdps.log shows `axipulse init: EI installed at …` on first run.
- arcdps.log shows `axipulse: parsed …, NNNNms, NN players` after each WvW fight.

At that point Pulse and Timeline plans can be written with confidence the parsing pipeline is solid.

## What this plan does NOT cover (deferred to next plans)

- Any ImGui rendering. There are no overlay windows yet.
- Auto-update of bundled EI. The version is baked at build time; bump it by re-running `fetch_ei.sh` and bumping `BUNDLED_EI_VERSION`.
- Hotkeys, history navigation, settings UI.
- Self-identification (which `EiPlayer` is "me"). Trivial via `recorded_account_by`, but only matters once Pulse renders. Default selection logic lands in the Pulse plan.
- Boon-stack data extraction beyond the `buff_uptimes` shape already deserialised. Timeline plan will add interpolation helpers.
