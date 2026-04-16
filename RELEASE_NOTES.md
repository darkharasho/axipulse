# Release Notes

Version v0.1.3 — April 15, 2026

## Movement Playback

The map view now has real playback. Hit play to watch the fight unfold in real time, and toggle through 0.5x / 1x / 1.5x / 2x speeds. Positions are interpolated between polling samples now, so movement looks smooth instead of stepping frame-to-frame.

## Follow Mode

A new Follow button pins the camera to your position as the replay plays. Click and drag to break out of it.

## Skill Cast Overlay

Each squad member's card shows the last few skills they pressed as they cast them, fading out over time. The most recent cast shows its name too, so you can actually see what someone just pushed instead of guessing from the icon.

## Distance to Commander in Panel

The squad panel now shows each ally's distance from the commander next to their name, color-coded green / amber / red. Quick glance to see who's out of position.

## Fixes

- Stability and Might uptime now display as average stacks (e.g. "2.3 stacks") instead of a percent. The value from Elite Insights was always average stacks, but the UI was stamping a `%` on it, which made Stability coverage look way worse than it actually was.
- The squad ally list on the map no longer pulls in non-squad friendlies, and enemy detection no longer mistakes non-squad allies for enemies.
