# Test fixtures

- `wvw.zevtc` — an anonymized mid-size WvW fight (via axilog's
  `anonymizeFile`). Chosen because it has a commander, a multi-team enemy
  set, and an active arcdps healing extension, so every extract unit has
  something to assert against.
- `wvw.ei.json` — Elite Insights output for that exact log, frozen before
  the axilog migration. It is the equality oracle: each extract unit is
  migrated by asserting the native computation matches this. **Delete it,
  and the EI types it needs, in the final migration commit** — it has no
  purpose once nothing computes from it.
