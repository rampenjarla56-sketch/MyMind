# Agent 03 — Sleep scheduling, domain logic & local data
**Model:** Claude Sonnet 5.5 · **Depends on:** `docs/ARCHITECTURE.md` (interfaces are fixed) · **Runs:** first implementation task, alone

## Mission
Build the one tested engine behind MyMind. Every schedule number, saved record and chart row comes from here. No DOM, no UI.

## Owns
`src/domain.js`, `src/storage.js`, `tests/domain.test.js`, `tests/storage.test.js`. Create `tests/` and `src/`. **Do not edit `index.html`** — the shell is rewired by Agent 02 after you finish. You may copy logic out of `index.html` (the current `rel`, `targetFor`, `renderChart`, `renderSky`, `entryOnTime` functions) as a starting point.

## Deliverables
1. `src/domain.js` exporting **exactly** the signatures in `docs/ARCHITECTURE.md` → "Domain interface". ES module, no imports, no globals, no `Date.now()` inside pure functions (callers pass dates/minutes).
2. Progression rules: earlier by `step` per night from `plan.start`; final step may be shorter; never below goal; never later; works for cur 05:30 → goal 00:30 and for cur 01:00 → goal 23:00; **HOLD rule** per architecture (late night = actual > planned + 60 → next night repeats). Document the rule in a comment block at the top of the file.
3. `validatePlan`: empty/invalid times, goal later than current (by `nightMin`), step ∉ {15,30,45}. Equal goal and current is valid.
4. `sleepOpportunity` + `opportunityCheck` (warn < 480 min; message is calm, mentions "8–10 h", no diagnosis, no "cure"). `sleepRemaining` for the tempted screen.
5. `chartData` (14 rows, `actual:null` for missing, historical `planned` from the plan+log, not from today's plan), `skyData` (one star per log entry; bright if on time; adding a late night never reduces either count).
6. `src/storage.js`: `load/save/reset/exportJSON/importJSON` over `mymind.v2`; migrate `mymind.v1` (`{cur,goal,wake,step,alarm,start,log}` → `{v:2,plan,log,prefs}`; compute `onTime` for legacy entries; leave the v1 key untouched); corrupt JSON → fresh state and blob preserved at `mymind.corrupt`; missing `log` repaired. Inject `localStorage` via a parameter or `globalThis` so tests can mock it with a Map.
7. Tests per `docs/TEST_PLAN.md` → Automated. Target ≥ 40 assertions. `node --test` must pass.

## Constraints
No dependencies. Local dates only (`localDate`), never `toISOString()`. Keep safety (`opportunityCheck`) separate from progression. Do not change an exported signature; if one is wrong, write the proposed change in `docs/AGENT_HANDOFF.md` and stop.

## Verify (actually run)
`node --test` · `node --check src/domain.js src/storage.js` · paste the test summary into your report.

## Report
Append to `docs/AGENT_HANDOFF.md`: exported signatures (copy them), the time model in five lines, storage schema, test counts and output, known limitations.
