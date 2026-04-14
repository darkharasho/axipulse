# AxiPulse — Design Specification

Personal GW2 WvW combat analysis dashboard. A compact sidecar Electron app that reads arcdps logs, parses them locally via Elite Insights, and provides per-fight individual performance analysis.

**Game mode**: WvW only.

**Design goal**: A compact, resizable window that works docked to the side during play or expanded for deeper analysis between fights. Dashboard/widget aesthetic — dense with data, not spacious.

---

## 1. App Shell & Navigation

### Window

- Frameless Electron window with custom titlebar
- Default size: 900x700, minimum: 680x500, resizable
- Titlebar: AxiPulse logo (white PNG, `h-4 w-auto`) + "Axi" (white) / "Pulse" (emerald `#10b981`) in Cinzel serif + window controls (minimize, maximize, close)
- Dark theme matching Axi family (axibridge, axiforge, axiam)
- Brand palette: emerald/cyan gradient (`--brand-primary: #10b981`, `--brand-secondary: #06b6d4`)

### Primary Navigation

Four tabs in a horizontal bar below the titlebar:

| Tab | Icon (lucide) | Purpose |
|-----|---------------|---------|
| Pulse | `Activity` | "How am I doing?" — personal stat cards |
| Timeline | `GanttChart` | "What happened?" — fight timeline with toggleable layers |
| History | `Clock3` | Session fight history list |
| Settings | `Settings` | Log directory + EI management |

### Subview Navigation

Collapsible pill bar, toggled via a lucide `ChevronDown`/`ChevronUp` icon button on the right side of the tab bar.

- **Collapsed** (default): Shows current subview name + chevron icon. Zero vertical space cost.
- **Expanded**: Slides open a pill row below the tab bar with all subview options for the active tab. Selecting a pill collapses the bar automatically.
- Animated with Framer Motion (slide transition).
- Each primary tab defines its own set of subview pills.

### Data Refresh Behavior

When a new fight is parsed:

1. Current view stays — no forced navigation.
2. Data transitions in-place with animation (Framer Motion).
3. A toast notification appears briefly: fight label, duration, class.
4. Previous fight data moves to session history.

---

## 2. Data Pipeline

### Log Watching

Chokidar watches the user-configured arcdps log directory for new `.evtc`/`.zevtc` files. Depth 5 for subdirectories (boss name folders). `awaitWriteFinish` with 2s stability threshold to avoid reading partial writes.

### EI Parsing

Adapted directly from axibridge's `EiManager` class:

- Downloads GW2EICLI.zip from GitHub releases (baaron4/GW2-Elite-Insights-Parser)
- On Linux: also installs .NET 8.0 runtime via `dotnet-install.sh` to a local directory
- On Windows: uses native `GuildWars2EliteInsights-CLI.exe`
- Parses logs via CLI subprocess with 10-minute timeout
- Output: `.json.gz` decompressed to JSON in memory
- Version tracking in `elite-insights/versions.json`
- IPC handlers for install/update/reinstall/uninstall/status

### Hardcoded Parser Settings

Optimized for WvW individual analysis (not user-configurable in v1):

```
detailledWvW=True
rawTimelineArrays=True
computeDamageModifiers=True
parsePhases=True
parseCombatReplay=True          ← critical for position data
customTooShort=2200
skipFailedTries=False
anonymous=False
saveOutHTML=False
singleThreaded=False
memoryLimit=0
```

Key difference from axibridge: `parseCombatReplay` must be `True` because AxiPulse needs position data for distance-to-tag timelines and fight landmark labeling.

### Player Identification

The EI JSON contains all players in the `players[]` array. The local/recording player is the one whose perspective the log was captured from — EI marks this player with `"isFake": false` and they are always the first entry in the players array with matching account info. AxiPulse extracts this player as the primary focus, with squad context where needed (incoming healing, barrier, boon sources, squad rank for metrics).

### Fight Labeling

Each fight gets a descriptive label:

```
F{n} — Near {landmark} — {map} — {duration}
```

Example: `F3 — Near Bay — Green BL — 1:23`

Components:
- **Fight number**: Sequential within the session (F1, F2, ...)
- **Nearest landmark**: Derived from average squad position during the fight, cross-referenced against the WvW landmark coordinate table
- **Map name**: Normalized from EI's zone field (Green BL, Blue BL, Red BL, EBG)
- **Duration**: From `durationMS`

### Data Flow

```
LogWatcher detects .evtc/.zevtc
  → IPC 'log-detected'
  → EiManager.parseLog()
  → IPC 'parse-complete' (raw EI JSON)
  → Renderer: data extraction layer extracts player-focused stats
  → Zustand store updated (currentFight)
  → Views re-render with transition animation
  → Toast notification
  → Previous fight pushed to sessionHistory array
```

---

## 3. Pulse View ("How am I doing?")

Personal stats dashboard for the current fight. Subviews via collapsible pill bar.

### Overview Subview

2-column grid of stat cards. Each card shows:
- Metric label (uppercase, small, muted)
- Value (large, prominent)
- Context line (squad rank, timestamp, or detail — emerald for good, red for bad)

Cards displayed:
- Damage / DPS
- Down contribution
- Deaths / Downs
- Strips
- Cleanses
- Healing output (if applicable to class)

### Damage Subview

- Total damage / DPS
- Breakbar damage
- Down contribution
- Skill damage breakdown (top damage skills as bar chart or ranked list)

### Support Subview

- Boon strips (count)
- Cleanses (condi cleanse + self cleanse)
- Healing output to squad
- Barrier output to squad
- Stability generation (seconds)

### Defense Subview

- Damage taken
- Deaths / Downs (with timestamps)
- Dodges
- Damage mitigated breakdown (blocked, evaded, missed, invulned, interrupted)
- Incoming CC (count)
- Incoming strips (count)

### Boons Subview

- Boon uptime bars (might, fury, quickness, alacrity, protection, stability, resistance, swiftness, vigor, aegis, regeneration)
- Boon generation output (self / group / squad breakdowns)

### Design Principles

- Emphasize the player's own stats.
- Show squad context where it adds meaning: squad rank for damage/strips/healing, incoming healing from supports.
- Cards adapt to available data — if a metric is zero or not applicable, it can be dimmed or hidden.

---

## 4. Timeline View ("What happened?")

A shared time axis with toggleable metric layers for correlating fight events.

### Time Axis

- Horizontal, spans 0 to fight duration
- Key event markers (deaths, downs) displayed as icons/pins on the axis regardless of active layers
- Hover/scrub interaction to see values at a specific time point

### Metric Layers

Each individually toggleable, with distinct colors:

| Layer | Chart Type | Source |
|-------|-----------|--------|
| Distance to tag | Line chart | `combatReplayData.positions` vs commander position |
| Damage dealt | Area chart | `damage1S` / `targetDamage1S`, bucketed |
| Damage taken | Area chart | `defenses` per-second data, bucketed |
| Incoming healing | Area chart | `extHealingStats` incoming, bucketed |
| Incoming barrier | Area chart | `extBarrierStats` incoming, bucketed |
| Boon uptime | Stacked bands | `buffUptimes[].statesPerSource` sampled |
| Outgoing boon generation | Stacked bands | `selfBuffs/groupBuffs/squadBuffs` bucketed |
| CC dealt/received | Event markers | `appliedCrowdControl` / `receivedCrowdControl` |

### Bucket Size

- Default: 1-second buckets for maximum granularity
- User-configurable via Settings: 1s, 2s, 3s, 5s
- Setting persists across fights and sessions

### Toggle Persistence

Layer toggle state persists across incoming fights. User sets up their preferred view once, it stays until they change it.

### Built-in Presets

Curated toggle combinations accessible from the subview pill bar:

| Preset | Layers Enabled |
|--------|---------------|
| **Why did I die?** | Damage taken, incoming healing, incoming barrier, boon uptime (stab/prot/aegis), distance to tag, death markers |
| **My damage** | Damage dealt, boon uptime (might/fury/quickness), down contribution markers |
| **Am I getting support?** | Incoming healing, incoming barrier, boon uptime (full set) |
| **Positioning** | Distance to tag, damage dealt, death/down markers |

Selecting a preset configures the toggles. User can then manually adjust. A "Custom" option represents any manual toggle state.

Custom user-defined presets deferred to post-v1.

### Subview Navigation

The collapsible pill bar for Timeline shows: preset names + "Custom". Same interaction pattern as Pulse.

---

## 5. History View

Scrollable list of past fights from the current session. Cleared when AxiPulse closes (session-only, not persisted to disk).

### Entry Layout

Most recent fight at top. Each entry shows:

- **Fight label**: `F3 — Near Bay — Green BL — 1:23`
- **Timestamp**: When the log was recorded
- **Class**: Profession icon (via `gw2-class-icons` package) + elite spec name
- **Quick stats**: 3-4 key numbers inline (damage, deaths, strips)

### Interaction

- Clicking an entry loads that fight's data into Pulse and Timeline views.
- Current view stays (no forced tab switch).
- A badge/indicator shows which fight is currently loaded (e.g., `F3` pill in the tab bar area) so the user knows they're viewing a past fight vs. the latest.

### Visual Distinction

- The most recent (current) fight has a subtle accent border/glow.
- When a new fight arrives, the previous fight animates down into the list.

---

## 6. Settings View

Minimal for v1. No subviews needed.

### Log Directory

- Current path display with status indicator (watching / not configured / directory not found)
- "Browse" button to open native OS directory picker
- Starts watching immediately on selection

### Elite Insights

- Install status: not installed / installed v{version}
- Action buttons: Install / Update / Reinstall / Uninstall
- Download progress bar during install/update
- Auto-manage toggle (auto-check for EI updates on app launch)

### Timeline Settings

- Bucket size selector: 1s (default), 2s, 3s, 5s
- Applied globally to all timeline charts

---

## 7. Architecture & State Management

### Zustand Store

Organized into logical slices:

| Slice | Contents |
|-------|----------|
| `currentFight` | Parsed + extracted fight data for the currently displayed fight |
| `sessionHistory` | Array of past fight entries (label, timestamp, class, summary stats, full extracted data) |
| `timelineSettings` | Layer toggle states, active preset name, bucket size |
| `uiState` | Active tab, active subview per tab, pill bar expanded/collapsed, toast queue |
| `settings` | Log directory path, EI install status/version |

### Data Extraction Layer

`src/shared/` module that takes raw EI JSON and produces player-focused data structures. Adapted from axibridge's metric computation patterns:

- `combatMetrics` — down contribution, CC, stability generation
- `dashboardMetrics` — damage, DPS, cleanses, strips, damage taken
- `boonGeneration` — boon uptime/generation tables
- `timelineData` — per-second bucketed arrays for each timeline layer

Simplified from axibridge: focuses on individual player extraction rather than full squad aggregation.

### WvW Landmark System

`src/shared/wvwLandmarks.ts` — a self-contained module with **no AxiPulse-specific dependencies**. Designed to be portable to axibridge or a shared package in the future.

Exports:
- `WvwMap` enum (EternalBattlegrounds, GreenBorderlands, BlueBorderlands, RedBorderlands)
- `WvwLandmark` type: `{ name: string; x: number; y: number; type: 'keep' | 'tower' | 'camp' | 'ruins' | 'named' }`
- `WVW_LANDMARKS: Record<WvwMap, WvwLandmark[]>` — coordinate tables per map
- `findNearestLandmark(map: WvwMap, x: number, y: number): WvwLandmark` — Euclidean distance lookup
- `resolveMapFromZone(zone: string): WvwMap | null` — normalizes EI zone strings to enum

Coordinate data sourced from GW2 community resources, stored as pixel coordinates matching EI's `combatReplayData.positions` coordinate space.

### IPC API Surface

Main → Renderer events:
- `log-detected`, `parse-started`, `parse-progress`, `parse-complete`, `parse-error`
- `ei:download-progress`, `ei:status-changed`
- `update-available`, `update-downloaded`, `update-progress`

Renderer → Main invocations:
- `window-control`, `select-directory`, `start-watching`
- `get-settings`, `save-settings`, `get-app-version`, `open-external`
- `get-session-history`, `save-session-history`
- `ei:get-status`, `ei:install`, `ei:update`, `ei:reinstall`, `ei:uninstall`
- `ei:check-update`, `ei:get-settings`, `ei:save-settings`
- `ei:get-auto-manage`, `ei:set-auto-manage`
- `check-for-updates`, `restart-app`

---

## 8. Distribution & Updates

### Packaging

electron-builder with GitHub releases (draft → publish). Identical pattern to axibridge/axiforge.

- **Linux**: AppImage (`AxiPulse-{version}.AppImage`)
- **Windows**: NSIS one-click installer (`AxiPulse-{version}-Setup.exe`)
- **Artifact names**: `AxiPulse-${version}.${ext}` (linux), `AxiPulse-${version}-Setup.${ext}` (windows)

### Auto-Updates

- electron-updater with GitHub provider (`releaseType: "draft"`)
- Auto-download enabled, auto-install on app quit
- Toast notification when update available/downloaded
- "Restart to update" button

### CI/CD

- `.github/workflows/ci.yml` — typecheck + unit tests on push/PR to main
- `.github/workflows/release.yml` — triggers on `v*` tags:
  1. Test job: unit tests
  2. Build job: matrix (ubuntu + windows), `npm run build` → `electron-builder --publish always`
  3. Publish job: set release notes from `RELEASE_NOTES.md`, flip draft → published

### Icons

- `public/img/axipulse-white.png` — default (Linux always, Windows dark taskbar)
- `public/img/axipulse-black.png` — Windows light taskbar
- Platform detection: Windows registry query for `SystemUsesLightTheme`, `nativeTheme.shouldUseDarkColors` fallback

---

## 9. Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Electron 35+ |
| UI framework | React 18 |
| Language | TypeScript (strict) |
| Bundler | Vite 6 |
| Styling | Tailwind CSS 3 |
| State management | Zustand 5 |
| Charts | Recharts 3 |
| Icons | lucide-react, gw2-class-icons |
| Animation | Framer Motion 10 |
| File watching | chokidar 3 |
| Persistence | electron-store |
| Auto-update | electron-updater |
| Packaging | electron-builder |
| Testing | vitest (unit) |

---

## 10. Out of Scope (v1)

- Custom user-defined timeline presets
- PvE / raid / fractal / strike support
- Appearance / theme settings
- Always-on-top / window pinning options
- Exposed EI parser configuration
- Cross-session history persistence
- DPS.report upload integration
- Discord webhook integration
- Web report viewer
