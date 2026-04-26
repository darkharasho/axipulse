# Release Notes

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
