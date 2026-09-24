# AxiPulse → axi-design conversion

**Date:** 2026-09-23
**Status:** design approved, pending implementation plan

## Intent

Convert AxiPulse's visual layer to the axi-design language, matching the
conversion already done in AxiAM (`../axiam`). The normative spec is
`../axi-design/docs/RULES.md` — 11 rules plus the token and theming sections.

This is a reskin, not a refactor. Behaviour stays identical except where a
rule makes the current behaviour impossible; every such case is enumerated
below under "Deliberate behaviour changes."

Success looks like: zero colour literals outside one sanctioned file, zero
`border-radius`, zero blurred shadows, zero `font-family` declarations, and
an app that still does exactly what it did before.

## Constraints

- **Package**: `@axiapps/axi-design` (AxiAM is on `^1.8.0`).
- **App prefix**: `ap-`. App-specific shapes compose only tokens.
- **Tailwind stays** for layout and spacing, as in AxiAM. Its colour and
  `rounded-*` utilities go.
- **One file may hold colour literals**: `src/renderer/themes/series.css`,
  under rule 10's domain-data carve-out. Everywhere else, every colour
  resolves through an `--axi-*` or `--axi-series-*` token.

## Section 1 — Foundation

`src/renderer/main.tsx` gains, in AxiAM's exact order:

```tsx
import '@axiapps/axi-design/axi.css';
import '@axiapps/axi-design/accents.css';
import './index.css';
import './themes/series.css';
```

plus a synchronous `applyTheme()` call before `createRoot` (see Section 4).

`src/renderer/index.css` goes from 138 lines of legacy tokens to an app
layer mirroring AxiAM's section structure:

1. Tailwind directives
2. Window plumbing — `.axi-window` inward `inset-block`, `.draggable` /
   `.no-drag` app-region classes (frameless Electron window)
3. Titlebar chip slimming for the 38px strip
4. Accent crossfade — `.theme-transitioning *, *::before, *::after`
5. Scrollbars — AxiAM's block wholesale
6. `ap-` app shapes
7. `@media (prefers-reduced-motion: reduce)`

The Google Fonts `@import` and the entire `:root` block are deleted.

### Fonts

All three webfonts (Cinzel, Inter, Rajdhani) are dropped. `--axi-sans` sits
in axi-design's Form layer, and RULES.md states that overriding Form tokens
"means leaving the language, not theming it." Consequences:

- Zero `font-family` declarations anywhere in the app.
- Cinzel removed from the inline styles at `app/AppLayout.tsx:118` and
  `WhatsNewModal.tsx:47`.
- `.font-stat` becomes `font-variant-numeric: tabular-nums` on the package
  type token. Rajdhani's actual job in this app was column alignment in stat
  tables, and tabular numerals do that job without a face change. The class
  keeps its name and all 17 call sites are untouched.

### Rules violations deleted rather than converted

| Deleted | Rule |
|---|---|
| `.gradient-text` | 1 — gradient on a surface, via `background-clip: text` |
| `.heartbeat-pulse` + `@keyframes heartbeat` | 11 — animates `scale` on a text-bearing layer |
| `@keyframes glowPulse` | 3 — a glow |

`.stat-bar-fill`'s `scaleX` entry animation **survives**: a bar is not text,
and rule 9 says a quantity is drawn as length.

Deleting `.heartbeat-pulse` would remove the live "watching for logs"
indicator, so AxiAM's `.am-work` opacity blink is ported as `.ap-work` and
applied at the same sites — a like-for-like swap:

```css
@keyframes ap-work { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
.ap-work { animation: ap-work 1.1s ease-in-out infinite }
```

### New files

- `src/renderer/themes/accents.ts`
- `src/renderer/themes/applyTheme.ts`
- `src/renderer/themes/readToken.ts`
- `src/renderer/themes/series.css`
- `src/renderer/components/Tooltip.tsx` — a new directory; the renderer
  currently keeps shared components at its root (`WhatsNewModal.tsx`) or
  under `views/`, and neither is right for a cross-cutting primitive
- `tests/renderer/tokens.test.ts`
- `tests/renderer/accents.test.ts`

## Section 2 — Token mapping and the legacy shim

*Deleted* below means the concept itself is forbidden; the call sites change
shape rather than swapping a value.

| Legacy | Becomes |
|---|---|
| `--bg-base` | `--axi-ground` |
| `--bg-elevated` | `--axi-surface-raised` |
| `--bg-card` | `--axi-surface` |
| `--bg-card-inner` | `--axi-ground` — a recessed interior reads as ground showing through |
| `--bg-input` | `--axi-surface`, or the package's `.axi-input` |
| `--bg-hover` | **deleted** — rule 4: hover is a lift, not a tint |
| `--text-primary` / `-secondary` / `-muted` | `--axi-text` / `--axi-text-dim` / `--axi-text-faint` |
| `--text-inverse` | `--axi-accent-ink` |
| `--border-subtle` / `-default` / `-hover` | all collapse to colour `--axi-ink-line`; weight from `--axi-border-control` or `--axi-border-panel`. The three-way distinction disappears: rule 3 allows exactly two weight steps, and hover does not change a border. |
| `--brand-primary` | `--axi-accent` |
| `--brand-secondary` | `--axi-accent` — no second brand ink exists, and `--axi-meta` is reserved for meta by rule 6 |
| `--brand-gradient` | **deleted** — rule 1 |
| `--accent-bg`, `--accent-bg-strong`, `--accent-border` | **deleted** — rule 2, accent at 10/18/35% over the ground. Call sites become either a solid `--axi-accent` fill with `--axi-accent-ink` text (status/selected) or a transparent fill with an `--axi-accent` outline (annotation), per rule 5. |
| `--glow-primary` / `-secondary` | **deleted** — no glows |
| `--shadow-card` | `var(--axi-offset-panel) var(--axi-offset-panel) 0 var(--axi-ink-line)` |
| `--shadow-button` | the same at `--axi-offset-control` |
| `--shadow-dropdown` | the panel step |
| `--radius-sm` / `-md` / `-lg` | `--axi-radius-sm` / `--axi-radius`, both `0`. The 118 `rounded-*` Tailwind utilities are **deleted**, not re-pointed. |
| `--status-success` / `-error` / `-warning` | `--axi-ok` / `--axi-danger` / `--axi-warn` |
| `--status-*-bg` (three 8% tints) | **deleted** — rule 2. Status asserts via a solid fill, a 5px cap, or a bordered dot. |
| `--scrollbar-*` (4) | replaced wholesale by AxiAM's scrollbar block |
| `--ease-out-expo`, `--duration-*` | **kept**, renamed `--ap-ease-out-expo` / `--ap-duration-*`. They carry no colour and no form. |

### The legacy shim

Undefined custom properties do not fall back — they compute to nothing. So
gutting `index.css` in the foundation commit would leave every un-converted
screen broken for the whole middle of the conversion, defeating the point of
screen-by-screen verification.

The foundation commit therefore ends `index.css` with a fenced block:

```css
/* ── LEGACY SHIM — DELETE IN THE FINAL COMMIT ──
   Temporary bridge so un-converted screens stay legible mid-conversion.
   Each screen commit removes the rows it no longer consumes.
   tests/renderer/tokens.test.ts has a skipped assertion that this
   block is gone; un-skip it when the last row goes. */
```

It carries only the *mappable* rows, never a deleted one. That is
deliberate: `--accent-bg` going undefined makes every un-converted rule-2
tint consumer visibly wrong, which serves as a to-do list rather than a bug.

## Section 3 — Domain palettes as `--axi-series-*`

`src/renderer/themes/series.css` declares domain palettes as custom
properties on `:root`. It is the only app file permitted colour literals,
justified by rule 10: "a profession, a team, a map colour is domain data…
it is the data's colour rather than the system's."

**These palettes are fixed and are NOT recoloured by the accent.** The
accent drives chrome only: frame, legend, overlay panels, landmarks,
selection highlight.

### 1. Profession — 10 tokens plus Unknown

`PROFESSION_COLORS` has 51 entries but only 11 distinct values, because
every elite spec inherits its base profession's colour. It becomes:

```
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
```

`src/shared/professionUtils.ts` keeps `PROFESSION_BASE` and
`getProfessionBase()` unchanged. `getProfessionColor()` changes from
returning a hex to returning `var(--axi-series-prof-<base>)`, derived
through `getProfessionBase()`. `PROFESSION_COLORS` is deleted — it becomes
derivable, so the 51-entry map collapses to a lookup through the 10 tokens.
This is a simplification that falls out of the conversion, not a bolted-on
refactor.

### 2. Chart series ramp — 10 tokens

`BoonPerformanceChart`'s per-player categorical ramp becomes
`--axi-series-1` … `--axi-series-10`, the generic "distinguish N series"
ramp that `--axi-series` exists to carry.

### 3. Timeline metric ramp — 10 tokens

`TimelinePresets.ts`'s ten metric colours become
`--axi-series-metric-<key>` (`health`, `damageDealt`, `damageTaken`,
`distanceToTag`, `incomingHealing`, `incomingBarrier`, `offensiveBoons`,
`defensiveBoons`, `hardCC`, `softCC`).

These are deliberately **not** mapped onto `--axi-ok` / `--axi-warn` /
`--axi-danger`, even where tempting (health→ok, damageDealt→danger). Rule 5
says a filled status ink asserts state; spending those three inks on chart
series would make every chart read as an alarm.

### Not series — converted as chrome or status

| Site | Becomes |
|---|---|
| `MovementView.tsx:12` `TYPE_COLORS` (5 landmark types) | **chrome, not domain data.** Landmarks are accent-driven. The five types differentiate by the existing `TYPE_SCALES` size variation (0.6 / 0.45 / 0.4 / 0.35 / 0.35) plus `--axi-accent`, `--axi-meta`, `--axi-ink-line` — not by hue. `MapView.tsx:205` consumes the same map and follows. |
| `MovementView.tsx:422` health ramp | **status, not data** — see below |
| recharts axis ticks `fill: '#64748b'` | `--axi-text-faint` |
| `<Skull color="#ffffff">` | `--axi-text` |
| `<MapPin color="#fbbf24">` | `--axi-warn` |
| `FALLBACK_SELF_COLOR` `#10b981` | `--axi-accent` — the one place the retiring brand emerald legitimately becomes the accent |

### The health ramp

`MovementView.tsx:422` is a health/status ternary, not a team palette:

```ts
status === 'dead' ? '#ef4444' : status === 'down' ? '#3b82f6'
  : health > 50 ? '#22c55e' : health > 25 ? '#f59e0b' : '#ef4444'
```

Five-way, onto three status tokens:

- `health > 50` → `--axi-ok`
- `health > 25` → `--axi-warn`
- otherwise → `--axi-danger`
- `dead` → empty bar plus an `--axi-danger` bordered dot
- `down` → `--axi-warn` bar plus an `--axi-warn` bordered dot

The bar carries the quantity as length (rule 9); the dot carries the
discrete state (rule 5). See "Deliberate behaviour changes."

## Section 4 — Accent picker and persistence

`themes/accents.ts` ports AxiAM's file minus `LEGACY_THEME_TO_ACCENT`.
AxiPulse has never persisted a theme id — grepped and confirmed — so a
legacy map would be an empty comment pretending to be code.
`resolveAccentId` is a straight validate-or-default.

```ts
import accentsJson from '@axiapps/axi-design/accents.json';

export type AccentDefinition = { id: string; label: string; hex: string };
export const ACCENTS: AccentDefinition[] = accentsJson;
export const DEFAULT_ACCENT_ID = 'emerald-mint';

export function resolveAccentId(id?: string): string {
    if (id && ACCENTS.some((a) => a.id === id)) return id;
    return DEFAULT_ACCENT_ID;
}
```

Default is `emerald-mint` (`#34d399`), the nearest accent to the retiring
brand emerald.

`themes/applyTheme.ts` ports verbatim, including the 500ms
`.theme-transitioning` crossfade and its debounce timer.

### Persistence

One field added to the existing `electron-store` plumbing:

- `src/main/index.ts` — `get-settings` returns
  `accentId: store.get('accentId', DEFAULT_ACCENT_ID)`; `save-settings`
  accepts and writes `accentId`.
- `src/preload/index.ts` — unchanged, the shapes are already `any`.
- `SettingsView.tsx` — an accent row rendering the 11 accents from
  `accents.json` as a row of swatches. Each swatch is square and outlined;
  the selected one carries a solid fill and an offset block, per rule 5's
  filled-means-status. Clicking applies immediately via `applyTheme` and
  persists via `saveSettings`.

### First paint

`getSettings()` is async and fires at `AppLayout` mount, so a user on
`crimson-red` would see emerald for a frame, then a 500ms crossfade to red,
on every launch.

`applyTheme` therefore mirrors the resolved id into `localStorage`
(synchronous, renderer-local), and `main.tsx` bootstraps from that mirror
before `createRoot`. electron-store remains the source of truth; the mirror
is a cache, and a cold first launch with an empty mirror correctly falls
back to the default.

## Section 5 — The token-reading bridge, tooltips, reduced motion

**There is no canvas in this app.** The map, the timeline lanes and the
health sparklines are all SVG. The `getComputedStyle` bridge is still
needed, but for a different reason: SVG *presentation attributes* do not
parse `var()`. `<svg fill="var(--x)">` is invalid and renders black; it
only works through CSS.

Two consequences:

- Colours passed as the `fill` attribute (`MapView.tsx:205`,
  `MovementView.tsx:617` / `624` / `707` / `714`) convert to
  `style={{ fill: 'var(…)' }}`. That is a free fix, since the style prop is
  CSS.
- **recharts** forwards `fill`, `stroke` and `tick={{ fill }}` to SVG
  attributes, so `var()` cannot reach them. These need a resolved string.

`themes/readToken.ts` is a single helper:

```ts
export function readToken(name: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim();
}
```

Used **only** where a colour must be a literal string at JS level: recharts
props and the two `lucide-react` `color=` props in `BoonPerformanceChart`.
Everywhere else — every `style={{}}` object, every SVG `style`, every CSS
rule — uses `var()` directly.

Two consumption patterns, and the distinction matters:

- **Series tokens** are accent-independent, so they may be read once at
  module scope.
- **Chrome tokens** (`--axi-text-faint`, `--axi-accent`) change when the
  accent changes, so a component reading them must re-read on accent
  change. `BoonPerformanceChart` is the only such file; it takes the accent
  id from the store as a `useMemo` dependency. Without that dependency,
  switching accent would leave its axis ticks stale until remount.

### Tooltips

`components/Tooltip.tsx` ports from AxiAM essentially verbatim:
`createPortal` to `document.body`, 400ms delay, `top` / `bottom` / `right`
positioning, timer cleanup on unmount.

The portal is a contract, not a style choice. `.axi-tooltip` is
`position: fixed`, and any hover-lifted ancestor
(`transform: translate(-2px,-2px)`) becomes its containing block, which
would anchor the tooltip to the card instead of the viewport.

AxiPulse currently hand-rolls tooltips in three files
(`TimelineSwimlanes`, `BoonPerformanceChart`, `MovementView`); all three
route through the new component.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .ap-work { animation: none; }
  .stat-bar-fill { animation: none; }
  .theme-transitioning *,
  .theme-transitioning *::before,
  .theme-transitioning *::after { transition: none !important; }
}
```

`.ap-work` with `animation: none` rests at full opacity — the
watching-for-logs indicator stays visible, it just stops blinking, which is
what "kills animation while keeping state legible" means.

The eight `animationDelay` stagger sites across the Pulse subviews are
`.stat-bar-fill` instances, covered by that one rule.

The six inline `transition:` declarations in `MovementView` cannot be
reached by a media query, so they move into `.ap-*` classes as part of that
screen's conversion.

## Section 6 — Verification

### `tests/renderer/tokens.test.ts`

Modelled on axi-design's own `tests/tokens.test.mjs`, asserting against
`src/renderer/index.css`:

1. **No colour literals** — scanning only the *values* of colour-carrying
   properties (`color`, `background` / `background-image`, `border*-color`,
   `outline-color`, `box-shadow`, `text-shadow`, `filter`, `fill`,
   `stroke`, `caret-color`, `column-rule-color`, `text-decoration-color`,
   `accent-color`, `scrollbar-color`), the same allowlist axi-design uses.
   Scanning whole lines would false-positive on `#root`.
2. **No `border-radius`** anywhere.
3. **`box-shadow` offsets drawn from the four enumerated offset tokens
   only**, with no third non-zero value — this is what catches a blur
   creeping back in.
4. **No literal border or outline widths** — weights come from
   `--axi-border-control` / `-panel` / `-hairline`.
5. **No local redeclaration of Form-layer tokens.**
6. **Zero `font-family` declarations and no `@import url(`** — the font
   decision, mechanised.
7. **`.skip`ped: the legacy shim block is absent.** Un-skipped in the final
   commit. This assertion starts red by design, and its skip is the
   scheduled-deletion marker.

`series.css` is exempted from #1 by path, as the sanctioned literal file
under rule 10.

### `tests/renderer/accents.test.ts`

Following AxiAM's precedent: `resolveAccentId` returns the default for
`undefined`, unknown and empty input; returns a valid id unchanged; and
every id in `accents.json` resolves to itself.

### Per-screen manual verification

Run after each screen commit:

```
grep -rn "#[0-9a-fA-F]\{3,8\}\|rgba\?(\|hsla\?(" src/renderer \
  --include=*.tsx --include=*.css | grep -v themes/series.css
grep -rn "rounded-\|border-radius" src/renderer
```

Both must trend to zero and reach zero at the final commit. The tests cover
`index.css`; the greps cover the TSX, which is where AxiPulse actually keeps
most of its colour (~290 literals, 118 `rounded-*` utilities, 40 Tailwind
colour utilities).

### Out of scope

Visual regression snapshots. The app has none today, and adding a
screenshot harness is a larger project than the reskin.

### Test runner

`vitest.config.ts` already sets `pool: 'forks'` with `maxForks` and
`maxWorkers` at 2. Respect it; do not override.

## Execution

A foundation commit, then one commit per screen, then a final commit that
deletes the shim and un-skips its assertion.

**Screen order** — cheapest to most entangled, so the vocabulary settles
before the hard parts:

1. Shell — titlebar, nav, `AppLayout`, `SubviewCapsule`
2. Settings — gains the accent picker
3. History
4. The two modals — `WhatsNewModal`, `TroubleshootModal`
5. Pulse subviews plus `StatCard` — Overview, Damage, Defense, Boons,
   Support, `FightCompositionCard`
6. `BoonPerformanceChart` — the recharts file, first consumer of
   `readToken`
7. Timeline — lanes, swimlanes, event markers, inspector panels
8. `MovementView` and `MapView` — last, since they consume every token and
   benefit from all of them being final

`CLAUDE.md`'s Design section is updated in the final commit; it currently
documents the pre-conversion look (brand gradient, Cinzel).

## Deliberate behaviour changes

Everything else is a pure reskin. These are the exceptions, each a
consequence of a rule rather than a preference:

1. **The app gains an accent picker.** Eleven accents, persisted, default
   `emerald-mint`. This is an addition against "keep existing behaviour
   identical" and was chosen knowingly.
2. **"Down" loses its distinct blue on the map.** The health ramp's
   five-way colour distinction collapses onto three status tokens; down and
   low-health both read amber, disambiguated by a bordered status dot
   rather than a fourth ink. Inventing a fifth ink would violate rule 5.
3. **Landmark types no longer differentiate by hue.** They differentiate by
   size, via the `TYPE_SCALES` variation that already exists, plus accent
   and meta inks.
4. **Three webfonts are gone.** Titlebar branding and stat columns render in
   `--axi-sans`; stat columns keep their alignment through
   `font-variant-numeric: tabular-nums`.
5. **The heartbeat indicator becomes an opacity blink.** Same sites, same
   meaning, compositor-only animation.
6. **All corners are square and all shadows are hard offset blocks.** This
   is the language; it is listed here only because it is the most visible
   single change.
