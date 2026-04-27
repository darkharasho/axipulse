# Release Notes Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "What's New" modal that auto-opens once per app version (with a Settings-side manual trigger), populated from the GitHub Releases API with a bundled `RELEASE_NOTES.md` fallback.

**Architecture:** A pure parser module extracts a single version's section from the bundled `RELEASE_NOTES.md`. A main-process IPC handler `getReleaseNotes(version)` tries GitHub Releases first, then falls back to the parsed bundled file. A new `lastSeenVersion` is persisted via the existing `electron-store`. The renderer fetches version + notes on mount, opens the modal when the version differs, and exposes a manual trigger from `SettingsView`.

**Tech Stack:** Electron + React + TypeScript, electron-store, framer-motion, react-markdown + remark-gfm (new deps), vitest.

**Spec:** `docs/superpowers/specs/2026-04-26-release-notes-modal-design.md`

---

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/main/releaseNotesParser.ts` | **NEW** | Pure function `extractVersionSection(markdown, version)` — testable without electron. |
| `src/main/handlers/releaseNotesHandlers.ts` | **NEW** | `registerReleaseNotesHandlers(store)` — IPC for `get-release-notes`, `get-last-seen-version`, `set-last-seen-version`. Owns GitHub fetch + bundled fallback. |
| `src/main/index.ts` | EDIT | Call `registerReleaseNotesHandlers(store)` during app init. |
| `src/preload/index.ts` | EDIT | Expose `getReleaseNotes`, `getLastSeenVersion`, `setLastSeenVersion`. |
| `src/renderer/globals.d.ts` | EDIT | Type the three new IPC methods. |
| `src/renderer/WhatsNewModal.tsx` | **NEW** | Framer-motion modal with `react-markdown` + `remark-gfm` body. |
| `src/renderer/app/AppLayout.tsx` | EDIT | On mount: fetch version + lastSeenVersion + notes; open modal if version mismatch and notes non-null. Render the modal. Manage manual-open via context-free state. |
| `src/renderer/views/SettingsView.tsx` | EDIT | "What's New" button that opens the modal for the current version. |
| `package.json` | EDIT | Add `react-markdown` and `remark-gfm` as runtime deps. |
| `tests/main/releaseNotesParser.test.ts` | **NEW** | Unit tests for the section parser. |

---

## Task 1: Add markdown dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run from `/var/home/mstephens/Documents/GitHub/axipulse`:

```bash
npm install react-markdown@^9 remark-gfm@^4
```

- [ ] **Step 2: Verify install**

Run: `node -e "require.resolve('react-markdown'); require.resolve('remark-gfm'); console.log('ok')"`
Expected: `ok`.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown and remark-gfm for release notes modal"
```

---

## Task 2: Pure section parser + tests

**Files:**
- Create: `src/main/releaseNotesParser.ts`
- Create: `tests/main/releaseNotesParser.test.ts`

The bundled `RELEASE_NOTES.md` uses sections like:

```
Version v0.1.15 — April 26, 2026

<sections>

Version v0.1.14 — April 21, 2026
```

The parser finds `Version v<version> — <anything>`, returns everything *after* that line up to (but not including) the next `Version v<digits>` line, trimmed. Returns `null` if not found.

- [ ] **Step 1: Write failing tests**

Create `tests/main/releaseNotesParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractVersionSection } from '../../src/main/releaseNotesParser';

const SAMPLE = `# Release Notes

Version v0.1.15 — April 26, 2026

## Boon Performance

Some text.

- Bullet 1
- Bullet 2

Version v0.1.14 — April 21, 2026

## Other thing

More text.

Version v0.1.13 — April 18, 2026

Old release.
`;

describe('extractVersionSection', () => {
    it('returns the section for the requested version, stripping the header line', () => {
        const result = extractVersionSection(SAMPLE, '0.1.15');
        expect(result).toBe('## Boon Performance\n\nSome text.\n\n- Bullet 1\n- Bullet 2');
    });

    it('returns the middle section bounded by the next Version header', () => {
        const result = extractVersionSection(SAMPLE, '0.1.14');
        expect(result).toBe('## Other thing\n\nMore text.');
    });

    it('returns the trailing section with no following Version header', () => {
        const result = extractVersionSection(SAMPLE, '0.1.13');
        expect(result).toBe('Old release.');
    });

    it('returns null when the version is absent', () => {
        const result = extractVersionSection(SAMPLE, '0.9.99');
        expect(result).toBeNull();
    });

    it('returns null when the document is empty', () => {
        expect(extractVersionSection('', '0.1.0')).toBeNull();
    });

    it('escapes regex metacharacters in the version string', () => {
        const result = extractVersionSection(SAMPLE, '0.1.15.*');
        expect(result).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/main/releaseNotesParser.test.ts`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement parser**

Create `src/main/releaseNotesParser.ts`:

```ts
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractVersionSection(markdown: string, version: string): string | null {
    if (!markdown) return null;
    const headerPattern = new RegExp(`^Version v${escapeRegex(version)}\\b.*$`, 'm');
    const headerMatch = headerPattern.exec(markdown);
    if (!headerMatch) return null;
    const start = headerMatch.index + headerMatch[0].length;
    const rest = markdown.slice(start);
    const nextHeader = /^Version v\d/m.exec(rest);
    const sliced = nextHeader ? rest.slice(0, nextHeader.index) : rest;
    const trimmed = sliced.trim();
    return trimmed.length > 0 ? trimmed : null;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/main/releaseNotesParser.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/releaseNotesParser.ts tests/main/releaseNotesParser.test.ts
git commit -m "feat(releaseNotes): add bundled-file section parser"
```

---

## Task 3: IPC handlers (GitHub fetch + bundled fallback + lastSeenVersion)

**Files:**
- Create: `src/main/handlers/releaseNotesHandlers.ts`

This task introduces three IPC handlers. The GitHub fetch path is best-effort — any network/parse error falls through to the bundled fallback silently.

- [ ] **Step 1: Create the handler module**

Create `src/main/handlers/releaseNotesHandlers.ts`:

```ts
import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type Store from 'electron-store';
import { extractVersionSection } from '../releaseNotesParser';

const RELEASES_URL = 'https://api.github.com/repos/darkharasho/axipulse/releases';

export type ReleaseNotesSource = 'github' | 'bundled' | 'none';

export interface ReleaseNotesResult {
    source: ReleaseNotesSource;
    markdown: string | null;
}

async function fetchFromGitHub(version: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(RELEASES_URL, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'axipulse' },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const releases = await res.json() as Array<{ tag_name?: string; body?: string }>;
        const match = releases.find(r => String(r?.tag_name || '') === `v${version}`);
        const body = typeof match?.body === 'string' ? match.body.trim() : '';
        return body.length > 0 ? body : null;
    } catch {
        return null;
    }
}

function readBundledNotes(version: string): string | null {
    const filePath = path.join(app.getAppPath(), 'RELEASE_NOTES.md');
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch {
        return null;
    }
    return extractVersionSection(content, version);
}

export function registerReleaseNotesHandlers(store: Store<any>): void {
    ipcMain.handle('release-notes:get', async (_event, version: string): Promise<ReleaseNotesResult> => {
        const safeVersion = String(version || '').trim();
        if (!safeVersion) return { source: 'none', markdown: null };

        const fromGithub = await fetchFromGitHub(safeVersion);
        if (fromGithub) return { source: 'github', markdown: fromGithub };

        const fromBundled = readBundledNotes(safeVersion);
        if (fromBundled) return { source: 'bundled', markdown: fromBundled };

        return { source: 'none', markdown: null };
    });

    ipcMain.handle('release-notes:get-last-seen', async (): Promise<string | null> => {
        const v = store.get('lastSeenVersion');
        return typeof v === 'string' && v.length > 0 ? v : null;
    });

    ipcMain.handle('release-notes:set-last-seen', async (_event, version: string): Promise<void> => {
        if (typeof version === 'string' && version.length > 0) {
            store.set('lastSeenVersion', version);
        }
    });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean (the file is unused at this point — that's fine, no `noUnusedLocals` should fire because `registerReleaseNotesHandlers` is exported).

- [ ] **Step 3: Commit**

```bash
git add src/main/handlers/releaseNotesHandlers.ts
git commit -m "feat(releaseNotes): add IPC handlers for fetch + lastSeenVersion"
```

---

## Task 4: Wire handlers into main process

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Import the handler module**

In `src/main/index.ts`, in the existing import block at the top of the file, add:

```ts
import { registerReleaseNotesHandlers } from './handlers/releaseNotesHandlers';
```

- [ ] **Step 2: Register handlers next to existing settings IPC**

Locate the `ipcMain.handle('get-app-version', ...)` block (around line 161). Immediately after that block, add:

```ts
    registerReleaseNotesHandlers(store);
```

(`store` is the existing electron-store instance already in scope.)

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(releaseNotes): register handlers during app init"
```

---

## Task 5: Expose IPC via preload + renderer types

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/globals.d.ts`

- [ ] **Step 1: Extend the preload bridge**

In `src/preload/index.ts`, locate the `// App info` block (around line 39):

```ts
    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
```

Append (still inside the `exposeInMainWorld` object):

```ts
    // Release notes
    getReleaseNotes: (version: string) => ipcRenderer.invoke('release-notes:get', version),
    getLastSeenVersion: () => ipcRenderer.invoke('release-notes:get-last-seen'),
    setLastSeenVersion: (version: string) => ipcRenderer.invoke('release-notes:set-last-seen', version),
```

- [ ] **Step 2: Add types to globals**

In `src/renderer/globals.d.ts`, locate the `electronAPI` declaration. Inside the type block, add (alongside existing fields):

```ts
        getReleaseNotes: (version: string) => Promise<{ source: 'github' | 'bundled' | 'none'; markdown: string | null }>;
        getLastSeenVersion: () => Promise<string | null>;
        setLastSeenVersion: (version: string) => Promise<void>;
```

If `globals.d.ts` declares `electronAPI` differently (e.g., via a single named interface), adapt the placement to match — the field names and signatures must be exactly as shown.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/globals.d.ts
git commit -m "feat(releaseNotes): expose IPC bridge to renderer"
```

---

## Task 6: WhatsNewModal component

**Files:**
- Create: `src/renderer/WhatsNewModal.tsx`

Visual component only — no tests. Verified at Task 9 in dev server.

- [ ] **Step 1: Create the modal**

Create `src/renderer/WhatsNewModal.tsx`:

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

type Props = {
    open: boolean;
    version: string;
    markdown: string | null;
    onClose: () => void;
};

export function WhatsNewModal({ open, version, markdown, onClose }: Props) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-6"
                    style={{ background: 'rgba(0,0,0,0.55)' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="relative w-full max-w-3xl rounded-lg border shadow-2xl flex flex-col"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b"
                            style={{ borderColor: 'var(--border-subtle)' }}>
                            <div className="flex items-center gap-2">
                                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '15px', color: 'var(--brand-primary)' }}>
                                    What's New
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    v{version}
                                </span>
                            </div>
                            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="overflow-y-auto px-5 py-4 prose-whatsnew text-sm" style={{ maxHeight: '65vh' }}>
                            {markdown ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={mdComponents}
                                >
                                    {markdown}
                                </ReactMarkdown>
                            ) : (
                                <div className="italic" style={{ color: 'var(--text-muted)' }}>
                                    Couldn't load release notes for v{version}.
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end px-5 py-3 border-t"
                            style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 text-xs rounded-md border transition-colors"
                                style={{ background: 'var(--accent-bg)', color: 'var(--brand-primary)', borderColor: 'var(--accent-border)' }}
                            >
                                Got it
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function openExternal(url: string) {
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

const mdComponents = {
    h1: ({ children }: { children?: ReactNode }) => (
        <h2 className="text-base font-semibold mb-2 mt-3" style={{ color: 'var(--text-primary)' }}>{children}</h2>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
        <h3 className="text-sm font-semibold uppercase tracking-wider mt-4 mb-1.5" style={{ color: 'var(--brand-primary)' }}>{children}</h3>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
        <h4 className="text-xs font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: 'var(--text-muted)' }}>{children}</h4>
    ),
    p: ({ children }: { children?: ReactNode }) => (
        <p className="mb-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{children}</p>
    ),
    ul: ({ children }: { children?: ReactNode }) => (
        <ul className="list-disc pl-5 mb-2 space-y-1" style={{ color: 'var(--text-secondary)' }}>{children}</ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
        <ol className="list-decimal pl-5 mb-2 space-y-1" style={{ color: 'var(--text-secondary)' }}>{children}</ol>
    ),
    li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
    code: ({ children }: { children?: ReactNode }) => (
        <code className="px-1 py-0.5 rounded text-[0.85em]"
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            {children}
        </code>
    ),
    blockquote: ({ children }: { children?: ReactNode }) => (
        <blockquote className="border-l-2 pl-3 my-2 italic"
            style={{ borderColor: 'var(--brand-primary)', color: 'var(--text-muted)' }}>
            {children}
        </blockquote>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a
            href={href}
            onClick={e => { e.preventDefault(); if (href) openExternal(href); }}
            style={{ color: 'var(--brand-primary)' }}
            className="hover:underline"
        >
            {children}
        </a>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
        <strong style={{ color: 'var(--text-primary)' }}>{children}</strong>
    ),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/WhatsNewModal.tsx
git commit -m "feat(releaseNotes): add WhatsNewModal component"
```

---

## Task 7: Auto-open on launch wired into AppLayout

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx`

- [ ] **Step 1: Read the existing file head to find the right insertion points**

Run: `head -60 src/renderer/app/AppLayout.tsx` to confirm import block layout. The component already manages `appVersion` via `useState` and `useEffect`. Reuse that — don't duplicate.

- [ ] **Step 2: Add modal state, fetch logic, and render**

In `src/renderer/app/AppLayout.tsx`:

a) Add the import alongside existing imports:

```ts
import { WhatsNewModal } from '../WhatsNewModal';
```

b) Inside `AppLayout` component, alongside the existing `appVersion` state, add:

```ts
    const [whatsNewOpen, setWhatsNewOpen] = useState(false);
    const [whatsNewMarkdown, setWhatsNewMarkdown] = useState<string | null>(null);
```

c) Find the existing `useEffect` that fetches `appVersion`. After the version is set, add a new effect (separate effect, not folded into the existing one) that runs once and depends on `appVersion`:

```ts
    useEffect(() => {
        if (!appVersion) return;
        let cancelled = false;
        (async () => {
            const lastSeen = await window.electronAPI?.getLastSeenVersion?.();
            if (cancelled) return;
            if (lastSeen === appVersion) return;
            const result = await window.electronAPI?.getReleaseNotes?.(appVersion);
            if (cancelled) return;
            if (result?.markdown) {
                setWhatsNewMarkdown(result.markdown);
                setWhatsNewOpen(true);
            } else {
                // No notes available — bookmark this version so we don't keep checking on every launch.
                await window.electronAPI?.setLastSeenVersion?.(appVersion);
            }
        })();
        return () => { cancelled = true; };
    }, [appVersion]);
```

d) Add a close handler near the other handlers:

```ts
    const handleWhatsNewClose = async () => {
        setWhatsNewOpen(false);
        if (appVersion) await window.electronAPI?.setLastSeenVersion?.(appVersion);
    };
```

e) Render the modal at the end of the layout's JSX, just before the outer wrapper closes (e.g., immediately before the closing tag of the root container — use a sibling Fragment if the root is a single element):

```tsx
            <WhatsNewModal
                open={whatsNewOpen}
                version={appVersion ?? ''}
                markdown={whatsNewMarkdown}
                onClose={handleWhatsNewClose}
            />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app/AppLayout.tsx
git commit -m "feat(releaseNotes): auto-open WhatsNewModal after version change"
```

---

## Task 8: Manual trigger from Settings

**Files:**
- Modify: `src/renderer/views/SettingsView.tsx`
- Modify: `src/renderer/app/AppLayout.tsx`

The cleanest way to give Settings an open trigger without prop-drilling is to lift the modal state into the existing global store (`useAppStore`). That keeps `WhatsNewModal` rendered once at the layout level and lets any view request it.

- [ ] **Step 1: Add store fields**

Edit `src/renderer/store.ts`. Locate the state shape and the initial state. Add to the type:

```ts
    whatsNewRequest: { version: string; markdown: string | null } | null;
    requestWhatsNew: (req: { version: string; markdown: string | null }) => void;
    clearWhatsNew: () => void;
```

And to the implementation:

```ts
    whatsNewRequest: null,
    requestWhatsNew: (req) => set({ whatsNewRequest: req }),
    clearWhatsNew: () => set({ whatsNewRequest: null }),
```

- [ ] **Step 2: Replace local state in AppLayout with store consumption**

In `src/renderer/app/AppLayout.tsx`:

a) Add to the existing `useAppStore` selector calls:

```ts
    const whatsNewRequest = useAppStore(s => s.whatsNewRequest);
    const requestWhatsNew = useAppStore(s => s.requestWhatsNew);
    const clearWhatsNew = useAppStore(s => s.clearWhatsNew);
```

b) Remove the local `whatsNewOpen` and `whatsNewMarkdown` state added in Task 7.

c) Update the auto-open effect to call `requestWhatsNew` instead of local setters:

```ts
    useEffect(() => {
        if (!appVersion) return;
        let cancelled = false;
        (async () => {
            const lastSeen = await window.electronAPI?.getLastSeenVersion?.();
            if (cancelled) return;
            if (lastSeen === appVersion) return;
            const result = await window.electronAPI?.getReleaseNotes?.(appVersion);
            if (cancelled) return;
            if (result?.markdown) {
                requestWhatsNew({ version: appVersion, markdown: result.markdown });
            } else {
                await window.electronAPI?.setLastSeenVersion?.(appVersion);
            }
        })();
        return () => { cancelled = true; };
    }, [appVersion, requestWhatsNew]);
```

d) Update the close handler:

```ts
    const handleWhatsNewClose = async () => {
        const wasAutoOpened = whatsNewRequest?.version === appVersion;
        clearWhatsNew();
        if (wasAutoOpened && appVersion) {
            await window.electronAPI?.setLastSeenVersion?.(appVersion);
        }
    };
```

e) Update the render:

```tsx
            <WhatsNewModal
                open={whatsNewRequest !== null}
                version={whatsNewRequest?.version ?? ''}
                markdown={whatsNewRequest?.markdown ?? null}
                onClose={handleWhatsNewClose}
            />
```

- [ ] **Step 3: Add the manual trigger to Settings**

In `src/renderer/views/SettingsView.tsx`:

a) Add to the existing `useAppStore` selector calls:

```ts
    const requestWhatsNew = useAppStore(s => s.requestWhatsNew);
```

b) Add a handler near the other handlers:

```ts
    const handleOpenWhatsNew = async () => {
        const version = await window.electronAPI?.getAppVersion?.();
        if (!version) return;
        const result = await window.electronAPI?.getReleaseNotes?.(version);
        requestWhatsNew({ version, markdown: result?.markdown ?? null });
    };
```

c) Place a "What's New" button in a sensible spot. The Settings view already groups things into `SectionCard`s. Add a new card just below the directory/EI cards, above the dev tools:

```tsx
            <SectionCard label="About">
                <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Release notes
                    </span>
                    <Btn variant="ghost" onClick={handleOpenWhatsNew}>
                        What's New
                    </Btn>
                </div>
            </SectionCard>
```

If the Settings view already has an "About" section, add the row inside that section instead of creating a new card.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store.ts src/renderer/app/AppLayout.tsx src/renderer/views/SettingsView.tsx
git commit -m "feat(releaseNotes): add Settings manual trigger via shared store"
```

---

## Task 9: Manual verification in dev server

**Files:** none

- [ ] **Step 1: Run all checks**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + all tests pass.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`

- [ ] **Step 3: Verify auto-open on first launch**

Open the app. The modal should appear on its own with the current version's notes (sourced from GitHub if reachable, otherwise the bundled `RELEASE_NOTES.md`). Close it.

- [ ] **Step 4: Verify the modal does not reopen on relaunch**

Stop the dev server. Restart it. The modal should not appear (because `lastSeenVersion` was set when you closed it).

- [ ] **Step 5: Verify the manual trigger from Settings**

Open Settings → "What's New" button. The modal should open for the current version. Closing this manual open should NOT change anything (you're already on `lastSeenVersion`).

- [ ] **Step 6: Verify Escape and overlay-click both close the modal**

Open the modal again via Settings. Press Escape — closes. Open it again, click outside the modal panel — closes.

- [ ] **Step 7: Verify external link behavior**

Inside the modal, find any link in the rendered notes (or use a notes version that contains one). Clicking should open in the system browser, not in the Electron window.

- [ ] **Step 8: Force the auto-open path again**

Stop the dev server. To re-trigger the auto-open path, clear the stored `lastSeenVersion`. The simplest way:

Run (Linux): `rm -f "$HOME/.config/AxiPulse-default/config.json"` (path may differ — adjust based on `app.getPath('userData')` for your platform; on dev, electron-store defaults to userData). Or use the in-app store inspector if one exists.

Restart `npm run dev`. Modal auto-opens. Close.

- [ ] **Step 9: Commit any visual fixes if needed**

```bash
git add -A
git commit -m "fix(releaseNotes): visual polish from manual review"
```

(Only if changes were made — otherwise skip.)

---

## Done

The user sees the relevant `What's New` notes once per version automatically, and can revisit them any time from Settings. Notes prefer the live GitHub release body (so post-release edits propagate), with the bundled file as an offline-safe fallback.
