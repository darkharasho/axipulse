# AxiPulse

Personal GW2 combat analysis dashboard. A sidecar Electron app that reads arcdps logs, parses them locally in-process via axilog, and provides per-fight individual performance analysis.

## Quick start

```bash
npm install
npm run dev          # starts Vite + Electron concurrently
```

## Build

```bash
npm run build        # full production build (TypeScript + Vite + Electron)
npm run build:linux  # build + package AppImage
npm run build:win    # build + package Windows NSIS installer
```

## Architecture

- **Electron + React + TypeScript** with Vite bundler and Tailwind CSS
- Three TypeScript compilation targets:
  - `tsconfig.json` — renderer (React UI)
  - `electron/tsconfig.json` — main process + preload (Node.js)
- IPC via `contextBridge` in `src/preload/index.ts`

### Source layout

```
src/
  main/           Electron main process
    index.ts        Entry point, window management, IPC handlers
    axilogParser.ts axilog parse path (utilityProcess worker + direct call)
    axilogWorker.ts utilityProcess entry point for the parser
    watcher.ts      Chokidar file watcher for arcdps log directory
    handlers/       IPC handler registration modules
  preload/        Context bridge (renderer ↔ main)
    index.ts
  renderer/       React UI
    main.tsx        Entry point
    App.tsx         Root component, view routing
    app/
      AppLayout.tsx   Shell: titlebar, nav tabs, content area
    index.css       Tailwind + CSS custom properties (design tokens)
  shared/         Types/utilities shared between main and renderer
```

### Data flow

LogWatcher detects new `.evtc`/`.zevtc` → main process parses via axilog in a `utilityProcess` → `ReportV1` sent to renderer via IPC → displayed in Pulse/Timeline views

### Two focus areas

1. **Pulse** ("How am I doing?"): damage, down contribution, strips, healing, boon output
2. **Timeline** ("What happened?"): distance to tag, damage taken/dealt, boons applied — over time

### axilog

`@axiapps/axilog` is a napi binding to a Rust arcdps parser. `parseFile` is
synchronous, so `src/main/axilogParser.ts` runs it in an Electron
`utilityProcess` (`axilogWorker.ts`) to keep the window responsive; requests
and replies are matched by an incrementing id. `parseInProcess` is the same
parse without the worker, for tests. There is no install step and no .NET
runtime — the parser ships with the app.

The native binary comes from a platform-specific optional dependency, so
each platform's package must be built on that platform (CI already does:
`.github/workflows/release.yml` builds Windows on `windows-latest`).

## Distribution

- electron-builder with GitHub releases (draft → publish)
- Auto-updates via electron-updater
- Linux: AppImage, Windows: NSIS installer
- Icons: `public/img/axipulse-white.png` (dark taskbar) / `axipulse-black.png` (light taskbar)
- CI: `.github/workflows/release.yml` triggers on `v*` tags

## Design

- **axi-design** (`@axiapps/axi-design`), the Axi app family's design
  language: flat and outlined, square corners, hard offset blocks instead of
  blurred shadows, saturated inks at full strength only. The normative spec
  is `docs/RULES.md` in the axi-design repo.
- Every colour comes from an `--axi-*` token. The one exception is
  `src/renderer/themes/series.css`, which holds the fixed GW2 domain
  palettes (profession colours, chart series, timeline metrics) under the
  language's rule 10 — those are the data's colours, not the system's, and
  they are not recoloured by the accent.
- Accents are selected with `data-axi-accent` on `<html>`; ids come from the
  package's `accents.json`. The picker is in Settings, the choice persists in
  electron-store, and `src/renderer/themes/applyTheme.ts` mirrors it to
  `localStorage` so a non-default accent does not flash on launch. Default is
  `emerald-mint`.
- No webfonts: typography is the package's type scale over `--axi-sans`.
- `tests/renderer/tokens.test.ts` enforces the contract — no colour
  literals, no `border-radius`, no blurred shadows, no `font-family`. Run
  `npm run test:unit`.
- Frameless window with a custom titlebar; `.axi-window` draws its offset
  block inward, and `.draggable` / `.no-drag` mark the app regions.
