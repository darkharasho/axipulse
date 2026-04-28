# Release Notes

Version v0.1.17 — April 27, 2026

## Follow toggle now sticks between fights

The Map view's **Follow** button used to reset every time you switched to a different fight in history. Now it stays on. Toggle it once, page through your history, and the view keeps re-centering on you in each fight. Dragging the map still turns it off, and it resets when you restart the app.

## QoL Improvements

- Stat cards on dashboards no longer glow on hover unless they're actually clickable. Less visual noise on cards that were never meant to do anything.

Version v0.1.16 — April 26, 2026

## What's New modal

Pops up automatically when you launch a new version for the first time and tells you what changed. If you skip a few versions in a row, it now shows you the notes for every release in between, newest first — so an upgrade from v0.1.10 straight to v0.1.16 doesn't quietly hide five releases worth of changes.

You can also pull it up any time from Settings → About → "What's New" if you want to revisit the current release's notes.

## QoL Improvements

- Notes load from the live GitHub release first, with the bundled `RELEASE_NOTES.md` as an offline fallback, so post-release edits to the notes propagate automatically.
- Escape and clicking outside the modal both close it.
- Links in release notes open in your system browser.

Version v0.1.15 — April 26, 2026

## Boon Performance breakdown (Pulse → Boons)

New per-fight chart at the bottom of the Boons tab. The solid line is your own boon generation across the fight (in your profession color), with one dashed line per party member showing the stacks they actually had at each moment. Toggle between Stab and Might — defaults to Stab.

The left axis tracks your output (auto-scaled). The right axis is the 0–25 stack scale for the dashed party lines, so you can see at a glance whether your group is sitting at 25 stacks or barely covered.

Three overlays you can flip on/off in the header:
- **Party Damage** — red heatmap behind the chart, darker where your party took more damage.
- **Deaths** — skull icon on a member's line at the moment they died.
- **Distance** — pin icon when a party member averaged more than 600 units from the commander in that bucket.

Hovering any bucket pops a tooltip listing each member with their current stacks, distance, and a death indicator if relevant.

NOTE: When Elite Insights doesn't emit per-source state data for a fight, your generation line falls back to a flat estimate based on total generation across the fight rather than going to zero.

## QoL Improvements

- "Parse Random Log" in Settings now jumps to the Pulse tab the moment you click it, instead of waiting for parsing to finish.
