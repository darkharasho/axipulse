# Release Notes

Version v0.1.12 — April 21, 2026

## Troubleshooter

A new Troubleshoot modal walks through your setup step by step, so you can see exactly what's working and what isn't. Open it from Settings → Troubleshooting. It checks:

- Log directory is configured and the folder exists
- At least one `.evtc` / `.zevtc` log file is present
- arcdps is installed and WvW logging is enabled
- Elite Insights is installed
- .NET 8 runtime is available
- A silent parse test runs against a real log to confirm the full pipeline works

Each step shows a pass/fail/warning state. If something is wrong, an inline fix hint tells you exactly what to do.

## Settings Page

The settings page has been cleaned up with a card layout — each section is grouped in its own panel with a clear label. The former "Debug" section is now "Troubleshooting".

## arcdps WvW Detection (Windows)

The automatic arcdps config check now scans all drive letters (A–Z), common install folders (`Program Files (x86)`, `Program Files`, `Games`), nested `Guild Wars 2\Guild Wars 2` install structures, and Steam libraries discovered from `libraryfolders.vdf`. Previously only a small set of hardcoded paths on C and D drives were checked.

---

Version v0.1.11 — April 21, 2026

## Fight Composition

The Overview tab now has a Fight Composition card at the bottom. It shows a segmented bar breaking down the full fight population — your squad, allies, and up to three enemy teams — sized proportionally by player count. Click any segment or legend pill to expand a class breakdown showing GW2 profession icons and counts for that group. Click again to collapse.

The card colors match the current role theme: emerald for support logs, red for DPS logs. Each class chip is colored in that profession's GW2 color.

## Fixes

- Enemy profession names in the class breakdown were always showing as "Unknown". They're now correctly read from the target name field (EI embeds the spec name there, e.g. `"Firebrand pl-123"`).
- The hero banner value (Healing Output / Damage Dealt) was occasionally rendering as a solid color rectangle instead of gradient text. Fixed.
