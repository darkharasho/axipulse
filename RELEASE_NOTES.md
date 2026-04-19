# Release Notes

Version v0.1.7 — April 18, 2026

## More accurate down contribution

Down contribution was showing as 0 for some WvW fights. Elite Insights sometimes tracks damage to an aggregate "Enemy Players" target rather than individual players, which left the usual field empty. It now falls back to summing down contribution across the full damage breakdown, so you should see real numbers consistently.

## Distance to tag no longer counts respawn and runback

The average and median distance-to-tag stats now exclude the time you're dead and the subsequent runback leg. Previously, running back from spawn would drag the average way up. After you respawn, the exclusion continues until your distance drops back close to where it was before you died.
