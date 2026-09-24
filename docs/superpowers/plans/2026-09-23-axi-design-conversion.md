# AxiPulse axi-design Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin AxiPulse's entire renderer in the axi-design language — flat, outlined, square-cornered, every colour through a token — without changing what the app does.

**Architecture:** A foundation lands the `@axiapps/axi-design` package, a rewritten `src/renderer/index.css` app layer under the `ap-` prefix, and a theming module; a deliberately-fenced legacy shim keeps un-converted screens legible while the conversion proceeds screen by screen; a final task deletes the shim and un-skips the test that asserts its absence.

**Tech Stack:** Electron 35, React 18, TypeScript 5.2, Vite 6, Tailwind 3, vitest 4, recharts 3.6, `@axiapps/axi-design`.

**Spec:** `docs/superpowers/specs/2026-09-23-axi-design-conversion-design.md`

## Global Constraints

- **Package version:** `@axiapps/axi-design` `^1.8.0` (the version AxiAM is on).
- **App prefix:** `ap-`. Every app-specific class is `ap-*` and composes only tokens.
- **The only file permitted colour literals is `src/renderer/themes/series.css`.** Everywhere else — CSS, TSX inline styles, SVG, recharts props — every colour resolves through an `--axi-*` or `--axi-series-*` token.
- **Zero `border-radius` and zero `rounded-*` Tailwind utilities** anywhere in `src/renderer`. `--axi-radius` and `--axi-radius-sm` are both `0` and are a contract, not a convention.
- **Zero `font-family` declarations and no `@import url(`** anywhere in `src/renderer`.
- **`box-shadow` must be exactly `<offset> <offset> 0 var(--axi-ink-line)`**, with the offset drawn from `--axi-offset-control`, `--axi-offset-control-hover`, `--axi-offset-panel`, `--axi-offset-panel-hover`. No blur radius, ever. `filter: drop-shadow(...)` and `text-shadow` are forbidden outright.
- **Border and outline weights come from `--axi-border-hairline` (2px), `--axi-border-control` (3px), `--axi-border-panel` (4px).** Never a literal px weight. Never redeclare a Form-layer token locally.
- **Hover lifts only.** `transform: translate(-2px, -2px)` plus a grown offset block. Never opacity, never a glow, never a border-colour change alone.
- **No `:hover` styling on elements that are not interactive.** (Standing project rule.)
- **Default accent:** `emerald-mint`.
- **Test runner:** `vitest.config.ts` already sets `pool: 'forks'`, `maxForks: 2`, `maxWorkers: 2`. Run `npm run test:unit`. Do not override the parallelism.
- **This is a reskin.** Behaviour stays identical except for the six changes the spec enumerates under "Deliberate behaviour changes."

## Review Focus

These are the failure modes the spec implies but that no screen task naturally exercises. Each has a test pinned to the task that owns the code.

1. **`resolveAccentId` receives a non-string.** `localStorage.getItem` and `electron-store` both return unvalidated data; a number or object from a hand-edited `config.json` must fall back to the default rather than reach `setAttribute`. — Task 1.
2. **`getProfessionColor` receives an unknown or empty profession.** A future GW2 elite spec, or `''`, must return the Unknown token — never the malformed `var(--axi-series-prof-)`, which computes to nothing and renders black. — Task 3.
3. **`readToken` is asked for a token that does not exist.** `getPropertyValue` returns `''` for an undefined property, and `''` handed to a recharts `fill` renders black. It must return a visible fallback. — Task 3.
4. **`localStorage` throws.** Electron can be configured with storage disabled, and `applyTheme` runs at bootstrap before any error boundary exists. A throw there is a white window. — Task 1.
5. **`get-settings` returns a persisted accent id that is no longer an official accent.** An accent removed from a future `accents.json`, or a hand-edited config, must not leave the app with `data-axi-accent` set to a dead id and therefore no accent at all. — Task 5.

---

### Task 1: Theming module — accents and applyTheme

**Files:**
- Modify: `package.json` (add the dependency)
- Create: `src/renderer/themes/accents.ts`
- Create: `src/renderer/themes/applyTheme.ts`
- Test: `tests/renderer/accents.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ACCENTS: AccentDefinition[]` where `AccentDefinition = { id: string; label: string; hex: string }`
  - `DEFAULT_ACCENT_ID: string` (the literal `'emerald-mint'`)
  - `resolveAccentId(id?: unknown): string`
  - `applyTheme(themeId?: unknown): string` — sets `data-axi-accent` on `<html>`, mirrors to `localStorage` under the key `axipulse.accentId`, returns the resolved id
  - `readStoredAccentId(): string | undefined` — reads the `localStorage` mirror

- [ ] **Step 1: Install the package**

```bash
npm install @axiapps/axi-design@^1.8.0
```

Expected: `package.json` gains `"@axiapps/axi-design": "^1.8.0"` under `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `tests/renderer/accents.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT_ID, resolveAccentId } from '../../src/renderer/themes/accents';

describe('the accent list', () => {
    it('is the eleven official accents', () => {
        expect(ACCENTS).toHaveLength(11);
        expect(ACCENTS.map((a) => a.id)).toContain('emerald-mint');
        expect(ACCENTS[0].id).toBe('axi-gold');
    });

    it('gives every accent an id, a label and a hex', () => {
        for (const a of ACCENTS) {
            expect(typeof a.id).toBe('string');
            expect(typeof a.label).toBe('string');
            expect(a.hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
});

describe('resolveAccentId', () => {
    it('passes every official id through unchanged', () => {
        for (const a of ACCENTS) {
            expect(resolveAccentId(a.id)).toBe(a.id);
        }
    });

    it('defaults to emerald-mint', () => {
        expect(DEFAULT_ACCENT_ID).toBe('emerald-mint');
        expect(resolveAccentId(undefined)).toBe(DEFAULT_ACCENT_ID);
    });

    // Review Focus 1: electron-store and localStorage both hand back
    // unvalidated data. Anything that is not an official id is the default.
    it('falls back for unknown, empty and non-string input', () => {
        expect(resolveAccentId('garbage')).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId('')).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId(null)).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId(42)).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId({ id: 'teal-ocean' })).toBe(DEFAULT_ACCENT_ID);
        expect(resolveAccentId(['teal-ocean'])).toBe(DEFAULT_ACCENT_ID);
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit -- tests/renderer/accents.test.ts`
Expected: FAIL — cannot resolve `../../src/renderer/themes/accents`.

- [ ] **Step 4: Write `accents.ts`**

Create `src/renderer/themes/accents.ts`:

```ts
import accentsJson from '@axiapps/axi-design/accents.json';

export type AccentDefinition = { id: string; label: string; hex: string };

export const ACCENTS: AccentDefinition[] = accentsJson as AccentDefinition[];

export const DEFAULT_ACCENT_ID = 'emerald-mint';

// AxiPulse has never persisted a theme id, so unlike AxiAM there is no
// legacy-id map to carry. Anything that is not an official accent - a
// hand-edited config, a stale id from a future accents.json, a non-string
// out of localStorage - resolves to the default rather than reaching
// setAttribute, where a dead id would leave the app with no accent at all.
export function resolveAccentId(id?: unknown): string {
    if (typeof id === 'string' && ACCENTS.some((a) => a.id === id)) return id;
    return DEFAULT_ACCENT_ID;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- tests/renderer/accents.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the failing test for `applyTheme`**

Append to `tests/renderer/accents.test.ts`:

```ts
import { applyTheme, readStoredAccentId, ACCENT_STORAGE_KEY } from '../../src/renderer/themes/applyTheme';

describe('applyTheme', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        const store = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
        });
        vi.stubGlobal('document', {
            documentElement: {
                _attrs: {} as Record<string, string>,
                classList: { add() {}, remove() {} },
                setAttribute(k: string, v: string) { this._attrs[k] = v; },
                getAttribute(k: string) { return this._attrs[k] ?? null; },
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('sets data-axi-accent on the root element', () => {
        expect(applyTheme('teal-ocean')).toBe('teal-ocean');
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('teal-ocean');
    });

    it('resolves before applying, so a dead id never reaches the DOM', () => {
        expect(applyTheme('garbage')).toBe(DEFAULT_ACCENT_ID);
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe(DEFAULT_ACCENT_ID);
    });

    it('mirrors the resolved id to localStorage for the next cold start', () => {
        applyTheme('rose-pink');
        expect(readStoredAccentId()).toBe('rose-pink');
        expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('rose-pink');
    });

    // Review Focus 4: applyTheme runs at bootstrap, before any error
    // boundary exists. A storage throw there is a white window.
    it('still applies the accent when localStorage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('storage disabled'); },
            setItem: () => { throw new Error('storage disabled'); },
        });
        expect(() => applyTheme('violet-purple')).not.toThrow();
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('violet-purple');
        expect(readStoredAccentId()).toBeUndefined();
    });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test:unit -- tests/renderer/accents.test.ts`
Expected: FAIL — cannot resolve `../../src/renderer/themes/applyTheme`.

- [ ] **Step 8: Write `applyTheme.ts`**

Create `src/renderer/themes/applyTheme.ts`:

```ts
import { resolveAccentId } from './accents';

export const ACCENT_STORAGE_KEY = 'axipulse.accentId';

let transitionTimer: ReturnType<typeof setTimeout> | null = null;

// electron-store is the source of truth, but getSettings() is async and
// resolves after first paint. This mirror is read synchronously at bootstrap
// so a non-default accent does not flash emerald on every launch.
export function readStoredAccentId(): string | undefined {
    try {
        return localStorage.getItem(ACCENT_STORAGE_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

export function applyTheme(themeId?: unknown): string {
    const id = resolveAccentId(themeId);
    const root = document.documentElement;

    root.classList.add('theme-transitioning');
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        root.classList.remove('theme-transitioning');
        transitionTimer = null;
    }, 500);

    root.setAttribute('data-axi-accent', id);

    // Storage can be disabled; the accent still applied, so swallow.
    try {
        localStorage.setItem(ACCENT_STORAGE_KEY, id);
    } catch {
        /* the mirror is a cache, not the source of truth */
    }

    return id;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm run test:unit -- tests/renderer/accents.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json src/renderer/themes tests/renderer
git commit -m "feat(theme): accent resolution and applyTheme

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The app layer — `index.css`, `main.tsx`, and the guard test

**Files:**
- Rewrite: `src/renderer/index.css` (currently 138 lines; every line is replaced)
- Modify: `src/renderer/main.tsx:1-4`
- Test: `tests/renderer/tokens.test.ts`

**Interfaces:**
- Consumes: `applyTheme`, `readStoredAccentId` from Task 1.
- Produces: the `ap-` class vocabulary every later task composes —
  `.ap-work` (opacity blink), `.draggable`, `.no-drag`, `.stat-bar-fill`,
  `.font-stat`; and the timing tokens `--ap-ease-out-expo`,
  `--ap-duration-fast` (120ms), `--ap-duration-normal` (200ms),
  `--ap-duration-slow` (350ms).

- [ ] **Step 1: Write the failing guard test**

Create `tests/renderer/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = () => readFileSync(resolve('src/renderer/index.css'), 'utf8');

// Comments routinely name a hex while explaining why it was chosen, and a
// naive scan would read that as a violation - a false failure that teaches
// people to stop writing the comments. Replace each comment with the
// newlines it spanned so offenders are still reported at their true line.
const stripComments = (css: string) =>
    css.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));

// CSS is not line-oriented: `border:\n  7px solid ...` is the same
// declaration as its one-line form and must be judged identically. Split on
// the only three characters that end a declaration or selector.
const declarations = (css: string): Array<{ text: string; line: number }> => {
    const clean = stripComments(css);
    const out: Array<{ text: string; line: number }> = [];
    let start = 0;
    let line = 1;
    for (let i = 0; i <= clean.length; i++) {
        const ch = clean[i];
        if (i === clean.length || ch === ';' || ch === '{' || ch === '}') {
            const raw = clean.slice(start, i);
            const lead = raw.match(/^\s*/)![0];
            const text = raw.slice(lead.length);
            if (text.trim()) out.push({ text, line: line + (lead.match(/\n/g) || []).length });
            start = i + 1;
            line += (raw.match(/\n/g) || []).length;
        }
    }
    return out;
};

const valueOf = (text: string) => {
    const i = text.indexOf(':');
    return i === -1 ? '' : text.slice(i + 1);
};

// Only the VALUES of colour-carrying properties are scanned. Scanning whole
// lines would false-positive on `#root`.
const COLOUR_PROPERTY =
    /^(color|background(-image|-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|outline-color|box-shadow|text-shadow|filter|fill|stroke|caret-color|column-rule-color|text-decoration-color|accent-color|scrollbar-color)\s*:/i;

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|color-mix|oklch|lab)\s*\(/i;

// A border/outline WEIGHT property: the shorthand, -width, or any
// longhand side - but not -radius, -color, -style, -collapse, -spacing,
// or outline-offset (a position knob, not a weight).
const WEIGHT_PROPERTY =
    /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-width)?|outline(-width)?)\s*:/i;

const LITERAL_WEIGHT = /(^|[\s(])\d*\.?\d+(px|rem|em|pt)\b/i;

// Form tokens are theme surface, defined once in the package. A local
// redeclaration would mint an arbitrary third form step - and a blur, via a
// redefined offset - while every other check below stayed green, because
// they read the var() name a declaration spells, never what it is worth.
const FORM_TOKEN_DECLARATION = /^(--axi-(border|offset|radius)[a-z0-9-]*)\s*:/i;

const OFFSET_TOKENS = [
    '--axi-offset-control',
    '--axi-offset-control-hover',
    '--axi-offset-panel',
    '--axi-offset-panel-hover',
];

describe('src/renderer/index.css obeys the axi-design contract', () => {
    it('carries no colour literal in any colour-carrying value', () => {
        const bad = declarations(CSS())
            .filter((d) => COLOUR_PROPERTY.test(d.text) && COLOUR_LITERAL.test(valueOf(d.text)))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('has no border-radius', () => {
        const bad = declarations(CSS())
            .filter((d) => /^border-radius\s*:/i.test(d.text))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('draws every box-shadow offset from the four offset tokens, with no blur', () => {
        const bad: string[] = [];
        for (const d of declarations(CSS())) {
            if (!/^box-shadow\s*:/i.test(d.text)) continue;
            const value = valueOf(d.text);
            if (/^\s*(none|inherit|initial|unset)\s*$/i.test(value)) continue;
            const tokens = [...value.matchAll(/var\(\s*(--axi-offset-[a-z-]+)/g)].map((m) => m[1]);
            const ok = tokens.length > 0 && tokens.every((t) => OFFSET_TOKENS.includes(t));
            // Any bare length that is not `0` is either a rogue offset or a
            // blur radius; both are the thing this check exists to catch.
            const bareLength = /(^|[\s(])\d*\.?\d+(px|rem|em)\b/i.test(
                value.replace(/var\([^)]*\)/g, '').replace(/calc\([^)]*\)/g, ''),
            );
            if (!ok || bareLength) bad.push(`${d.line}: ${d.text.trim()}`);
        }
        expect(bad).toEqual([]);
    });

    it('never uses drop-shadow or text-shadow', () => {
        expect(stripComments(CSS())).not.toMatch(/drop-shadow\s*\(/i);
        expect(stripComments(CSS())).not.toMatch(/(^|[\s;{])text-shadow\s*:/i);
    });

    it('takes every border and outline weight from a token', () => {
        const bad = declarations(CSS())
            .filter((d) => WEIGHT_PROPERTY.test(d.text) && LITERAL_WEIGHT.test(valueOf(d.text)))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('never redeclares a Form-layer token locally', () => {
        const bad = declarations(CSS())
            .filter((d) => FORM_TOKEN_DECLARATION.test(d.text))
            .map((d) => `${d.line}: ${d.text.trim()}`);
        expect(bad).toEqual([]);
    });

    it('declares no font-family and imports no webfont', () => {
        const clean = stripComments(CSS());
        expect(clean).not.toMatch(/font-family\s*:/i);
        expect(clean).not.toMatch(/@import\s+url\(/i);
    });

    // Un-skip this in the final task, when the last shim row is gone.
    it.skip('no longer carries the legacy shim', () => {
        expect(CSS()).not.toMatch(/LEGACY SHIM/);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/renderer/tokens.test.ts`
Expected: FAIL on at least the colour-literal, `border-radius`, and `font-family` checks — the current `index.css` violates all three. The skipped shim test reports as skipped.

- [ ] **Step 3: Rewrite `index.css`**

Replace the entire contents of `src/renderer/index.css` with:

```css
@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

/* AxiPulse app layer over @axiapps/axi-design (imported first in main.tsx).
   Frameless-window plumbing and the app's own shapes, under the `ap-`
   prefix. No colour literals: every colour is a token. The one exception in
   this app is themes/series.css, which holds the fixed GW2 domain palettes
   under rule 10. */

/* --- app-layer timing (no colour, no form) --- */

:root {
    --ap-ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ap-duration-fast: 120ms;
    --ap-duration-normal: 200ms;
    --ap-duration-slow: 350ms;
}

/* --- window plumbing --- */

*, *::before, *::after { box-sizing: border-box; }

html, body, #root { height: 100%; width: 100%; }
body { margin: 0; overflow: hidden; -webkit-font-smoothing: antialiased; }

/* A frameless window has nothing behind it for a block to fall onto, so the
   window's offset block is drawn inward. */
.axi-window {
    box-shadow: inset calc(-1 * var(--axi-offset-panel)) calc(-1 * var(--axi-offset-panel)) 0 0 var(--axi-ink-line);
}

.draggable { -webkit-app-region: drag; }
.no-drag { -webkit-app-region: no-drag; }

/* --- titlebar --- */

/* The titlebar strip can't carry a full-size chip: the status chips slim
   down to a tag that fits inside the bar without crowding its edges. */
.axi-titlebar .axi-chip {
    padding: 1px 7px;
    gap: 5px;
}

/* The package buttons align their svg glyphs on the text baseline, which
   drops them below centre of the button box. */
.axi-titlebar__btns button {
    display: grid;
    place-items: center;
}

/* --- accent crossfade --- */

.theme-transitioning *,
.theme-transitioning *::before,
.theme-transitioning *::after {
    transition: background-color .4s ease, border-color .4s ease,
        color .2s ease, box-shadow .4s ease, outline-color .4s ease !important;
}

/* --- scrollbars --- */

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--axi-ground); }
::-webkit-scrollbar-thumb {
    background: var(--axi-surface-raised);
    border: var(--axi-border-hairline) solid var(--axi-ink-line);
}
::-webkit-scrollbar-thumb:hover { background: var(--axi-rule); }

/* --- work indicator --- */

/* Replaces the old .heartbeat-pulse, which animated `scale` on a
   text-bearing layer (rule 11). An opacity blink is compositor-only. */
@keyframes ap-work {
    0%, 100% { opacity: 1; }
    50% { opacity: .25; }
}

.ap-work { animation: ap-work 1.1s ease-in-out infinite; }

/* --- stat bars --- */

/* A bar is not text, and rule 9 draws a quantity as length, so this entry
   animation survives the conversion unchanged. */
@keyframes ap-bar-fill-in {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
}

.stat-bar-fill {
    transform-origin: left;
    animation: ap-bar-fill-in 0.6s var(--ap-ease-out-expo) both;
}

/* Rajdhani's actual job here was column alignment in stat tables. Tabular
   numerals do that job without leaving the language's type scale. */
.font-stat { font-variant-numeric: tabular-nums; }

/* --- reduced motion --- */

@media (prefers-reduced-motion: reduce) {
    /* `animation: none` rests .ap-work at full opacity, so the
       watching-for-logs state stays legible; it just stops blinking. */
    .ap-work { animation: none; }
    .stat-bar-fill { animation: none; }
    .theme-transitioning *,
    .theme-transitioning *::before,
    .theme-transitioning *::after { transition: none !important; }
}

/* ── LEGACY SHIM — DELETE IN THE FINAL COMMIT ──
   Temporary bridge so un-converted screens stay legible mid-conversion.
   Each screen commit removes the rows it no longer consumes.
   tests/renderer/tokens.test.ts has a skipped assertion that this
   block is gone; un-skip it when the last row goes.

   Only MAPPABLE rows appear here. The deleted concepts - --accent-bg,
   --brand-gradient, --glow-*, --status-*-bg, --bg-hover - are deliberately
   absent, so that every un-converted rule-violating call site renders
   visibly wrong. That is the to-do list, not a bug. */
:root {
    --bg-base: var(--axi-ground);
    --bg-elevated: var(--axi-surface-raised);
    --bg-card: var(--axi-surface);
    --bg-card-inner: var(--axi-ground);
    --bg-input: var(--axi-surface);

    --border-subtle: var(--axi-ink-line);
    --border-default: var(--axi-ink-line);
    --border-hover: var(--axi-ink-line);

    --text-primary: var(--axi-text);
    --text-secondary: var(--axi-text-dim);
    --text-muted: var(--axi-text-faint);
    --text-inverse: var(--axi-accent-ink);

    --brand-primary: var(--axi-accent);
    --brand-secondary: var(--axi-accent);

    --shadow-card: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);
    --shadow-button: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
    --shadow-dropdown: var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line);

    --radius-sm: var(--axi-radius-sm);
    --radius-md: var(--axi-radius);
    --radius-lg: var(--axi-radius);

    --status-success: var(--axi-ok);
    --status-error: var(--axi-danger);
    --status-warning: var(--axi-warn);

    --ease-out-expo: var(--ap-ease-out-expo);
    --duration-fast: var(--ap-duration-fast);
    --duration-normal: var(--ap-duration-normal);
    --duration-slow: var(--ap-duration-slow);
}
/* ── END LEGACY SHIM ── */
```

Note the guard test scans `box-shadow` values; the shim's three shadow rows
are custom-property declarations, not `box-shadow` declarations, so they are
inert to that check — but they must still spell real offset tokens, because
their consumers are `box-shadow` sites.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- tests/renderer/tokens.test.ts`
Expected: PASS, 7 passed, 1 skipped.

- [ ] **Step 5: Wire `main.tsx`**

Replace `src/renderer/main.tsx` with:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@axiapps/axi-design/axi.css';
import '@axiapps/axi-design/accents.css';
import './index.css'
import './themes/series.css'
import { applyTheme, readStoredAccentId } from './themes/applyTheme'

// electron-store is the source of truth, but getSettings() resolves after
// first paint. Bootstrapping from the synchronous localStorage mirror keeps
// a non-default accent from flashing emerald on every launch.
applyTheme(readStoredAccentId())

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
```

`./themes/series.css` does not exist yet — Task 3 creates it. Create an empty
placeholder now so the dev server starts:

```bash
printf '/* populated in Task 3 */\n' > src/renderer/themes/series.css
```

- [ ] **Step 6: Verify the app still boots**

Run: `npm run build`
Expected: exit 0. Then `npm run dev` and confirm the window opens, the
titlebar renders, and nothing is invisible. Screens will look half-converted
— that is the shim doing its job. Close the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.css src/renderer/main.tsx src/renderer/themes/series.css tests/renderer/tokens.test.ts
git commit -m "feat(design): axi-design app layer, with a scheduled-deletion legacy shim

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Domain palettes and the token-reading bridge

**Files:**
- Create: `src/renderer/themes/series.css` (replacing the Task 2 placeholder)
- Create: `src/renderer/themes/readToken.ts`
- Modify: `src/shared/professionUtils.ts` (all 81 lines restructured)
- Test: `tests/renderer/series.test.ts`
- Test: `tests/shared/professionUtils.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `getProfessionColor(profession: string): string` — now returns
    `var(--axi-series-prof-<base>)`, unchanged signature
  - `getProfessionBase(profession: string): string` — unchanged
  - `readToken(name: string, fallback?: string): string`
  - CSS custom properties `--axi-series-prof-*` (10),
    `--axi-series-1`…`--axi-series-10`, `--axi-series-metric-*` (10)

- [ ] **Step 1: Write the failing professionUtils test**

Create `tests/shared/professionUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getProfessionBase, getProfessionColor } from '../../src/shared/professionUtils';

describe('getProfessionBase', () => {
    it('maps an elite spec to its base profession', () => {
        expect(getProfessionBase('Firebrand')).toBe('Guardian');
        expect(getProfessionBase('Harbinger')).toBe('Necromancer');
        expect(getProfessionBase('Galeshot')).toBe('Ranger');
    });

    it('passes a base profession through', () => {
        expect(getProfessionBase('Warrior')).toBe('Warrior');
    });

    it('returns Unknown for an empty name', () => {
        expect(getProfessionBase('')).toBe('Unknown');
    });
});

describe('getProfessionColor', () => {
    it('returns the base profession token, shared across its specs', () => {
        expect(getProfessionColor('Guardian')).toBe('var(--axi-series-prof-guardian)');
        expect(getProfessionColor('Firebrand')).toBe('var(--axi-series-prof-guardian)');
        expect(getProfessionColor('Willbender')).toBe('var(--axi-series-prof-guardian)');
        expect(getProfessionColor('Necromancer')).toBe('var(--axi-series-prof-necromancer)');
        expect(getProfessionColor('Scourge')).toBe('var(--axi-series-prof-necromancer)');
    });

    it('returns a token for every one of the ten bases', () => {
        const bases = ['Guardian', 'Revenant', 'Warrior', 'Engineer', 'Ranger',
            'Thief', 'Elementalist', 'Mesmer', 'Necromancer', 'Unknown'];
        for (const b of bases) {
            expect(getProfessionColor(b)).toBe(`var(--axi-series-prof-${b.toLowerCase()})`);
        }
    });

    // Review Focus 2: a future elite spec, or an empty string, must not
    // produce `var(--axi-series-prof-)`, which computes to nothing and
    // renders black.
    it('falls back to the Unknown token for an unrecognised profession', () => {
        expect(getProfessionColor('Necrodancer')).toBe('var(--axi-series-prof-unknown)');
        expect(getProfessionColor('')).toBe('var(--axi-series-prof-unknown)');
        expect(getProfessionColor(undefined as unknown as string)).toBe('var(--axi-series-prof-unknown)');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/shared/professionUtils.test.ts`
Expected: FAIL — `getProfessionColor('Guardian')` returns `'#72C1D9'`.

- [ ] **Step 3: Rewrite `professionUtils.ts`**

Replace the entire contents of `src/shared/professionUtils.ts` with:

```ts
// src/shared/professionUtils.ts
//
// The 51 profession/elite-spec names collapse onto ten base professions, so
// there are ten colours, not 51. Those colours are GW2 domain data - rule 10
// of the axi-design spec - and live as fixed tokens in
// src/renderer/themes/series.css; they are NOT recoloured by the accent.
// This module names the token; it never names the colour.

const PROFESSION_BASE: Record<string, string> = {
    Guardian: 'Guardian', Dragonhunter: 'Guardian', Firebrand: 'Guardian', Willbender: 'Guardian', Luminary: 'Guardian',
    Revenant: 'Revenant', Herald: 'Revenant', Renegade: 'Revenant', Vindicator: 'Revenant', Conduit: 'Revenant',
    Warrior: 'Warrior', Berserker: 'Warrior', Spellbreaker: 'Warrior', Bladesworn: 'Warrior', Paragon: 'Warrior',
    Engineer: 'Engineer', Scrapper: 'Engineer', Holosmith: 'Engineer', Mechanist: 'Engineer', Amalgam: 'Engineer',
    Ranger: 'Ranger', Druid: 'Ranger', Soulbeast: 'Ranger', Untamed: 'Ranger', Galeshot: 'Ranger',
    Thief: 'Thief', Daredevil: 'Thief', Deadeye: 'Thief', Specter: 'Thief', Antiquary: 'Thief',
    Elementalist: 'Elementalist', Tempest: 'Elementalist', Weaver: 'Elementalist', Catalyst: 'Elementalist', Evoker: 'Elementalist',
    Mesmer: 'Mesmer', Chronomancer: 'Mesmer', Mirage: 'Mesmer', Virtuoso: 'Mesmer', Troubadour: 'Mesmer',
    Necromancer: 'Necromancer', Reaper: 'Necromancer', Scourge: 'Necromancer', Harbinger: 'Necromancer', Ritualist: 'Necromancer',
    Unknown: 'Unknown',
};

// The ten bases that have a token in series.css. An unrecognised name - a
// future elite spec, an empty string - must land here rather than produce
// `var(--axi-series-prof-)`, which computes to nothing and renders black.
const TOKENED_BASES = new Set([
    'Guardian', 'Revenant', 'Warrior', 'Engineer', 'Ranger',
    'Thief', 'Elementalist', 'Mesmer', 'Necromancer', 'Unknown',
]);

export function getProfessionBase(profession: string): string {
    if (!profession) return 'Unknown';
    return PROFESSION_BASE[profession] ?? profession;
}

export function getProfessionColor(profession: string): string {
    const base = getProfessionBase(profession);
    const known = TOKENED_BASES.has(base) ? base : 'Unknown';
    return `var(--axi-series-prof-${known.toLowerCase()})`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- tests/shared/professionUtils.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Find and fix every `PROFESSION_COLORS` consumer**

`PROFESSION_COLORS` is deleted. Find its callers:

```bash
grep -rn "PROFESSION_COLORS" src tests
```

Every call site becomes `getProfessionColor(name)`. If a site passed the
result to an SVG `fill` or `stroke` **attribute**, move it to
`style={{ fill: getProfessionColor(name) }}` — SVG presentation attributes
do not parse `var()`.

- [ ] **Step 6: Write the failing series.css test**

Create `tests/renderer/series.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve('src/renderer/themes/series.css'), 'utf8');
const declares = (name: string) => new RegExp(`${name}\\s*:\\s*#[0-9a-f]{6}`, 'i').test(CSS);

describe('series.css declares every domain palette token', () => {
    it('declares the ten profession tokens', () => {
        for (const p of ['guardian', 'revenant', 'warrior', 'engineer', 'ranger',
            'thief', 'elementalist', 'mesmer', 'necromancer', 'unknown']) {
            expect(declares(`--axi-series-prof-${p}`), p).toBe(true);
        }
    });

    it('declares the ten-step categorical series ramp', () => {
        for (let i = 1; i <= 10; i++) {
            expect(declares(`--axi-series-${i}`), String(i)).toBe(true);
        }
    });

    it('declares a token for every timeline metric', () => {
        for (const k of ['health', 'damage-dealt', 'damage-taken', 'distance-to-tag',
            'incoming-healing', 'incoming-barrier', 'offensive-boons',
            'defensive-boons', 'hard-cc', 'soft-cc']) {
            expect(declares(`--axi-series-metric-${k}`), k).toBe(true);
        }
    });

    it('is the only app file that names a colour, and names no accent token', () => {
        // series.css holds domain data (rule 10). It must not reach into the
        // system's own palette, or the palettes would follow the accent.
        expect(CSS).not.toMatch(/var\(--axi-(accent|ok|warn|danger|meta)/);
    });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test:unit -- tests/renderer/series.test.ts`
Expected: FAIL — the placeholder declares nothing.

- [ ] **Step 8: Write `series.css`**

Replace `src/renderer/themes/series.css` with:

```css
/* Domain palettes — the one file in this app permitted colour literals.
   RULES.md rule 10: "a profession, a team, a map colour is domain data…
   it is the data's colour rather than the system's."

   These are FIXED. They are deliberately not recoloured by the accent: a
   Necromancer is green in Guild Wars 2 regardless of what the app's chrome
   is wearing. The accent drives chrome only — frame, legend, overlay
   panels, landmarks, selection highlight. */

:root {
    /* --- profession (GW2 official colours) --- */
    --axi-series-prof-guardian: #72C1D9;
    --axi-series-prof-revenant: #D16E5A;
    --axi-series-prof-warrior: #FFD166;
    --axi-series-prof-engineer: #D09C59;
    --axi-series-prof-ranger: #8CDC82;
    --axi-series-prof-thief: #C08F95;
    --axi-series-prof-elementalist: #F68A87;
    --axi-series-prof-mesmer: #B679D5;
    --axi-series-prof-necromancer: #52A76F;
    --axi-series-prof-unknown: #64748B;

    /* --- categorical ramp: distinguish N series in one chart --- */
    --axi-series-1: #a78bfa;
    --axi-series-2: #34d399;
    --axi-series-3: #f59e0b;
    --axi-series-4: #60a5fa;
    --axi-series-5: #f472b6;
    --axi-series-6: #fb923c;
    --axi-series-7: #4ade80;
    --axi-series-8: #e879f9;
    --axi-series-9: #38bdf8;
    --axi-series-10: #fbbf24;

    /* --- timeline metrics ---
       Deliberately NOT mapped onto --axi-ok/-warn/-danger even where it is
       tempting (health→ok, damage-dealt→danger). Rule 5: a filled status
       ink asserts state. Spending those three inks on chart series would
       make every chart read as an alarm. */
    --axi-series-metric-health: #10b981;
    --axi-series-metric-damage-dealt: #ef4444;
    --axi-series-metric-damage-taken: #f87171;
    --axi-series-metric-distance-to-tag: #f59e0b;
    --axi-series-metric-incoming-healing: #4ade80;
    --axi-series-metric-incoming-barrier: #a78bfa;
    --axi-series-metric-offensive-boons: #60a5fa;
    --axi-series-metric-defensive-boons: #38bdf8;
    --axi-series-metric-hard-cc: #f43f5e;
    --axi-series-metric-soft-cc: #c084fc;
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run test:unit -- tests/renderer/series.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 10: Write the failing readToken test**

Create `tests/renderer/readToken.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readToken } from '../../src/renderer/themes/readToken';

const stubComputed = (values: Record<string, string>) => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: (n: string) => values[n] ?? '',
    }));
};

afterEach(() => vi.unstubAllGlobals());

describe('readToken', () => {
    it('returns the computed value, trimmed', () => {
        stubComputed({ '--axi-accent': '  #34d399 ' });
        expect(readToken('--axi-accent')).toBe('#34d399');
    });

    // Review Focus 3: getPropertyValue returns '' for an undefined
    // property, and '' handed to a recharts `fill` renders black.
    it('returns the fallback for a token that does not exist', () => {
        stubComputed({});
        expect(readToken('--axi-typo', '#ff00ff')).toBe('#ff00ff');
    });

    it('returns currentColor when no fallback is given', () => {
        stubComputed({});
        expect(readToken('--axi-typo')).toBe('currentColor');
    });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm run test:unit -- tests/renderer/readToken.test.ts`
Expected: FAIL — cannot resolve `readToken`.

- [ ] **Step 12: Write `readToken.ts`**

Create `src/renderer/themes/readToken.ts`:

```ts
// Resolve a CSS custom property to a literal colour string.
//
// Needed only where a colour cannot be spelled as var(): SVG presentation
// ATTRIBUTES do not parse var() (`<svg fill="var(--x)">` renders black), and
// recharts forwards its `fill`/`stroke`/`tick` props straight to those
// attributes. Everywhere else - every style={{}} object, every CSS rule -
// use var() directly.
//
// Series tokens are accent-independent and may be read once at module scope.
// Chrome tokens (--axi-accent, --axi-text-faint, ...) change with the
// accent, so a component reading one must re-read when the accent changes.
export function readToken(name: string, fallback = 'currentColor'): string {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    return value || fallback;
}
```

- [ ] **Step 13: Run the full suite and typecheck**

Run: `npm run test:unit && npm run typecheck`
Expected: exit 0. If any existing test asserted a profession hex, update it
to the token — that assertion is now wrong by design.

- [ ] **Step 14: Commit**

```bash
git add src/renderer/themes src/shared/professionUtils.ts tests
git commit -m "feat(design): domain palettes as --axi-series tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## The Conversion Recipe

Tasks 4–11 each convert one screen. They all follow this recipe; each task
then lists the specifics that are only true of its own files. The recipe is
normative — where a task's specifics are silent, the recipe decides.

**R1 — Surfaces.** A raised box becomes `.axi-panel` if it is a panel-step
container, or an `ap-*` class composing `background: var(--axi-surface)`,
`border: var(--axi-border-control) solid var(--axi-ink-line)`, and
`box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line)`.
A recessed interior becomes `background: var(--axi-ground)`.

**R2 — Every `rounded*` utility and every `borderRadius` is deleted.** Not
re-pointed. Delete the class; delete the style property.

**R3 — Colour utilities become tokens.** `text-[#555]` →
`style={{ color: 'var(--axi-text-faint)' }}`. `text-gray-400` →
`var(--axi-text-dim)`. `hover:text-white` → `var(--axi-text)`.
`hover:text-red-400` → `var(--axi-danger)`. `text-amber-300` →
`var(--axi-warn)`. `text-emerald-*` → `var(--axi-accent)`.

**R4 — Gradients are deleted** (rule 1). A `linear-gradient` fill becomes a
flat `var(--axi-surface)` or `var(--axi-accent)`. A `valueGradient` on text
becomes a flat `color`.

**R5 — Accent-at-partial-opacity is deleted** (rule 2). `rgba(16,185,129,0.1)`
and every sibling becomes one of two things, per rule 5:
- **status or selected** → solid `background: var(--axi-accent)` with
  `color: var(--axi-accent-ink)`
- **annotation** → `background: transparent` with
  `border: var(--axi-border-control) solid var(--axi-accent)`

The same applies to `rgba(255,255,255,0.08)`-style neutral tints: a hover
tint is deleted outright (R7), a resting tint becomes
`var(--axi-surface-raised)`.

**R6 — Blurred and inset shadows are deleted.** `boxShadow: '0 1px 4px
rgba(0,0,0,0.25)'` becomes the hard block from R1, or nothing.
`inset 0 1px 0 rgba(255,255,255,...)` sheen is deleted with no replacement.

**R7 — Hover is a lift, and only on interactive elements.** An interactive
element gains, in an `ap-*` class:

```css
.ap-thing {
    transition: transform var(--ap-duration-fast) ease, box-shadow var(--ap-duration-fast) ease;
}
.ap-thing:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}
```

An element already resting on a 3px block grows it to
`var(--axi-offset-control-hover)`. A panel-step element resting on
`var(--axi-offset-panel)` uses `translate(-3px, -3px)` and grows to
`var(--axi-offset-panel-hover)`. `hover:opacity-*`, `hover:brightness-*` and
`transition-opacity` are deleted. **A non-interactive element gets no
`:hover` rule at all.**

**R8 — Status asserts with a solid fill, a 5px top cap, or a bordered dot.**
Never a tint, never a stripe, never a glow. The cap:

```css
.ap-card--running::before {
    content: '';
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: 5px;
    background: var(--axi-ok);
}
```

**R9 — Typography uses the type tokens.** A hand-rolled
`fontSize`/`fontWeight`/`letterSpacing` triple becomes
`font: var(--axi-t-label)` (or `-micro`, `-small`, `-body`, `-h3`, `-h2`,
`-h1`, `-display`) with the matching `letter-spacing: var(--axi-ls-*)`. An
uppercase tracked micro-label becomes the package's `.axi-eyebrow`. No
`fontFamily`, ever.

**R10 — SVG presentation attributes cannot hold `var()`.** `<svg fill={c}>`
becomes `<svg style={{ fill: c }}>`. recharts props that reach an attribute
(`fill`, `stroke`, `tick={{ fill }}`) take `readToken(...)` instead.

**R11 — Remove the shim rows this screen was the last consumer of.** After
converting, grep for each shim row still in `index.css`:

```bash
for v in bg-base bg-elevated bg-card bg-card-inner bg-input border-subtle \
  border-default border-hover text-primary text-secondary text-muted \
  text-inverse brand-primary brand-secondary shadow-card shadow-button \
  shadow-dropdown radius-sm radius-md radius-lg status-success status-error \
  status-warning ease-out-expo duration-fast duration-normal duration-slow; do
  n=$(grep -ro "var(--$v)" src/renderer | grep -v 'index.css' | wc -l)
  [ "$n" = "0" ] && echo "SHIM ROW DEAD: --$v"
done
```

Delete every row reported dead.

**R12 — Verify.** Every screen task ends with these three greps, whose counts
must have dropped and must be zero for the files that task touched:

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}\b\|rgba\?(\|hsla\?(" src/renderer --include=*.tsx --include=*.css | grep -v 'themes/series.css'
grep -rn "rounded" src/renderer
grep -rnE "\b(text|bg|border|from|to|via|ring|divide|fill|stroke|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-[0-9]{2,3})?\b" src/renderer
```

Starting counts for the whole renderer: **333** colour literals, **118**
`rounded*` utilities, **40** named-palette utilities, **60** arbitrary-value
colour utilities. All four must be zero when Task 12 lands (literals except
`series.css`).

---

### Task 4: Shell — titlebar, nav, layout

**Files:**
- Modify: `src/renderer/app/AppLayout.tsx` (2 literals, 5 `rounded`, the Cinzel span, both `heartbeat-pulse` sites)
- Modify: `src/renderer/app/SubviewCapsule.tsx` (9 literals, 3 `rounded`)
- Modify: `src/renderer/app/Toast.tsx` (1 `rounded`)
- Create: `src/renderer/components/Tooltip.tsx`

**Interfaces:**
- Consumes: the `ap-` vocabulary and `.ap-work` from Task 2.
- Produces: `Tooltip` — `default export`, props
  `{ text: string; children: React.ReactElement; delay?: number; position?: 'top' | 'bottom' | 'right' }`.
  Tasks 9, 10 and 11 replace their hand-rolled tooltips with it.

- [ ] **Step 1: Create the portaled Tooltip**

Create `src/renderer/components/Tooltip.tsx`:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    text: string;
    children: React.ReactElement;
    delay?: number;
    position?: 'top' | 'bottom' | 'right';
}

export default function Tooltip({ text, children, delay = 400, position = 'top' }: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const timerRef = useRef<number | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const show = () => {
        timerRef.current = window.setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                if (position === 'right') {
                    setCoords({ x: rect.right, y: rect.top + rect.height / 2 });
                } else {
                    setCoords({
                        x: rect.left + rect.width / 2,
                        y: position === 'top' ? rect.top : rect.bottom,
                    });
                }
            }
            setVisible(true);
        }, delay);
    };

    const hide = () => {
        if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setVisible(false);
    };

    useEffect(() => () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
    }, []);

    if (!text) return children;

    return (
        <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onMouseDown={hide} className="inline-flex">
            {React.cloneElement(children, { title: undefined })}
            {/* .axi-tooltip draws the box; the portal to body is its contract:
                a hovered card is transformed (lift), and a transformed ancestor
                would re-anchor position:fixed to itself. */}
            {visible && createPortal(
                <div
                    className="axi-tooltip"
                    style={{
                        left: position === 'right' ? coords.x + 8 : coords.x,
                        top: position === 'right' ? coords.y : (position === 'top' ? coords.y - 6 : coords.y + 6),
                        transform: position === 'right'
                            ? 'translate(0, -50%)'
                            : position === 'top'
                                ? 'translate(-50%, -100%)'
                                : 'translate(-50%, 0)',
                    }}
                >
                    {text}
                </div>,
                document.body,
            )}
        </div>
    );
}
```

- [ ] **Step 2: Convert the titlebar in `AppLayout.tsx`**

Specifics, all confirmed present in the file:

- `:118` — delete the whole `style={{ fontFamily: '"Cinzel", serif', … }}`
  attribute. The brand wordmark becomes
  `<span className="axi-brand">`, which the package styles.
- `:119` — `color: '#ffffff'` → `color: 'var(--axi-text)'`.
- `:139` and `:236` — `className="… heartbeat-pulse"` → `"… ap-work"`;
  `color: 'var(--brand-primary)'` → `'var(--axi-accent)'`.
- `:149-150` — the update chip: delete `rounded-[4px]` and
  `hover:brightness-110`; replace the whole `style` with the package class
  `axi-chip axi-chip--accent` and drop the inline colours. The
  `rgba(16,185,129,0.1)` background is a rule-2 violation with no
  replacement (R5, annotation branch — the chip's own border carries it).
- `:163` and `:176` — delete `rounded-[4px]`; both become `axi-chip`.
  `:176` additionally drops `hover:border-[color:var(--border-hover)]`
  (R7: hover does not change a border).
- `:190`, `:193`, `:196` — the three window controls: wrap in
  `<div className="axi-titlebar__btns">` so the package's grid-centring rule
  from Task 2 applies; `text-gray-400` → `style={{ color: 'var(--axi-text-dim)' }}`,
  `hover:text-white` → an `ap-titlebar-btn:hover { color: var(--axi-text) }`
  rule, `hover:text-red-400` → `var(--axi-danger)` on the close button only.
- `:226` — `text-amber-300 hover:text-amber-200` → `var(--axi-warn)`, and the
  hover stays only because this span has an `onClick`.
- The outer shell gains `className="axi-window"`, and the titlebar strip
  becomes `className="axi-titlebar draggable"` with interactive children
  marked `no-drag`.

- [ ] **Step 3: Convert `SubviewCapsule.tsx`**

The capsule is a segmented control. Every one of its nine literals violates a
rule, so the whole visual is rebuilt rather than translated:

- `:18` — delete `rounded-[9px]`.
- `:20-22` — `background: '#0a0a16'` → `var(--axi-ground)`;
  `border: '1px solid rgba(255,255,255,0.024)'` →
  `border: var(--axi-border-control) solid var(--axi-ink-line)`;
  delete the entire `boxShadow` (blur plus inset sheen, R6).
- `:31-32` — delete `rounded-[6px]` and `transition-colors`;
  `text-[#555]` → `var(--axi-text-faint)`; the inactive hover keeps its
  `:hover` only because the segment is clickable, and becomes
  `color: var(--axi-text-dim)`.
- `:42-45` — the active-segment overlay: delete `rounded-[6px]`, delete both
  the `linear-gradient` (R4) and the glow `boxShadow` (R6). The active
  segment becomes a solid fill — `background: var(--axi-accent)` with
  `color: var(--axi-accent-ink)` — which is R5's status branch and reads at a
  glance in a way the 13%-opacity gradient did not.

Add the classes to `index.css` as `.ap-capsule`, `.ap-capsule-seg`,
`.ap-capsule-seg--active`.

- [ ] **Step 4: Convert `Toast.tsx`**

`:18` — delete `rounded-md`. Replace the `border` utility with
`.axi-notice`, the package's own notice shape.

- [ ] **Step 5: Verify**

Run the three greps from R12. Expected: zero hits in `app/AppLayout.tsx`,
`app/SubviewCapsule.tsx`, `app/Toast.tsx`, `components/Tooltip.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0.

Run `npm run dev` and confirm: the titlebar drags, the three window controls
work, the wordmark renders in `--axi-sans`, the watching indicator blinks,
and the subview capsule's active segment is a solid accent block. Close the
dev server.

- [ ] **Step 6: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert the shell to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Settings, and the accent picker

**Files:**
- Modify: `src/renderer/views/SettingsView.tsx` (5 literals, 10 `rounded`, one Rajdhani inline style)
- Modify: `src/main/index.ts:144-162` (both settings IPC handler shapes)
- Test: `tests/main/settingsAccent.test.ts`

**Interfaces:**
- Consumes: `ACCENTS`, `DEFAULT_ACCENT_ID`, `resolveAccentId` (Task 1);
  `applyTheme` (Task 1).
- Produces: `get-settings` now returns
  `{ logDirectory: string; devMinFileSize: number; accentId: string }`;
  `save-settings` now accepts
  `{ logDirectory?: string; devMinFileSize?: number; accentId?: string }`.

- [ ] **Step 1: Write the failing test for accent persistence**

Create `tests/main/settingsAccent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveAccentId, DEFAULT_ACCENT_ID } from '../../src/renderer/themes/accents';

// The main process persists whatever it is handed. Review Focus 5: a
// persisted id that is no longer an official accent must not leave the app
// with data-axi-accent set to a dead id, and therefore no accent at all.
describe('the persisted accent id', () => {
    const readFromStore = (raw: unknown) => resolveAccentId(raw);

    it('survives a round trip for every official accent', () => {
        expect(readFromStore('violet-purple')).toBe('violet-purple');
    });

    it('degrades to the default when the stored id is no longer official', () => {
        expect(readFromStore('retired-accent')).toBe(DEFAULT_ACCENT_ID);
    });

    it('degrades to the default when the store holds a non-string', () => {
        expect(readFromStore(0)).toBe(DEFAULT_ACCENT_ID);
        expect(readFromStore(null)).toBe(DEFAULT_ACCENT_ID);
    });
});
```

- [ ] **Step 2: Run the test to verify it passes already, then make it meaningful**

Run: `npm run test:unit -- tests/main/settingsAccent.test.ts`
Expected: PASS — `resolveAccentId` already handles this from Task 1. This
test is a regression pin on Review Focus 5, not a driver. Its value is that
it fails if someone later "simplifies" `resolveAccentId` to a bare
`?? DEFAULT`. Keep it.

- [ ] **Step 3: Add `accentId` to the main-process handlers**

In `src/main/index.ts`, the `get-settings` handler currently returns two
fields. Add the third:

```ts
    ipcMain.handle('get-settings', () => {
        return {
            logDirectory: store.get('logDirectory', '') as string,
            devMinFileSize: store.get('devMinFileSize', 0) as number,
            accentId: store.get('accentId', 'emerald-mint') as string,
        };
    });
```

and in `save-settings`:

```ts
        if (settings.accentId !== undefined) {
            store.set('accentId', settings.accentId);
        }
```

widening the parameter type to
`{ logDirectory?: string; devMinFileSize?: number; accentId?: string }`.

The default is spelled literally here rather than imported: `src/main/` is a
separate TypeScript project that does not include `src/renderer/`, so
importing `DEFAULT_ACCENT_ID` across that boundary would not compile. The
renderer re-resolves the value through `resolveAccentId` regardless, so a
drift between the two spellings degrades to the renderer's default rather
than to a broken accent.

- [ ] **Step 4: Apply the accent on settings load**

In `src/renderer/app/AppLayout.tsx`, the existing `getSettings().then(...)`
at line 40 gains one line:

```ts
            applyTheme(settings.accentId);
```

This is the authoritative apply; the `main.tsx` bootstrap from
`localStorage` was only there to avoid the flash.

- [ ] **Step 5: Add the accent row to `SettingsView.tsx`**

A row of 11 square swatches. The selected one is filled and blocked (R8);
the rest are outlined only (R5's annotation branch):

```tsx
<div className="flex flex-wrap gap-2">
    {ACCENTS.map((a) => (
        <button
            key={a.id}
            type="button"
            title={a.label}
            aria-label={a.label}
            aria-pressed={a.id === accentId}
            className={`ap-swatch${a.id === accentId ? ' ap-swatch--active' : ''}`}
            style={{ background: a.hex }}
            onClick={() => {
                setAccentId(applyTheme(a.id));
                window.electronAPI?.saveSettings({ accentId: a.id });
            }}
        />
    ))}
</div>
```

`a.hex` is the one sanctioned inline colour in the renderer. A colour picker
must show the colour it selects, which no token can express — the whole point
of the row is that eleven different accents look different before one is
chosen. It is not a literal: the value is read from the package's own
`accents.json`, so it cannot drift from what the accent actually is. Task 12's
colour-literal guard exempts lines matching `a.hex` for exactly this reason,
and that is the only exemption it grants.

Add to `index.css`:

```css
.ap-swatch {
    width: 26px;
    height: 26px;
    border: var(--axi-border-control) solid var(--axi-ink-line);
    cursor: pointer;
    transition: transform var(--ap-duration-fast) ease, box-shadow var(--ap-duration-fast) ease;
}
.ap-swatch:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}
.ap-swatch--active {
    box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}
.ap-swatch--active:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--axi-offset-control-hover) var(--axi-offset-control-hover) 0 var(--axi-ink-line);
}
```

- [ ] **Step 6: Convert the rest of `SettingsView.tsx`**

- `:11` — delete `rounded-lg`; the card becomes `.axi-panel`, and its inline
  `background`/`border` go with it.
- `:13` and `:209` — the 2px×14px accent tick: delete `rounded-full`. `:13`
  keeps `background: var(--axi-accent)`; `:209`'s `#fbbf24` →
  `var(--axi-warn)`.
- `:33` — the danger button variant: `rgba(248,113,113,0.2)` →
  `border: var(--axi-border-control) solid var(--axi-danger)` (R5,
  annotation), `color: var(--status-error)` → `var(--axi-danger)`.
- `:188` and `:195` — delete `rounded-full` and
  `transition-opacity hover:opacity-80`; both become `axi-btn`, gaining the
  package's lift (R7).
- `:205-206` — delete `rounded-lg`; `rgba(251,191,36,0.25)` →
  `border: var(--axi-border-control) solid var(--axi-warn)`.
- `:210` — delete the `fontFamily: 'Rajdhani, sans-serif'` inline style
  entirely; this is an uppercase tracked micro-label, so it becomes
  `className="axi-eyebrow"` and the `fontSize`/`fontWeight`/`letterSpacing`/
  `textTransform` properties all go with it (R9). `color: '#fbbf24'` →
  `var(--axi-warn)`.
- `:230` — `#fcd34d` → `var(--axi-warn)`.
- Any remaining `rounded-*` in the file: delete (R2). The file has 10.
- Every `<input>` becomes `.axi-input`; every toggle becomes `.axi-switch`.

- [ ] **Step 7: Verify**

Run the three greps from R12. Expected: zero hits in
`views/SettingsView.tsx` except the single `a.hex` swatch background, and
zero in `src/main/index.ts`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0.

Run `npm run dev`, open Settings, click through several accents. Confirm each
applies immediately with the crossfade, the selected swatch is the blocked
one, and the choice survives a full app restart with no emerald flash on
launch.

- [ ] **Step 8: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer src/main tests
git commit -m "feat(settings): accent picker, persisted via electron-store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: History

**Files:**
- Modify: `src/renderer/views/HistoryView.tsx` (0 literals, 2 legacy vars)
- Modify: `src/renderer/views/history/HistoryEntry.tsx` (1 literal, 2 `rounded`)

**Interfaces:**
- Consumes: the `ap-` vocabulary from Task 2.
- Produces: nothing later tasks depend on.

A history entry is a short list of things you act on, so rule 8's
counterpart applies — it stays a card, not a table row.

- [ ] **Step 1: Convert `HistoryEntry.tsx`**

- `:14` — delete `rounded` and `transition-colors`; add `ap-history-entry`.
- `:18` — the three-way background. `var(--accent-bg)` and
  `rgba(16, 185, 129, 0.06)` are both rule-2 violations and are deliberately
  absent from the shim, so this line is currently rendering wrong and must
  change shape (R5):
  - `isActive` (selected) → `background: var(--axi-accent)` plus
    `color: var(--axi-accent-ink)` — the status branch
  - `isCurrent` (annotation) → `background: var(--axi-surface)` plus
    `border-color: var(--axi-accent)` — the annotation branch
  - neither → `background: var(--axi-surface)`
- `:27` — delete `rounded`; the badge becomes `axi-chip`.

Add to `index.css`:

```css
.ap-history-entry {
    background: var(--axi-surface);
    border: var(--axi-border-control) solid var(--axi-ink-line);
    transition: transform var(--ap-duration-fast) ease, box-shadow var(--ap-duration-fast) ease;
}
.ap-history-entry:hover {
    transform: translate(-2px, -2px);
    box-shadow: var(--axi-offset-control) var(--axi-offset-control) 0 var(--axi-ink-line);
}
```

The `:hover` is permitted here: the entry is a `<button>` that loads a
session.

- [ ] **Step 2: Convert `HistoryView.tsx`**

Its two `var(--bg-*)` references become `var(--axi-ground)` /
`var(--axi-surface)` per the Task 2 mapping table. No literals, no `rounded`.

- [ ] **Step 3: Verify**

Run the three greps from R12. Expected: zero hits in `views/HistoryView.tsx`
and `views/history/HistoryEntry.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0.

Run `npm run dev`, open History, confirm the selected entry is a solid accent
block, the current-session entry is accent-outlined, and both are
distinguishable from each other and from a resting entry.

- [ ] **Step 4: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert History to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The two modals

**Files:**
- Modify: `src/renderer/WhatsNewModal.tsx` (1 literal, 4 `rounded`, the second Cinzel site)
- Modify: `src/renderer/views/TroubleshootModal.tsx` (1 literal, 6 `rounded`)

**Interfaces:**
- Consumes: the `ap-` vocabulary from Task 2.
- Produces: nothing later tasks depend on.

Both modals use the package's `.axi-scrim` for the backdrop and `.axi-panel`
for the dialog. AxiAM's `src/components/SettingsModal.tsx` is the reference
for the dialog, switch and confirm patterns.

- [ ] **Step 1: Convert `WhatsNewModal.tsx`**

- `:28` — `background: 'rgba(0,0,0,0.55)'` → replace the whole element with
  `className="axi-scrim"`, which composes `var(--axi-scrim)`.
- `:36` — delete `rounded-lg` and `shadow-2xl`; the dialog becomes
  `className="axi-panel relative w-full max-w-3xl flex flex-col"`. `shadow-2xl`
  is a blurred Tailwind shadow (R6); `.axi-panel` supplies the hard block.
- `:47` — delete the `fontFamily: 'Cinzel, serif'` and the `fontSize`
  override; the heading becomes `className="axi-brand"` with
  `color: var(--axi-accent)` kept (the package's own brand class may already
  supply it — check and drop the inline if so).
- `:78` — delete `rounded-md` and `transition-colors`; becomes `axi-btn`.
- `:120` — delete `rounded`; inline code becomes
  `background: var(--axi-ground)` with
  `border: var(--axi-border-hairline) solid var(--axi-ink-line)`. The
  hairline weight is correct here and only here: this is prose rule weight
  inside markdown content.
- `:126` — delete `rounded`; the `<pre>` becomes
  `background: var(--axi-ground)` with
  `border: var(--axi-border-control) solid var(--axi-ink-line)`.

- [ ] **Step 2: Convert `TroubleshootModal.tsx`**

- `:33` — delete `rounded-full`; the empty-state indicator becomes a square
  dot, `border: var(--axi-border-control) solid var(--axi-ink-line)` (R8's
  bordered-dot form).
- `:160` — `background: 'rgba(0,0,0,0.7)'` → `className="axi-scrim"`.
- `:161` — delete `rounded-xl` and `shadow-2xl`; becomes `axi-panel`, and its
  inline `background`/`border` go with it.
- `:166` — delete `rounded-full`; the accent tick keeps
  `background: var(--axi-accent)`.
- `:201` — delete `rounded`; `var(--bg-card)` → `var(--axi-ground)` (this is
  a recessed note inside a panel, so it reads as ground showing through),
  `var(--text-secondary)` → `var(--axi-text-dim)`.
- `:226` and `:234` — delete `rounded` and
  `transition-opacity hover:opacity-80` (R7); both become `axi-btn`.
- Add `.ap-status-dot` for the three check states, per R8:

```css
.ap-status-dot {
    width: 13px;
    height: 13px;
    flex: none;
    border: var(--axi-border-hairline) solid var(--axi-ink-line);
}
.ap-status-dot--ok { background: var(--axi-ok); }
.ap-status-dot--warn { background: var(--axi-warn); }
.ap-status-dot--danger { background: var(--axi-danger); }
.ap-status-dot--idle { background: var(--axi-surface-raised); }
```

- [ ] **Step 3: Verify**

Run the three greps from R12. Expected: zero hits in `WhatsNewModal.tsx` and
`views/TroubleshootModal.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0.

Run `npm run dev`. Open the What's New modal (it shows when
`lastSeenVersion` differs; force it from Settings or clear the key) and the
Troubleshoot modal. Confirm both sit on a flat scrim with a hard-blocked
panel, and that the troubleshoot checks read ok/warn/danger at a glance.

- [ ] **Step 4: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert both modals to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Pulse subviews and the stat primitives

**Files:**
- Modify: `src/renderer/views/StatCard.tsx` (1 `rounded`, 6 legacy vars)
- Modify: `src/renderer/views/pulse/OverviewSubview.tsx` (16 literals, 3 `rounded`)
- Modify: `src/renderer/views/pulse/DamageSubview.tsx` (6 literals, 5 `rounded`)
- Modify: `src/renderer/views/pulse/DefenseSubview.tsx` (8 literals, 9 `rounded`)
- Modify: `src/renderer/views/pulse/BoonsSubview.tsx` (15 literals, 3 `rounded`)
- Modify: `src/renderer/views/pulse/SupportSubview.tsx` (10 literals, 5 `rounded`)
- Modify: `src/renderer/views/pulse/FightCompositionCard.tsx` (18 literals, 8 `rounded`)
- Modify: `src/renderer/views/PulseView.tsx` (3 legacy vars)

**Interfaces:**
- Consumes: `getProfessionColor` (Task 3), the `ap-` vocabulary (Task 2).
- Produces: `.ap-meter` / `.ap-meter-fill`, the stat-bar shape the timeline
  inspector panels in Task 10 also use.

- [ ] **Step 1: Convert `StatCard.tsx` first**

Every subview renders through it, so it sets the vocabulary.

- `:25` — delete `rounded-md`. The card becomes `.axi-card`.
- Its `accentColor` prop is now a token string. Callers pass
  `var(--axi-series-*)` or `var(--axi-ok)`; the prop type stays `string`.
- The stat value keeps `className="font-stat"`, which is now
  `font-variant-numeric: tabular-nums` rather than Rajdhani.

Add the meter shape to `index.css` (rule 9: a quantity is length):

```css
.ap-meter {
    height: 6px;
    background: var(--axi-ground);
    border: var(--axi-border-hairline) solid var(--axi-ink-line);
    overflow: hidden;
}
.ap-meter-fill {
    height: 100%;
    background: var(--axi-accent);
}
```

`.ap-meter-fill` takes its colour from an inline
`style={{ background: <token> }}` where a series or status ink is wanted.

- [ ] **Step 2: Convert `OverviewSubview.tsx`**

- `:46` — `accentColor="#a78bfa"` → `"var(--axi-series-6)"`.
- `:107` — `accentColor="var(--status-warning, #f59e0b)"` →
  `"var(--axi-warn)"`. Drop the fallback: `--axi-warn` is always defined by
  the package.
- `:119-128` — the two hero tiles. Delete both `gradient` and `valueGradient`
  (R4) and both `rgba(...)` borders (R5). Each tile becomes
  `background: var(--axi-surface)` with
  `border: var(--axi-border-panel) solid var(--axi-ink-line)`; `label` keeps
  a flat colour — `var(--axi-accent)` for the first tile,
  `var(--axi-danger)` for the damage tile; `valueGradient` becomes a flat
  `color` of the same token. Because `.gradient-text` is deleted, any
  `className="gradient-text"` on these values must go too.
- `:218` — the medal ramp `['#fbbf24', '#94a3b8', '#cd7f32', …]`. Gold,
  silver and bronze are domain-ish but they are rank *chrome*, not data, and
  there is no medal palette in `series.css`. Map them onto
  `['var(--axi-warn)', 'var(--axi-text-dim)', 'var(--axi-series-metric-distance-to-tag)', 'var(--axi-text-faint)', 'var(--axi-text-faint)']`
  — gold reads as warn, silver as dim text, bronze as the amber metric ink.
  `var(--text-muted)` → `var(--axi-text-faint)`.
- Delete all 3 `rounded-*`.
- `:156`, `:170`, `:222` keep `className="font-stat"` unchanged.

- [ ] **Step 3: Convert `FightCompositionCard.tsx`**

This file has no legacy `var()` at all — every colour is a literal, so all 18
must be resolved:

- `:7` — `SEGMENT_COLORS = ['#ef4444', '#f97316', '#dc2626']` → these are
  three shades of one hue used to segment a bar. Replace with three distinct
  series tokens:
  `['var(--axi-series-metric-damage-dealt)', 'var(--axi-series-6)', 'var(--axi-series-metric-hard-cc)']`.
- `:18-19` — the role tints. `bg` at 4% and `border` at 20% are both rule-2
  violations. Each role becomes
  `{ bg: 'transparent', border: 'var(--axi-ok)' | 'var(--axi-danger)', label: 'var(--axi-ok)' | 'var(--axi-danger)' }`
  — the annotation branch of R5, with the border carrying the role.
- `:31-32` — `color: '#10b981'` (squad) → `var(--axi-accent)`;
  `color: '#06b6d4'` (allies) → `var(--axi-meta)`. Allies are a meta
  distinction, which is exactly what rule 6 reserves `--axi-meta` for.
- `:88` — `rgba(255,255,255,0.08)` active tint → the active group becomes
  `background: var(--axi-accent)` with `color: var(--axi-accent-ink)`;
  inactive is `transparent`.
- `:93`, `:121` — `#e2e8f0` → `var(--axi-text)`.
- `:94` — `#64748b` → `var(--axi-text-dim)`.
- `:95` — `#374151` → `var(--axi-text-faint)`.
- `:104` — `borderTop: '1px solid #1a2535'` →
  `borderTop: 'var(--axi-border-control) solid var(--axi-ink-line)'`.
- `:114` — `background: '#0f1520'` → `var(--axi-ground)`; and
  ``border: `1px solid ${getProfessionColor(spec)}40` `` is doubly broken —
  it appends a hex alpha suffix to what is now a `var()` string, producing
  invalid CSS, and 25% opacity is a rule-2 violation regardless. Becomes
  ``border: `var(--axi-border-control) solid ${getProfessionColor(spec)}` ``
  at full strength.
- Delete all 8 `rounded-*`.

- [ ] **Step 4: Convert `DamageSubview.tsx`, `DefenseSubview.tsx`, `BoonsSubview.tsx`, `SupportSubview.tsx`**

Work file by file. For each, list its literals and resolve each one by the
recipe:

```bash
grep -n "#[0-9a-fA-F]\{3,8\}\b\|rgba\?(\|rounded" src/renderer/views/pulse/DamageSubview.tsx
```

The four files share one shape — a stat grid over `StatCard` plus a bar list
— so the decisions are the same in each:

- A metric's colour is a `--axi-series-metric-*` token (Task 3 declares one
  per timeline metric, and the Pulse metrics are the same set).
- A good/bad threshold colour is `--axi-ok` / `--axi-warn` / `--axi-danger`.
- A bar becomes `.ap-meter` / `.ap-meter-fill` with
  `className="stat-bar-fill"` retained for the entry animation.
- Every `rounded-*` is deleted.
- The existing `animationDelay: ${0.1 + i * 0.05}s` stagger at
  `DamageSubview.tsx:119`, `SupportSubview.tsx:136`, `BoonsSubview.tsx:72`
  and `DefenseSubview.tsx:100` stays exactly as-is — it drives
  `.stat-bar-fill`, which the reduced-motion block already disables.

- [ ] **Step 5: Convert `PulseView.tsx`**

Three legacy `var()` references, no literals, no `rounded`. Re-point per the
Task 2 mapping table.

- [ ] **Step 6: Verify**

Run the three greps from R12. Expected: zero hits in `views/StatCard.tsx`,
`views/PulseView.tsx` and all six `views/pulse/*.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0.

Run `npm run dev`, load a fight, and walk all five Pulse subviews. Confirm
every stat card is a flat outlined block, every bar still animates in from
zero width, the fight-composition role groups are distinguishable by their
outline, and no value renders black (a black value means a token name is
misspelled — `var()` on an undefined property computes to nothing).

- [ ] **Step 7: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert the Pulse subviews to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `BoonPerformanceChart` — the recharts screen

**Files:**
- Modify: `src/renderer/views/pulse/BoonPerformanceChart.tsx` (24 literals, 4 `rounded`, 21 named-palette utilities)

**Interfaces:**
- Consumes: `readToken` (Task 3), `Tooltip` (Task 4), the
  `--axi-series-1`…`-10` ramp (Task 3).
- Produces: the `readToken`-plus-accent-dependency pattern that is unique to
  this file.

This is the only file in the app that must resolve tokens to strings, because
recharts forwards `fill`, `stroke` and `tick` to SVG *attributes*, which do
not parse `var()`.

- [ ] **Step 1: Replace the hard-coded series array**

`:11-12` currently holds ten hex values. Replace with a read of the ramp.
Series tokens are accent-independent (Task 3), so once per module is correct:

```ts
const SERIES = Array.from({ length: 10 }, (_, i) => readToken(`--axi-series-${i + 1}`));
```

Reading at module scope requires the stylesheet to have been applied, which
it has: `series.css` is imported in `main.tsx` before `createRoot`.

- [ ] **Step 2: Replace `FALLBACK_SELF_COLOR`**

`:15` — `const FALLBACK_SELF_COLOR = '#10b981'` is the retiring brand
emerald, and the self series is the one thing on the chart that is *the
app's own* rather than domain data. It becomes accent-derived, and therefore
must re-read on accent change:

```ts
const selfColor = useMemo(() => readToken('--axi-accent'), [accentId]);
```

where `accentId` comes from the store. Without that dependency the chart
keeps the old accent's colour until it remounts.

- [ ] **Step 3: Replace the axis tick fills**

`:168`, `:170`, `:176` — `tick={{ fontSize: 10, fill: '#64748b' }}` →
`tick={{ fontSize: 10, fill: tickColor }}` where

```ts
const tickColor = useMemo(() => readToken('--axi-text-faint'), [accentId]);
```

`--axi-text-faint` is a surface-layer token and does not itself change with
the accent, but reading it under the same dependency costs nothing and keeps
one rule for every chrome token in the file.

- [ ] **Step 4: Replace the two icon colour props**

- `:229` — `<Skull … color="#ffffff" />` → `color={readToken('--axi-text')}`
- `:230` — `<MapPin … color="#fbbf24" />` → `color={readToken('--axi-warn')}`

Both are `lucide-react`, which sets `stroke` as an attribute, so a `var()`
string would not work here.

- [ ] **Step 5: Replace the 21 named-palette utilities and the 4 `rounded`**

```bash
grep -nE "\b(text|bg|border)-(slate|gray|red|amber|emerald|cyan|violet)(-[0-9]{2,3})?\b|rounded" src/renderer/views/pulse/BoonPerformanceChart.tsx
```

Each becomes an inline `style` with the token R3 specifies. Delete all four
`rounded-*`.

- [ ] **Step 6: Route the chart tooltip through the portaled component**

The file currently hand-rolls a tooltip. Replace it with `Tooltip` from
Task 4 where the tooltip is a hover-on-element affordance. recharts' own
`<Tooltip>` component (its custom `content` renderer) stays recharts' —
restyle its container with `.axi-tooltip` rather than replacing it, because
recharts positions it from chart coordinates, not from a DOM rect.

- [ ] **Step 7: Verify**

Run the three greps from R12. Expected: zero hits in
`views/pulse/BoonPerformanceChart.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0.

Run `npm run dev`, load a fight, open the boon performance chart. Confirm all
ten series are visually distinct, the axis labels are legible, and — the
thing this task's `useMemo` dependencies exist for — **switch the accent in
Settings and come back**: the self series and the axis ticks must have
followed the new accent without a reload. If they did not, the `accentId`
dependency is missing.

- [ ] **Step 8: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert BoonPerformanceChart to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Timeline — lanes, swimlanes, inspector

**Files:**
- Modify: `src/renderer/views/timeline/TimelinePresets.ts` (the 10-entry metric palette)
- Modify: `src/renderer/views/timeline/TimelineSwimlanes.tsx` (25 literals, 2 `rounded`)
- Modify: `src/renderer/views/timeline/TimelineBoonLane.tsx` (18 literals, 3 `rounded`)
- Modify: `src/renderer/views/timeline/TimelineHealthLane.tsx` (9 literals, 2 `rounded`)
- Modify: `src/renderer/views/timeline/TimelineLane.tsx` (5 literals, 2 `rounded`)
- Modify: `src/renderer/views/timeline/TimelineEventMarkers.tsx` (2 literals)
- Modify: `src/renderer/views/timeline/TimelineInspector.tsx` (3 literals)
- Modify: `src/renderer/views/timeline/TimelinePresetBar.tsx` (1 `rounded`)
- Modify: `src/renderer/views/timeline/inspector/PositionPanel.tsx` (19 literals, 5 `rounded`)
- Modify: `src/renderer/views/timeline/inspector/TopHitsPanel.tsx` (11 literals, 4 `rounded`)
- Modify: `src/renderer/views/timeline/inspector/HealthPanel.tsx` (10 literals, 1 `rounded`)
- Modify: `src/renderer/views/timeline/inspector/BoonStatePanel.tsx` (9 literals, 2 `rounded`)
- Modify: `src/renderer/views/TimelineView.tsx` (2 legacy vars)

**Interfaces:**
- Consumes: `--axi-series-metric-*` (Task 3), `.ap-meter` (Task 8),
  `Tooltip` (Task 4).
- Produces: nothing later tasks depend on.

`TimelinePresets.ts` is the root of most of this task: its ten `color` values
are duplicated as literals across `TimelineSwimlanes.tsx`, so converting the
presets and then making the swimlanes read from them removes the duplication
as a side effect.

- [ ] **Step 1: Convert `TimelinePresets.ts`**

Its ten entries currently each carry a hex. Replace each `color` with the
matching token from Task 3:

```ts
{ key: 'health',          label: 'Health',      color: 'var(--axi-series-metric-health)',           type: 'area' },
{ key: 'damageDealt',     label: 'Dmg Dealt',   color: 'var(--axi-series-metric-damage-dealt)',     type: 'bars' },
{ key: 'damageTaken',     label: 'Dmg Taken',   color: 'var(--axi-series-metric-damage-taken)',     type: 'bars' },
{ key: 'distanceToTag',   label: 'Dist to Tag', color: 'var(--axi-series-metric-distance-to-tag)',  type: 'area' },
{ key: 'incomingHealing', label: 'Healing',     color: 'var(--axi-series-metric-incoming-healing)', type: 'bars' },
{ key: 'incomingBarrier', label: 'Barrier',     color: 'var(--axi-series-metric-incoming-barrier)', type: 'bars' },
{ key: 'offensiveBoons',  label: 'Off Boons',   color: 'var(--axi-series-metric-offensive-boons)',  type: 'area' },
{ key: 'defensiveBoons',  label: 'Def Boons',   color: 'var(--axi-series-metric-defensive-boons)',  type: 'area' },
{ key: 'hardCC',          label: 'Hard CC',     color: 'var(--axi-series-metric-hard-cc)',          type: 'bars' },
{ key: 'softCC',          label: 'Soft CC',     color: 'var(--axi-series-metric-soft-cc)',          type: 'bars' },
```

Keep each entry's existing `label` and `type` exactly as they are — the array
above shows the labels currently in the file for the swimlane step below, but
if any differ, the file wins.

- [ ] **Step 2: Make `TimelineSwimlanes.tsx` read the presets**

Lines 129–149 build a hover-readout row per metric with a duplicated hex, and
lines 229–236+ pass a duplicated hex to each lane. Both sets become lookups
into the presets array rather than literals. That removes 12 of this file's
25 literals and makes the duplication impossible to reintroduce.

The remaining 13:

- `:157`, `:206` — `text-[#555]`, `text-[#666]` → `var(--axi-text-faint)`.
- `:176-178` — the selection band: `rgba(96,165,250,0.06)` fill and two
  `1.5px solid rgba(96,165,250,0.4)` edges. This is a selection highlight,
  which Reading A puts under accent-driven chrome. Becomes
  `background: transparent` with
  `border-inline: var(--axi-border-control) solid var(--axi-accent)` — the
  annotation branch of R5. The 6%-opacity fill is a rule-2 violation with no
  replacement; the accent edges carry the selection on their own.
- `:191` — `rgba(255,255,255,0.15)` playhead → `var(--axi-rule)`.
- `:200-201` — the hover readout box: `rgba(10,10,22,0.92)` →
  `var(--axi-surface-raised)`;
  `border: '1px solid rgba(255,255,255,0.08)'` →
  `var(--axi-border-control) solid var(--axi-ink-line)`. Since this is a
  hover readout, prefer replacing it with `.axi-tooltip` outright.
- `:210`, `:211` — `text-[#888]` → `var(--axi-text-dim)`;
  `text-[#ccc]` → `var(--axi-text)`.
- Delete both `rounded-*`.

- [ ] **Step 3: Convert the four lane components**

`TimelineLane.tsx`, `TimelineHealthLane.tsx`, `TimelineBoonLane.tsx` and
`TimelineEventMarkers.tsx` each draw into an SVG. For each:

```bash
grep -n "#[0-9a-fA-F]\{3,8\}\b\|rgba\?(\|rounded\|fill=\|stroke=" src/renderer/views/timeline/TimelineLane.tsx
```

- A lane's own metric colour arrives as the `color` prop, which is now a
  `var()` string. Any place it reaches an SVG `fill=` or `stroke=`
  **attribute** must move to `style={{ fill: color }}` (R10). This is the
  single most likely defect in this task: an attribute silently renders
  black rather than erroring.
- A grid rule → `var(--axi-rule)`. A lane background → `var(--axi-ground)`.
  A lane border → `var(--axi-border-control) solid var(--axi-ink-line)`.
- `TimelineHealthLane` draws health, so its threshold colours are status:
  `--axi-ok` / `--axi-warn` / `--axi-danger`.
- Delete every `rounded-*`.

- [ ] **Step 4: Convert the four inspector panels**

All four have zero legacy `var()` — they are entirely literal — and they
share one shape: a titled box with an eyebrow, a big number, and sometimes a
bar. `PositionPanel.tsx` is the template; do it first and the others follow.

`PositionPanel.tsx` specifics:

- `:17`, `:31` — `bg-[#111] rounded-[5px] p-2.5 border border-[#1a1a1a]` →
  `className="axi-panel p-2.5"`, dropping the radius and both colour
  utilities.
- `:18`, `:32` — `text-[9px] text-[#f59e0b] … uppercase tracking-wider` →
  `className="axi-eyebrow"` with
  `style={{ color: 'var(--axi-warn)' }}` (R9). The hand-rolled
  size/tracking/uppercase triple goes.
- `:20` — `text-[28px] font-bold text-[#555]` →
  `style={{ font: 'var(--axi-t-h2)', color: 'var(--axi-text-faint)' }}`.
- `:21`, `:35` — `text-[#888]` → `var(--axi-text-dim)`.
- `:27` — `avg < 600 ? '#10b981' : avg < 1200 ? '#f59e0b' : '#ef4444'` is a
  threshold ramp, so it is status: `var(--axi-ok)` / `var(--axi-warn)` /
  `var(--axi-danger)`.
- `:37` — `h-[3px] bg-[#1a1a1a] rounded` → `.ap-meter` from Task 8.
- `:42` — `background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)'`
  is a gradient on a surface (R4). The bar becomes a flat fill of
  `distColor` — the single status ink the current distance actually is —
  which is also more legible: the gradient showed all three states at once
  regardless of the value.
- `:46` — `text-[8px] text-[#555]` →
  `style={{ font: 'var(--axi-t-micro)', color: 'var(--axi-text-faint)' }}`.
- `:50` — `bg-[#f59e0b11]` is a 6.7%-opacity warn tint (R5). Becomes
  `background: transparent` with
  `border: var(--axi-border-control) solid var(--axi-warn)`.
- Delete all 5 `rounded-*`.

Then `TopHitsPanel.tsx` (11 literals, 4 `rounded`), `HealthPanel.tsx` (10
literals, 1 `rounded`) and `BoonStatePanel.tsx` (9 literals, 2 `rounded`) by
the same decisions. `HealthPanel.tsx:72` draws an SVG — apply R10 there.

- [ ] **Step 5: Convert `TimelineInspector.tsx`, `TimelinePresetBar.tsx`, `TimelineView.tsx`**

- `TimelineInspector.tsx` — 3 literals, resolve by the recipe.
- `TimelinePresetBar.tsx` — 1 `rounded`, delete it; each preset toggle
  becomes `.axi-pill`, whose pressed state is the package's own.
- `TimelineView.tsx` — 2 legacy `var()`, re-point per the Task 2 table.

- [ ] **Step 6: Route the swimlane tooltip through the portaled component**

Replace the hand-rolled tooltip in `TimelineSwimlanes.tsx` with `Tooltip`
from Task 4 wherever it is a hover-on-element affordance. The time-tracking
hover readout stays inline — it follows the cursor along the lane, which the
rect-anchored `Tooltip` cannot express — but it adopts `.axi-tooltip` for
its styling.

- [ ] **Step 7: Verify**

Run the three greps from R12. Expected: zero hits anywhere under
`views/timeline/` and in `views/TimelineView.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0. `tests/shared/timelineData.test.ts` and
`tests/shared/timelineInspector.test.ts` already exist — if either asserts a
preset hex, update it to the token.

Run `npm run dev`, load a fight, open Timeline. Confirm every lane renders
its series colour (**a black lane means an SVG attribute still holds a
`var()` string** — the defect R10 exists to prevent), the selection band
reads as accent edges, the playhead is visible, and all four inspector panels
render with a legible eyebrow and number.

- [ ] **Step 8: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert the Timeline to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: The map — `MovementView` and `MapView`

**Files:**
- Modify: `src/renderer/views/map/MovementView.tsx` (53 literals, 21 `rounded`, 6 inline `transition`)
- Modify: `src/renderer/views/MapView.tsx` (8 literals, 6 `rounded`)

**Interfaces:**
- Consumes: `getProfessionColor` (Task 3), `Tooltip` (Task 4), the `ap-`
  vocabulary (Task 2).
- Produces: nothing; this is the last screen.

The map is **SVG, not canvas** — there is no `getContext` anywhere in the
renderer — so `var()` works throughout, with the one exception R10 names.
It goes last because it consumes every token the earlier tasks settled.

- [ ] **Step 1: Convert `TYPE_COLORS` to shape-plus-chrome**

`MovementView.tsx:12-18` currently gives each landmark type a hue. Landmarks
are accent-driven chrome, not domain data, and `TYPE_SCALES` at `:20-22`
already differentiates the five types by size (0.6 / 0.45 / 0.4 / 0.35 /
0.35). So the hue distinction goes and the size distinction carries the type:

```ts
// Landmarks are chrome, not domain data: the accent drives them. The type is
// carried by TYPE_SCALES below (a keep is 1.7x a camp) rather than by hue,
// and by whether the landmark is a claimable objective or a named location.
const TYPE_COLORS: Record<WvwLandmark['type'], string> = {
    keep: 'var(--axi-accent)',
    tower: 'var(--axi-accent)',
    camp: 'var(--axi-accent)',
    ruins: 'var(--axi-meta)',
    named: 'var(--axi-text-faint)',
};
```

`ruins` takes `--axi-meta` because ruins are a secondary, meta objective —
which is what rule 6 reserves that ink for — and `named` takes faint text
because a named location is a label, not an objective. Leave `TYPE_SCALES`
untouched.

- [ ] **Step 2: Fix the landmark `fill` attribute**

`MapView.tsx:205` is `<svg width="10" height="12" viewBox="0 0 24 24" fill={TYPE_COLORS[type]}>`.
`fill` here is an SVG presentation attribute and will not parse the `var()`
string — it renders black. It must become:

```tsx
<svg width="10" height="12" viewBox="0 0 24 24" style={{ fill: TYPE_COLORS[type] }}>
```

Apply the same change at `MovementView.tsx:617`, `:624`, `:707` and `:714`.

- [ ] **Step 3: Convert the health ramp**

`MovementView.tsx:422` currently collapses five states into one colour
expression. Split the quantity from the state, per rules 9 and 5:

```ts
// The bar's length is the quantity (rule 9); its fill is the threshold.
const healthFill = health > 50
    ? 'var(--axi-ok)'
    : health > 25 ? 'var(--axi-warn)' : 'var(--axi-danger)';

// down and dead are discrete states, so they get a dot rather than a fourth
// and fifth ink. `down` loses its old distinct blue: with only three status
// inks available, the dot is what separates it from low health.
const stateDot = status === 'dead'
    ? 'ap-status-dot--danger'
    : status === 'down' ? 'ap-status-dot--warn' : null;
```

`dead` additionally renders an empty bar — width 0 — so a corpse is not shown
holding health. `.ap-status-dot` and its modifiers come from Task 7.

- [ ] **Step 4: Convert the map chrome**

`MovementView.tsx` around `:356` onward holds the overlay panel and legend:

- `rgba(255,255,255,0.1)` hairlines → `var(--axi-rule)`.
- `rgba(26,31,46,0.9)` and `rgba(26,31,46,0.95)` panel fills →
  `var(--axi-surface)`. A translucent panel over a map is rule 2's exact
  prohibition; the panel becomes opaque and outlined.
- `rgba(255,255,255,0.04)` (including `:428`) → `var(--axi-ground)`.
- `rgba(239,68,68,0.25)` / `rgba(245,158,11,0.25)` / `rgba(34,197,94,0.2)`
  tinted fills → solid `var(--axi-danger)` / `var(--axi-warn)` /
  `var(--axi-ok)` (R5, status branch).
- `:417` — `color: 'var(--text-muted)'` → `var(--axi-text-faint)`.
- `:428` — delete `rounded-lg`.
- Delete all 21 `rounded-*`.
- `:489` — `style={{ opacity: s.opacity, … }}` is opacity on a whole element
  for fade-in, not colour mixing, so it stays. Same for `:676`.

- [ ] **Step 5: Move the six inline transitions into classes**

`:398`, `:401`, `:412`, `:449`, `:489`, `:676` carry inline `transition:`
declarations, which a `prefers-reduced-motion` media query cannot reach.
Move each into an `ap-*` class in `index.css`, then add them to the
reduced-motion block:

```css
.ap-map-toggle, .ap-map-chevron, .ap-map-bar, .ap-map-fade {
    transition: transform var(--ap-duration-normal) ease,
        opacity var(--ap-duration-fast) ease,
        width var(--ap-duration-normal) ease,
        background-color var(--ap-duration-normal) ease;
}
```

and inside `@media (prefers-reduced-motion: reduce)`:

```css
    .ap-map-toggle, .ap-map-chevron, .ap-map-bar, .ap-map-fade { transition: none; }
```

`:449`'s `transition: 'width 0.2s ease, background-color 0.2s ease'` is a
health bar, so its `width` transition is the quantity animating as length —
keep it, and it is correctly killed under reduced motion.

- [ ] **Step 6: Convert `MapView.tsx`'s remaining literals**

```bash
grep -n "#[0-9a-fA-F]\{3,8\}\b\|rgba\?(\|rounded" src/renderer/views/MapView.tsx
```

Seven remain after Step 2. Resolve each by the recipe; delete all 6
`rounded-*`.

- [ ] **Step 7: Route the map tooltip through the portaled component**

Replace the hand-rolled tooltip in `MovementView.tsx` with `Tooltip` from
Task 4. This is the task where the portal earns its keep: the map's overlay
panels and squad rows now lift on hover, so a non-portaled `position: fixed`
tooltip would anchor to the lifted element.

- [ ] **Step 8: Verify**

Run the three greps from R12. Expected: zero hits in
`views/map/MovementView.tsx` and `views/MapView.tsx`.

Run: `npm run typecheck && npm run test:unit`
Expected: exit 0. `tests/shared/wvwLandmarks.test.ts` and
`tests/shared/mapUtils.test.ts` already exist — if either asserts a landmark
hex, update it.

Run `npm run dev`, load a WvW fight, open the map. Confirm: landmarks render
(**black pins mean Step 2 was missed**), the five types are distinguishable
by size, squad members render in their profession colours, a downed member
shows an amber dot and a dead one an empty bar with a red dot, the overlay
panel is opaque and outlined, and tooltips appear next to what they describe
rather than in the corner.

- [ ] **Step 9: Remove dead shim rows (R11) and commit**

```bash
git add src/renderer
git commit -m "refactor(design): convert the map to axi-design

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Delete the shim, close the gate

**Files:**
- Modify: `src/renderer/index.css` (delete the fenced shim block)
- Modify: `tests/renderer/tokens.test.ts` (un-skip one assertion, add three)
- Modify: `CLAUDE.md` (the Design section)
- Modify: `tailwind.config.js` (remove colour utilities from the build)

**Interfaces:**
- Consumes: everything.
- Produces: the finished conversion.

- [ ] **Step 1: Confirm every shim row is dead**

Run the R11 loop. Expected: it reports every one of the 26 rows as
`SHIM ROW DEAD`. If it does not, the named row still has a consumer — find it
and convert it before continuing:

```bash
grep -rn "var(--<row-name>)" src/renderer | grep -v index.css
```

- [ ] **Step 2: Delete the shim**

Remove everything from the `/* ── LEGACY SHIM` comment through
`/* ── END LEGACY SHIM ── */` inclusive.

- [ ] **Step 3: Un-skip the shim assertion and add the whole-renderer guards**

In `tests/renderer/tokens.test.ts`, change `it.skip(` to `it(` on the
`'no longer carries the legacy shim'` assertion, then append a new describe
block that guards the TSX the per-screen greps were checking by hand:

```ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// stripComments above only removes /* */. TSX uses // freely, and a comment
// that mentions a hex or the word "rounded" while explaining a decision must
// not read as a violation.
const stripLineComments = (text: string) =>
    text.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const clean = (file: string) => stripLineComments(stripComments(readFileSync(file, 'utf8')));

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });

const RENDERER = resolve('src/renderer');
const SERIES = resolve('src/renderer/themes/series.css');

const sourceFiles = () =>
    walk(RENDERER).filter((p) => /\.(tsx?|css)$/.test(p) && p !== SERIES);

describe('the whole renderer obeys the axi-design contract', () => {
    it('names no colour literal outside series.css', () => {
        const bad: string[] = [];
        for (const file of sourceFiles()) {
            const text = clean(file);
            text.split('\n').forEach((line, i) => {
                // accents.json supplies the swatch colours in SettingsView:
                // a colour picker must show the colour it selects, which no
                // token can express. That value is read from the package's
                // own JSON, never spelled here.
                if (/a\.hex/.test(line)) return;
                if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\s*\(/i.test(line)) {
                    bad.push(`${file.replace(RENDERER, '')}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('uses no rounded utility and declares no border-radius', () => {
        const bad: string[] = [];
        for (const file of sourceFiles()) {
            const text = clean(file);
            text.split('\n').forEach((line, i) => {
                if (/\brounded(-[a-z0-9[\]]+)?\b|border-radius\s*:/.test(line)) {
                    bad.push(`${file.replace(RENDERER, '')}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('uses no Tailwind palette colour utility', () => {
        const PALETTE =
            /\b(text|bg|border|from|to|via|ring|divide|fill|stroke|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-[0-9]{2,3})?\b/;
        const bad: string[] = [];
        for (const file of sourceFiles()) {
            const text = clean(file);
            text.split('\n').forEach((line, i) => {
                if (PALETTE.test(line)) {
                    bad.push(`${file.replace(RENDERER, '')}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(bad).toEqual([]);
    });

    it('declares no font-family and imports no webfont anywhere', () => {
        for (const file of sourceFiles()) {
            const text = clean(file);
            expect(text, file).not.toMatch(/fontFamily\s*:|font-family\s*:/);
            expect(text, file).not.toMatch(/@import\s+url\(/);
        }
    });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS, with no skipped tests in `tokens.test.ts`. If the
colour-literal guard fails, its message names the exact file and line —
convert it.

- [ ] **Step 5: Trim the Tailwind build**

The app no longer uses a single Tailwind colour utility, so keeping them in
the build ships dead CSS and leaves the door open for one to creep back in.
In `tailwind.config.js`, set the colour palette to only what the app uses —
nothing:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    // Every colour in this app comes from an --axi-* token, so Tailwind
    // ships no colour palette. `transparent` and `currentColor` stay
    // because they are not colours, they are pass-throughs.
    colors: { transparent: 'transparent', current: 'currentColor' },
    borderRadius: { none: '0' },
    extend: {},
  },
  plugins: [],
}
```

Zeroing `borderRadius` means a stray `rounded-lg` now emits nothing rather
than a radius, which makes the contract structural rather than just tested.

- [ ] **Step 6: Verify the build and the app**

Run: `npm run build`
Expected: exit 0.

Run `npm run dev` and walk every screen once more: shell, Settings (switch
the accent), History, both modals, all five Pulse subviews, the boon chart,
Timeline with every lane toggled on, and the map. Nothing black, nothing
invisible, nothing rounded.

Also verify the reduced-motion path: set
`prefers-reduced-motion: reduce` (in Electron, launch with
`--force-prefers-reduced-motion`, or toggle it in DevTools' Rendering panel)
and confirm the watching indicator is visible-but-static, the stat bars
appear at full width without animating, and the accent crossfade is instant.

- [ ] **Step 7: Update `CLAUDE.md`**

Its Design section currently documents the pre-conversion look. Replace it
with:

```markdown
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
```

- [ ] **Step 8: Final verification and commit**

```bash
npm run typecheck && npm run test:unit && npm run build
```
Expected: exit 0 on all three.

```bash
git add -A
git commit -m "refactor(design): delete the legacy shim, close the token gate

Every renderer colour now resolves through an --axi-* token, with
themes/series.css the single sanctioned exception for GW2 domain palettes.
tokens.test.ts enforces it across the whole renderer, and Tailwind ships no
colour palette or radius scale.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
