# MyMind — Architecture

Static, no-build PWA served from the repo root (GitHub Pages at `/MyMind/`). All paths relative.

## Files and ownership

| Path | Purpose | Owner |
|---|---|---|
| `index.html` | App shell: markup for setup, home, progress, settings, and the night screens. Loads `app.css` and `src/app.js` as a module. | Agent 02 (whole file) — Agent 04 may edit ONLY between `<!-- @night -->` and `<!-- /@night -->` markers |
| `app.css` | Design tokens, components, layout, reduced-motion, focus states | Agent 02 — Agent 04 may append a clearly marked `/* night */` block |
| `src/app.js` | Shell: screen switching, setup/home/progress/settings wiring, countdown ticks, calls into domain/storage | Agent 02 |
| `src/domain.js` | Pure functions: clock math, plan progression, sleep opportunity, logs, chart, sky. No DOM, no storage. | Agent 03 |
| `src/storage.js` | Versioned state load/save/migrate/reset/export/import over `localStorage` | Agent 03 |
| `src/night.js` | Wind-down sequencer, breathing, body scan, can't-sleep, tempted, lights-out, audio, morning wake | Agent 04 |
| `src/audio.js` | Web Audio noise generation + fade (may stay inside night.js if small) | Agent 04 |
| `tests/*.test.js` | `node --test` unit tests for domain + storage; integration checks | Agent 03 (domain/storage), Agent 05 (integration) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA | Agent 05 |
| `docs/`, `AGENTS.md`, `Design/RESUME.md` | Process docs | Agent 01 (others append to `docs/AGENT_HANDOFF.md`) |
| `DesignNotes/`, `Design/`, `Review/` | Product notes, briefs, QA | read-only for workers |

Until Agent 02 performs the split, `index.html` still contains all CSS and JS. Agent 03 builds `src/domain.js` + tests **alongside** the current file without touching it; Agent 02 then rewires the shell to import it.

## Time model (the part that bites)
- **Clock time** `HH:MM` string ↔ `minutes` 0..1439 (`parseClock`, `fmtClock`). Invalid input → `null`, never a guess.
- **Night minutes** (`nightMin`): minutes measured from the previous day's noon, so an evening/early-morning bedtime orders correctly: `23:00 → 1380`, `00:30 → 1470`, `05:30 → 1770`. Rule: `m < 720 ? m + 1440 : m`.
- **Local date** `YYYY-MM-DD` from local getters. `dayDiff(a,b)`, `addDays(d,n)` operate on these.
- **Night date** = date of the evening. A morning log saved on date D is night `addDays(D,-1)`.
- **Sleep opportunity** = `nightMin(wake + 1440 if wake < bedtime) − nightMin(bedtime)` → minutes; warn when `< 480`.
- **Sleep remaining** (tempted screen) from `now` to the next wake: `(wake − now + 1440) % 1440`.

## Domain interface (`src/domain.js` exports — Agent 03 implements exactly these)
```js
parseClock(str) -> number|null            fmtClock(min) -> 'HH:MM'
nightMin(min) -> number                   localDate(date = new Date()) -> 'YYYY-MM-DD'
addDays(dateStr, n) -> 'YYYY-MM-DD'       dayDiff(a, b) -> integer days (b − a)
validatePlan({cur, goal, wake, step}) -> { ok: boolean, errors: string[] }
   // errors: empty field, bad time, goal later than current, step not in [15,30,45]
plannedBedtime(plan, log, nightDate) -> number (nightMin)
   // start at plan.cur on plan.start; move earlier by plan.step per night; last step may be shorter;
   // never below goal; HOLD rule: if the previous night was logged and actual > planned + 60, tonight repeats that planned value
windDownStart(bedtimeNightMin) -> number (bedtime − 30)
nightsRemaining(plan, log, nightDate) -> integer
sleepOpportunity(bedtimeNightMin, wakeMin) -> minutes
opportunityCheck(minutes) -> { ok: boolean, hours: number, message: string }   // ok iff ≥ 480
sleepRemaining(nowMin, wakeMin) -> minutes
isOnTime(actualMin, plannedNightMin, graceMin = 30) -> boolean
chartData(plan, log, endDate, days = 14) -> [{ nightDate, planned, actual|null, onTime|null }]
skyData(plan, log) -> { stars: [{ nightDate, bright }], count, brightCount }
currentNight(nowMin, wakeMin, today) -> { nightDate, nowRef, inNight }
   // before noon AND before wake → still last night: nightDate = yesterday, nowRef in night minutes
```
`plan = { cur:'HH:MM', goal:'HH:MM', wake:'HH:MM', step:15|30|45, start:'YYYY-MM-DD', alarm:boolean }`
`log = [{ date:'YYYY-MM-DD' (morning), slept:'HH:MM', onTime:boolean }]` — one entry per date; a later save for the same date replaces it.

## Storage interface (`src/storage.js`)
```js
load() -> state            // validates; migrates v1 (`mymind.v1`) → v2 (`mymind.v2`); corrupt → fresh state, corrupt blob kept at `mymind.corrupt`
save(state) -> void
reset() -> void            // explicit user action only
exportJSON() -> string     importJSON(str) -> { ok, errors }
state = { v:2, plan|null, log:[], prefs:{ sound:'off'|'rain'|'deep', voice:boolean, remind:boolean },
          windDown: { startedAt: epochMs, stepIndex: int } | null }   // in-progress wind-down for resume; night.js owns it
```

## UI contracts
- Screens: `setup`, `home`, `progress`, `settings` (Agent 02); `wind`, `cant`, `tempted`, `dark`, `morning` (Agent 04). Exactly one visible; night screens are `position:fixed` overlays above the shell, z-order: dark 9 < sheets 10.
- `app.js` exposes `window.MyMind = { state, save, go(screen), tick() }` for `night.js`; `night.js` exposes `startWindDown()`, `openCant()`, `openTempted()`, `goDark()` which `app.js` wires to buttons. Nothing else crosses the boundary.
- Wind-down timing (30 min total, Agent 04): phone-away 3 · brain-dump 7 · breathing 5 · body scan 8 · settle 7 → bedtime. Steps may be finished early; the settle step absorbs the remainder; the dark screen starts at the planned bedtime or on "Lights out", whichever first.
- Countdown: recompute from `Date.now()` on a 30 s interval **and** on `visibilitychange`/`focus`.

## PWA
`sw.js`: versioned cache name, precache the full file list, network-first for navigations, cache-first otherwise, cache only `r.ok`. Bump on every shipped change. Alarm/reminders are page-open-only; the UI says so.
