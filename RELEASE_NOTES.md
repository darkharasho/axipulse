# Release Notes

Version v0.2.1 — August 23, 2026

## Half your squad could show up as the enemy
On some fights the squad got cut clean in half: part of it stayed on your side, the rest were drawn as hostiles, and the enemy zerg you were actually fighting vanished from the report entirely. The giveaway was the enemy suddenly being labelled the wrong team colour.

The parser decided who was on your side from the *last* team it saw you on — and when you zone out of a map at the end of a fight, the game stamps you onto a couple of other teams on the way out. Whichever one landed last became "your team" for the whole log. It now uses the first one, which is the team you actually fought on.

Whether it hit a given log came down to whether a map transition happened to land inside the recording, so it broke some fights and left others fine. New logs are correct; anything you already have needs re-opening to pick up the fix.

## Elite specs show their real names again
The v0.2.0 note said a handful of specs would read as their base profession until the parser's spec catalog caught up. It has. Antiquary, Galeshot and Conduit are named now, so they stop showing up as Thief, Ranger and Revenant in the composition panel and the roster.

On the test log this was seven players across both teams reading as the wrong class. The parser now names every spec Elite Insights does — there is no remaining gap.

Version v0.2.0 — August 19, 2026

## Elite Insights is gone — logs parse inside the app now
AxiPulse used to download a ~90 MB Elite Insights bundle, need .NET 8 installed, and hand every log off to it as a separate program. All of that is gone. The parser now ships inside AxiPulse itself, so there's no download, no install step, no runtime to keep current, and nothing written to disk between the log and the screen. A dropped log renders in about a second.

Nothing is uploaded anywhere — that hasn't changed.

## Things that disappeared with it
- The .NET check and the modal that nagged you to install it.
- The Elite Insights install/update sections in Settings, and the EI and .NET steps in the Troubleshooter.
- The parse progress bar. There isn't enough parsing left to have progress.

NOTE: a handful of elite specs will show as the base profession (e.g. a Harbinger reading as Necromancer) until the new parser's spec catalog catches up. It affects specs it doesn't recognize yet, not your numbers.

Version v0.1.19 — June 21, 2026

## New app icon
AxiPulse has a new duotone **pulse** mark, part of a suite-wide icon refresh. Updated installer/taskbar icon and in-app logo. No functional changes in this release.

Version v0.1.18 — May 3, 2026

## Fixes

- Fixed a rare rendering glitch where the big gradient damage/healing number on the Pulse overview would paint as a solid colored block instead of text. Mostly happened on the first frame of a fight loading.

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
