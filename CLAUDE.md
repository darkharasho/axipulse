# AxiPulse

Personal GW2 combat analysis dashboard. A sidecar Electron app that reads arcdps logs, parses them locally via Elite Insights, and provides per-fight individual performance analysis.

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
    eiParser.ts     Elite Insights CLI manager (download, install, parse)
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

LogWatcher detects new `.evtc`/`.zevtc` → main process parses via EI CLI → JSON result sent to renderer via IPC → displayed in Pulse/Timeline views

### Two focus areas

1. **Pulse** ("How am I doing?"): damage, down contribution, strips, healing, boon output
2. **Timeline** ("What happened?"): distance to tag, damage taken/dealt, boons applied — over time

### Elite Insights

Managed via `EiManager` class — downloads GW2EICLI.zip from GitHub releases, extracts locally. On Linux also installs .NET 8.0 runtime. Parses logs to JSON via CLI subprocess with 10-minute timeout.

## Distribution

- electron-builder with GitHub releases (draft → publish)
- Auto-updates via electron-updater
- Linux: AppImage, Windows: NSIS installer
- Icons: `public/img/axipulse-white.png` (dark taskbar) / `axipulse-black.png` (light taskbar)
- CI: `.github/workflows/release.yml` triggers on `v*` tags

## Design

- Dark theme matching Axi app family (axibridge, axiforge, axiam)
- Brand color: emerald/cyan gradient (`--brand-primary: #10b981`)
- Cinzel serif font for "AxiPulse" branding in titlebar
- Frameless window with custom titlebar and traffic light controls
