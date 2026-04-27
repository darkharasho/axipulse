# Release Notes Modal

## Summary

Show a "What's New" modal when the user launches a new version of axipulse for the first time, mirroring the pattern used in axibridge. Render notes via markdown, source from GitHub Releases with a bundled `RELEASE_NOTES.md` fallback. Add a manual trigger in Settings.

## Goal

After every install/update, surface the user-visible changes from the new version without requiring the user to visit GitHub. Keep the version pill's existing "check for updates" behavior unchanged.

## Triggers

Two paths into the same modal:

- **Auto-open on launch.** During app initialization, compare `app.getVersion()` to a persisted `lastSeenVersion` (electron-store). If they differ (including when the field is missing), open the modal. Closing the modal sets `lastSeenVersion` to the current app version.
- **Manual.** A "What's New" button in the Settings view. Clicking it always opens the modal for the current version. Manual opens do not touch `lastSeenVersion`.

## Component

New `src/renderer/WhatsNewModal.tsx`. Framer-motion overlay matching the existing `TroubleshootModal` styling:

- Centered, max-width 4xl, max-height 65vh on the body.
- Title: `What's New in v<version>`.
- Body: `react-markdown` + `remark-gfm` rendering, with custom component overrides matching axipulse dark theme (heading hierarchy, code blocks, blockquotes, list spacing, link colors).
- Links open externally via `window.electronAPI.openExternal` when present, otherwise `window.open`.
- Single dismiss button labeled "Got it".
- Dismiss-on-overlay-click and Escape key both close.

## Data Source

New main-process module `src/main/handlers/releaseNotesHandlers.ts` exposes one IPC handler:

```
getReleaseNotes(version: string)
  → Promise<{ source: 'github' | 'bundled' | 'none'; markdown: string | null }>
```

Lookup order:

1. **GitHub Releases API.** `GET https://api.github.com/repos/darkharasho/axipulse/releases` (unauthenticated). Find the release whose `tag_name` matches `v${version}`. If found, return `{ source: 'github', markdown: release.body }`.
2. **Bundled `RELEASE_NOTES.md`.** Read the file shipped via electron-builder `extraResources`. Slice out the section for the requested version using header pattern `Version v<version>` until the next `Version v...` header (or end of file). If found, return `{ source: 'bundled', markdown: <slice> }`.
3. Otherwise return `{ source: 'none', markdown: null }`.

Network errors fall through silently to the bundled tier. The renderer treats `markdown: null` as "no notes available — don't open the modal" (auto path) or "show a graceful empty state" (manual path).

## Persistence

One new electron-store key:

- `lastSeenVersion: string | undefined`

Two new IPC methods:

- `getLastSeenVersion(): Promise<string | undefined>`
- `setLastSeenVersion(version: string): Promise<void>`

These live alongside existing settings handlers. No migration is needed; the absent field naturally triggers the modal on first launch after this feature ships.

## File Changes

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/main/handlers/releaseNotesHandlers.ts` | **NEW** | `getReleaseNotes` IPC handler with GitHub fetch + bundled fallback + version-section parser. |
| `src/main/handlers/settingsHandlers.ts` (or extend existing settings IPC) | EDIT/NEW | Add `getLastSeenVersion` / `setLastSeenVersion` IPC methods backed by electron-store. |
| `src/main/index.ts` | EDIT | Register both handler modules. |
| `electron-builder.json` (or `package.json` build config) | EDIT | Ensure `RELEASE_NOTES.md` is in `extraResources` so the main process can read it from the packaged app. |
| `src/preload/index.ts` | EDIT | Expose `getReleaseNotes`, `getLastSeenVersion`, `setLastSeenVersion` via `contextBridge`. |
| `src/renderer/globals.d.ts` | EDIT | Type the three new IPC methods. |
| `src/renderer/WhatsNewModal.tsx` | **NEW** | Modal component (framer-motion + react-markdown). |
| `src/renderer/app/AppLayout.tsx` | EDIT | On mount, compare versions and open the modal. Render the modal at layout level so it overlays everything. |
| `src/renderer/views/SettingsView.tsx` | EDIT | New "What's New" button that opens the modal for the current version. |
| `package.json` | EDIT | Add `react-markdown` and `remark-gfm` dependencies. |
| `tests/main/releaseNotes.test.ts` | **NEW** | Unit tests for the bundled-section parser: matches header, slices through next header or EOF, handles missing version. |

## Markdown Section Parser (bundled fallback)

Parses `RELEASE_NOTES.md`, which uses the format established in `docs/release-notes-style.md`:

```
# Release Notes

Version v0.1.15 — April 26, 2026

<sections>

Version v0.1.14 — April 21, 2026

<sections>
```

Algorithm:

1. Find the first line matching `^Version v<requested-version>\b`.
2. Capture everything after that line up to (but not including) the next `^Version v\d` line, or end of file.
3. Trim trailing whitespace.
4. Return `null` if no match.

The leading `Version vX.Y.Z — Date` line is stripped from the returned slice — the modal title already shows the version.

## UX Details

- **Auto-open path:** Wait for the IPC fetch to resolve before opening the modal so the user never sees a flash of empty content. If `markdown: null`, silently set `lastSeenVersion` to the current version (so we don't spam them on every relaunch) and don't open.
- **Manual path:** Always open the modal. If `markdown: null`, show "Couldn't load release notes for v<version>." inside the modal body.
- **Open-external links:** All links rendered through `react-markdown` use a custom anchor that calls the external opener and prevents in-app navigation.
- **Animation:** Match `TroubleshootModal` — overlay fade, content scale-in.

## Non-Goals

- No history view of past releases — current version only.
- No localization of release notes.
- No diff between two versions.
- No GitHub auth — accept the unauthenticated rate limit (60 requests/hour per IP, vastly more than needed for one fetch per launch).
- No telemetry on whether users read notes.

## Tradeoffs

- **GitHub-first vs. bundled-first.** GitHub-first means edits to release notes after publishing reach users immediately, at the cost of a network round-trip on every launch with a version mismatch. Bundled-first would skip the network call but freeze the notes at ship time. Going GitHub-first matches axibridge.
- **Single-version modal vs. cumulative.** If a user skips several versions, they only see notes for the version they're now on, not all versions in between. Matches axibridge. A future enhancement could concatenate notes between `lastSeenVersion` and current.
- **Section parser fragility.** The bundled-fallback parser relies on the header pattern `Version vX.Y.Z`. If the style guide changes, the parser breaks. Mitigated by tests that pin the format.
