# Residual list — axi-design conversion, `feat/axi-design-conversion`

Recorded during the final fix round (2026-09-24), after the whole-branch review.
Every item below was **real and unfixed** when this file was written. Item 1
was closed in the pre-merge once-over; the rest stand. None was implemented in
that round:
the branch gets exactly one fix cycle at this stage, and all five are either
pre-existing or non-regressive. This file exists so the branch's residual list
is complete and honest — the three blocking findings were fixed, these five
were deliberately deferred.

None of these is a blocker for merging the conversion. Ordered roughly by how
likely each is to matter to a user.

---

## 1. Reduced-motion coverage is incomplete across the app — **CLOSED**

> **Closed 2026-09-24** in the pre-merge once-over, commit `db99dc6` and its
> follow-up. All three bullets below are fixed: `<MotionConfig
> reducedMotion="user">` in `App.tsx` covers the twelve framer-motion
> consumers, `.animate-spin { animation: none; }` covers the three spinners,
> and `.ap-swatch, .ap-history-entry { transition: none; }` covers the two
> hover-lift rules. The description is kept below as the record of what was
> wrong.

**Where:** `src/renderer/app/AppLayout.tsx:168`,
`src/renderer/views/SettingsView.tsx:178`,
`src/renderer/views/TroubleshootModal.tsx:26`; twelve files importing
`framer-motion`; `src/renderer/index.css` (`.ap-swatch:hover`,
`.ap-history-entry:hover`).

Rule 10 requires a work indicator to carry a `prefers-reduced-motion` line. The
branch set that constraint and does not meet it uniformly:

- Three `animate-spin` work indicators (the update-check `RefreshCw`, the debug
  parse `Loader2`, the troubleshoot-step `Loader2`) use Tailwind's `animate-spin`
  with no reduced-motion variant. `animate-spin` is a `transform` animation, so
  it is rule-10-legal in mechanism; it simply never stops for a user who asked
  for less motion.
- Twelve renderer files import `framer-motion` and **no file anywhere in
  `src/renderer` calls `useReducedMotion` or renders a `<MotionConfig>`**
  (verified by grep: zero hits). framer-motion writes inline styles, and a CSS
  `@media (prefers-reduced-motion)` block cannot reach an inline style — this is
  structurally the same blind spot as SMIL animation in SVG. The app-layer
  reduced-motion block in `index.css` therefore covers none of the motion that
  framer-motion actually drives.
- `.ap-swatch:hover` and `.ap-history-entry:hover` are the two app-layer rules
  that genuinely `translate()` an element, and neither is listed in the
  `prefers-reduced-motion` block that `.ap-map-*` got its `transition: none`
  line from.

**Suggested fix:** a single `<MotionConfig reducedMotion="user">` at the app
root covers all twelve framer-motion consumers at once; add an `animate-spin`
override and the two missing `transition: none` lines to the existing
`prefers-reduced-motion` block in `index.css`.

## 2. `TroubleshootModal` lost shape-redundant status encoding

**Where:** `src/renderer/views/TroubleshootModal.tsx:23-36` (`StepIcon`),
`src/renderer/index.css` (`.ap-status-dot--ok/--warn/--danger/--idle`).

The conversion replaced the `CheckCircle` / `XCircle` / `AlertCircle` glyphs
with three identical 13px `.ap-status-dot` squares that differ **only in fill**.
The dot itself is legal and is exactly what rule 5 asks for ("a small bordered
dot"), so this is not a rule violation — it is an accessibility regression that
rule 5 does not require.

Two things make it bite here specifically:

- `--axi-warn` (`#ff7a2f`) and `--axi-danger` (`#ff5252`) are both orange-reds.
  A red/green deficiency aside, those two are close to each other for everyone.
- This is the one screen in the app that **is** a pass/fail list. Everywhere
  else a status colour decorates text that already says what happened; here the
  dot is the answer.

Rule 5 permits different *shapes* per status — it constrains the fill, not the
silhouette. So the fix is available without breaking the language: keep the
solid fills, give pass/warn/fail three distinguishable outlines (e.g. the
package's `.axi-diamond` motif for one of them, or a notched/triangular variant
of `.ap-status-dot`).

## 3. Recent-skill list encodes age as a continuous opacity ramp

**Where:** `src/renderer/views/map/MovementView.tsx:526`
(`style={{ opacity: s.opacity }}`), computed at `:99` and `:103`.

The movement replay's recent-cast strip fades each skill icon by its age: the
latest cast holds at 1 then ramps down over `LATEST_FADE_MS`, and older casts
ramp `1 - age / SKILL_FADE_MS`. That is a continuous opacity ramp encoding a
quantity — the exact shape rule 2 (no colour at partial opacity over the ground)
and rule 7 (a quantity is length, never intensity) both name.

It is **pre-existing** and the branch did not introduce or worsen it, and no
affordance would be lost by keeping it. It is listed here for one reason: it
appeared on no residual list and carried no justifying comment, and the
credibility of this branch's "kept illegal mechanism" disclosures rests entirely
on that list being complete. An undocumented survivor is worse than a documented
one.

**Note:** the icons are `<img>` elements, which is the same category as the
three raster fades the branch already disclosed and kept. If it is kept
permanently it should at minimum get the same in-file justifying comment those
got.

## 4. `TYPE_COLORS` / `TYPE_SCALES` / `PIN_PATH` are duplicated verbatim

**Where:** `src/renderer/views/MapView.tsx:41-53` and
`src/renderer/views/map/MovementView.tsx:20-32`.

Three constants defining the landmark encoding are copy-pasted between the two
map components. MapView's own comment acknowledges the duplication and defers it.

The risk is demonstrated, not hypothetical: blocking finding 3 of the final
review was a live divergence between the two copies' *neighbourhoods* — group
opacity 0.8 vs 0.4 and pin `strokeWidth` 1.5 vs 1 — which cost a review round to
adjudicate. (The opacity divergence turned out to be correct and deliberate; see
the 2026-09-24 ruling in `progress.md`. The point stands that nothing in the code
said so.)

Contrast with the health thresholds, which **were** correctly single-sourced
into `healthBands.ts` during this branch. The same treatment applies here.

**Caution for whoever does it:** the two files legitimately differ in pin
`strokeWidth` and in group opacity. Extract the three shared constants; do
**not** extract the per-map rendering parameters along with them, or you will
silently unify two values that are supposed to differ.

## 5. Map marker tooltips are unreachable by keyboard and AT

**Where:** `src/renderer/views/map/MovementView.tsx:709-711` and `:842-844`.

Roughly 93 markers wrap a bare, nameless, non-focusable `<div>` inside a
`<foreignObject>`. The hover tooltip is the only path to a marker's identity,
so a keyboard or screen-reader user cannot obtain it.

This was adjudicated during Task 12 and ruled out of scope — it is pre-existing,
and making ~93 markers tab stops inside `foreignObject` is a redesign, not a
reskin. It is recorded here rather than closed because the Task 12 implementer's
original justification for it was **false** and was retracted: the claim was that
the party panel carries the same information, but `MovementView.tsx:426` filters
`m.group === localGroup`, so that panel shows only the local party (never the
squad, never enemies), and of the ally tooltip's three facts it renders only
`name` as text — `account` is a React key only, and profession is an
`<img alt="">`. There is a real information barrier here and it ships as a known
gap.

## 6. MapView landmark labels dimmed to 0.8 (regression, pre-existing to the fix round)

`src/renderer/views/MapView.tsx` — the landmark `<g>` now carries
`opacity={0.8}`. Pre-branch (`git show 5b80c03:src/renderer/views/MapView.tsx`)
the pin `<path>` and `<circle>` each carried `opacity={0.8}` individually and
the landmark `<text>` label carried NONE — it rendered at full strength.
Wrapping the group therefore did not merely relocate the existing value: it
widened it to cover the label, which is now dimmed where it previously was not.

Landed earlier in the branch (present in 42fbb5a), surfaced by the final
scoped re-review. Small, and arguably an improvement in recession terms, but
it is a behaviour change on a branch contracted as a reskin, and it was never
ruled on. Left unfixed rather than changed blind in a round with no review
budget left. Fixing it means moving the 0.8 back onto the path and circle and
leaving the text at full opacity.
