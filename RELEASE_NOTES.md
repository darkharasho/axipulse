# Release Notes

Version v0.1.11 — April 21, 2026

## Fight Composition

The Overview tab now has a Fight Composition card at the bottom. It shows a segmented bar breaking down the full fight population — your squad, allies, and up to three enemy teams — sized proportionally by player count. Click any segment or legend pill to expand a class breakdown showing GW2 profession icons and counts for that group. Click again to collapse.

The card colors match the current role theme: emerald for support logs, red for DPS logs. Each class chip is colored in that profession's GW2 color.

## Fixes

- Enemy profession names in the class breakdown were always showing as "Unknown". They're now correctly read from the target name field (EI embeds the spec name there, e.g. `"Firebrand pl-123"`).
- The hero banner value (Healing Output / Damage Dealt) was occasionally rendering as a solid color rectangle instead of gradient text. Fixed.
