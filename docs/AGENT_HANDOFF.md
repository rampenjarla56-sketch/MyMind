# MyMind — Agent handoff log

Append a dated section per task. Newest at the bottom.

---
## 2026-10-14 — Agent 01 (Fable 5.1): repository recovery + foundation

### Recovery (evidence)
- Canonical repo: `~/Documents/MyMind/MyMind` — `git rev-parse --show-toplevel` confirms; branch `main`, clean tree, `ahead 2` of `origin/main`.
- Recovered commits present: `b89a8a5` (interactivity + PWA + research) and `60b503a` (five briefs + QA fixes); parents `1b144a3`, `42b6025` match GitHub.
- Method: `git bundle create --all` from the original session repo → cloned into sibling `MyMind-recovery` → `diff -rq --exclude=.git` against the copied tree: **identical** → `.git` copied into the canonical folder. Tag `recovery-2026-10-14` marks the point.
- Backups kept (do not delete): `~/Documents/MyMind/MyMind-copy-backup-2026-10-14/` (pre-recovery copy), `~/Documents/MyMind/MyMind-recovery/` (full clone), `~/Documents/MyMind/mymind-recovery-2026-10-14.bundle`, plus the original session folder (app-managed, auto-removed after a week idle).
- Not recovered (by design): `.claude/launch.json` (local preview config; trivially recreated: python http.server on 8420 from the parent dir).
- Nothing pushed. Push needs the owner's approval.

### Checks run
- `node --check` on the inline script and `sw.js`: OK. `manifest.webmanifest`: valid JSON. Node v24.19.0. No test suite exists yet (M1 creates it).

### Foundation written
`AGENTS.md`, `docs/PROJECT_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md`, `docs/agents/01..05`.

### Decisions
- Keep the no-build vanilla stack; split into ES modules; tests with `node --test`. Rationale: the MVP works, deploys as static files, and the brief says not to rewrite working code.
- Storage key moves to `mymind.v2` with a v1 migration so the owner's existing nights survive.
- Generated Web Audio noise stays (no audio files to ship; satisfies "local, offline, no stream").

### First assignments
1. Agent 03 — build `src/domain.js`, `src/storage.js`, `tests/` (no UI edits). Run alone.
2. Agent 02 — split the shell, consume domain; add guardrail, settings, reduced-motion.
3. Agent 04 — `src/night.js`, timed wind-down, breathing alternative, morning flow.
4. Agent 05 — PWA for the new file set, a11y audit, integration tests, release report.
Sequential unless on separate worktrees.

### Open
- Rename to "Earlier"? (marketing recommendation; owner's call; affects manifest name + README only).

---
## 2026-10-14 — Agent 03 (Fable 5.1): domain logic + local data

### Files changed (all new; `index.html` untouched)
- `src/domain.js` — pure functions, no imports, no DOM, no `Date.now()`.
- `src/storage.js` — versioned `localStorage` state; imports `./domain.js`.
- `tests/domain.test.js`, `tests/storage.test.js` — 55 tests, ~195 assertions.

### Exported signatures (as implemented)
```js
// src/domain.js
parseClock(str) -> number|null          fmtClock(min) -> 'HH:MM'  ('--:--' for non-finite)
nightMin(min) -> number                 localDate(date = new Date()) -> 'YYYY-MM-DD'
addDays(dateStr, n) -> 'YYYY-MM-DD'|null   dayDiff(a, b) -> integer (b − a), NaN on bad input
isDateStr(str) -> boolean               // extra helper, used by storage
validatePlan({cur, goal, wake, step}) -> { ok, errors: string[] }
plannedBedtime(plan, log, nightDate) -> nightMin | null (null for an invalid/missing plan)
windDownStart(bedtimeNightMin) -> bedtimeNightMin − 30
nightsRemaining(plan, log, nightDate) -> integer (0 once at goal; 0 for a missing plan)
sleepOpportunity(bedtimeNightMin, wakeMin) -> minutes
opportunityCheck(minutes) -> { ok (≥ 480), hours (1 decimal), message }
sleepRemaining(nowMin, wakeMin) -> minutes
isOnTime(actualMin, plannedNightMin, graceMin = 30) -> boolean
chartData(plan, log, endDate, days = 14) -> [{ nightDate, planned, actual|null, onTime|null }]
skyData(plan, log) -> { stars: [{ nightDate, bright }], count, brightCount }
constants: HOLD_LATE_MIN = 60, WIND_DOWN_MIN = 30, MIN_OPPORTUNITY = 480

// src/storage.js
load() save(state) reset() exportJSON() importJSON(str) -> { ok, errors }   // use globalThis.localStorage
createStorage(store) -> { load, save, reset, exportJSON, importJSON }       // injectable (tests use a Map mock)
normalize(raw) -> state   migrateV1(v1) -> state   freshState() -> state
KEY = 'mymind.v2', KEY_V1 = 'mymind.v1', KEY_CORRUPT = 'mymind.corrupt'
```
No interface in `docs/ARCHITECTURE.md` was changed; the extras above are additions.

### Time model (five lines)
1. Clock minutes 0..1439 from `'HH:MM'`; `parseClock` rejects `24:00`, `7:5`, empty, garbage → `null`.
2. Night minutes: `m < 720 ? m + 1440 : m`, so 23:00 (1380) < 00:30 (1470) < 05:30 (1770).
3. Dates are local `YYYY-MM-DD`; `addDays` builds `new Date(y, m, d + n)`, `dayDiff` uses UTC day numbers, so DST days count as 1.
4. Night date = evening date; a morning log on D describes night `addDays(D, −1)`.
5. `sleepOpportunity` / `sleepRemaining` = `(wake − bed + 1440) % 1440`; equal to the architecture formula for every real schedule and never negative.

### Progression and HOLD (documented at the top of `domain.js`)
Night 0 = `plan.start` at `plan.cur`; each night `−step`, clamped at `goal` (last step may be shorter); nights before start = `cur`. HOLD: previous night logged with `actual > planned + 60` → tonight repeats the previous planned value. `plannedBedtime` walks night by night from `plan.start`, so the log is the only history it needs. `nightsRemaining` = `ceil((planned − goal) / step)` after holds.

### Storage schema and rules
`{ v:2, plan|null, log:[{date, slept, onTime}], prefs:{ sound:'off'|'rain'|'deep', voice:false, remind:false } }` under `mymind.v2`.
- `load()`: v2 present → `normalize` (repairs missing `log`, bad prefs, invalid plan → `null`, drops bad log rows, dedupes by date, sorts). No v2 but v1 → `migrateV1` (computes `onTime` for legacy rows against plan+log), writes v2, **leaves v1 untouched**. Unparsable or non-object blob → fresh state, raw blob kept at `mymind.corrupt`, the bad key is not overwritten until the next `save`.
- `save(state)` normalizes first, so a same-date log entry always replaces (last one wins).
- `reset()` removes v2 **and v1 and the corrupt copy** — otherwise the next load would resurrect the v1 data after an explicit reset.
- `importJSON` is strict (reports errors, never repairs) and accepts a v2 export or a raw v1 blob. `exportJSON` is `load()` pretty-printed, so export → import round-trips exactly.
- `localStorage` throwing (private mode, quota) is swallowed; the app keeps running in memory.

### Commands run
- `node --test` and `node --test tests/*.test.js` → `tests 55 · suites 11 · pass 55 · fail 0` (Node v24.19.0).
- `node --check` on `src/domain.js`, `src/storage.js`, both test files → OK.
- Browser at 375 px: **not run** — this task ships no UI and `index.html` is unchanged; nothing to open until Agent 02 wires the shell.

### Interface requests / notes for Agent 01
- `node --test tests/` (trailing slash, as written in `AGENTS.md` and the card) **does not work on Node 24**: positional args are file globs, so it tries to load a module named `tests` and fails. Working forms: `node --test` (default `**/*.test.js` discovery) or `node --test tests/*.test.js`. Please update `AGENTS.md`/`docs/TEST_PLAN.md`.

### Notes for Agent 02 (shell)
- Save a morning log as `{ date: localDate(), slept, onTime: isOnTime(parseClock(slept), plannedBedtime(plan, log, addDays(localDate(), -1))) }`; compute `onTime` *before* pushing the new entry so the stored value is the historical truth. `save()` dedupes by date.
- `plannedBedtime` returns `null` for a missing/invalid plan; guard before `fmtClock`.
- Tonight's countdown: `windDownStart(plannedBedtime(plan, log, localDate()))`; compare against `nightMin(nowClockMin)`.
- Guardrail: `opportunityCheck(sleepOpportunity(nightMin(parseClock(goal)), parseClock(wake)))` on the setup screen; show `message` when `!ok` and never label such a plan a success.
- `chartData` rows before `plan.start` carry `planned = cur`; stored `onTime` wins over recomputation so a plan change never rewrites history.

### Known limitations
- The HOLD rule compares the previous night only; a late night that was *not* logged is invisible (honest: we never guess).
- With one plan object the chart cannot show the *previous* plan's dashed line after a plan change; only per-night `onTime` survives, which is what the sky and chart colours use.
- `sleepOpportunity` of an identical bedtime and wake time returns 0, not 1440.
