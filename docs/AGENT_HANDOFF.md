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
- `node --test` and `node --test*.test.js` → `tests 55 · suites 11 · pass 55 · fail 0` (Node v24.19.0).
- `node --check` on `src/domain.js`, `src/storage.js`, both test files → OK.
- Browser at 375 px: **not run** — this task ships no UI and `index.html` is unchanged; nothing to open until Agent 02 wires the shell.

### Interface requests / notes for Agent 01
- `node --test` (trailing slash, as written in `AGENTS.md` and the card) **does not work on Node 24**: positional args are file globs, so it tries to load a module named `tests` and fails. Working forms: `node --test` (default `**/*.test.js` discovery) or `node --test*.test.js`. Please update `AGENTS.md`/`docs/TEST_PLAN.md`.

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

---
## 2026-10-14 — Agent 02 (Fable 5.1): shell split, design system, onboarding/home/progress/settings

### Files changed
- `index.html` — rewritten as shell markup only: `setup`, `home`, `progress`, `settings` sections in `<main>`, a `<dialog id="resetDlg">`, and the night screens (`wind`, `panic`, `cant`, `dark` incl. `alarmBox`) inside `<!-- @night --> … <!-- /@night -->`. Loads `app.css` and `src/app.js` (module). No inline CSS/JS left.
- `app.css` (new) — tokens (navy/indigo surfaces, warm text, gold accent, indigo focus ring), buttons/inputs/cards/segments/dialog, `:focus-visible` rings, `prefers-reduced-motion` (no scaling; breathing text still conveys phase), ≥ 44 px targets, 17 px inputs (no iOS zoom), system font stack. Night surfaces get tokens only (`.sheet`, `.breath`, `.dots`, `#dark`); Agent 04 appends a `/* night */` block at the end.
- `src/app.js` (new) — shell. Imports `./domain.js`, `./storage.js`, `./night.js`. Exposes `window.MyMind = { state (getter), save(), go(screen), tick() }`. No time/plan maths re-implemented: every number shown comes from `domain.js`.
- `src/night.js` (new, **scaffold — Agent 04 owns and should replace it**) — a faithful port of the pre-split night behaviour (5-step wind-down, 4-7-8 breathing, body scan + optional voice, generated rain/deep noise with 20-min fade, dark screen with clock, wake alarm + `UP`, tempted/panic with `domain.sleepRemaining`, can't-sleep branches). Exports `startWindDown()`, `openCant()`, `openTempted()`, `goDark()` per `docs/ARCHITECTURE.md`. Written only so "every existing feature still works after the split"; it is not the timed 30-min wind-down from Agent 04's card. Small additions over the old code: "Leave wind-down" / "Back home" exits on every night sheet (no dead ends from home → can't-sleep → dark), skip-breathing button, `aria-pressed` on sound segments, honours `prefs.sound` (highlights the default, never auto-plays) and `prefs.voice` (auto-starts the quiet voice on the body-scan step).

### Screens (what each does)
- **Setup**: default step **15**. Live preview (`plannedBedtime`, `windDownStart`, `nightsRemaining` on a draft plan with `start = today`). `validatePlan` errors shown inline after the first submit attempt; focus moves to the offending field. Guardrail: `opportunityCheck(sleepOpportunity(nightMin(goal), wake))` renders the calm "< 8 h" note (gold callout, never red, never blocks). Edit mode (existing plan): note that logged nights stay, Cancel button; saving writes `state.plan` only, `state.log` untouched.
- **Home**: tonight's bedtime, wind-down time, wake time; countdown recomputed from the wall clock on a 30 s interval, on `visibilitychange` and on `focus`; nights remaining; tonight's sleep opportunity (short line when the goal schedule is fine, the full guardrail message when the goal itself is < 8 h; an at-goal plan under 8 h is never called a success); primary Start wind-down; secondary I'm tempted / I can't sleep; morning check-in (shows last night's plan, saves per Agent 03's note, `onTime` computed before the entry is added); Progress / Settings links.
- **Progress**: night sky from `skyData` (deterministic hashed positions, moon fills with on-time count, only ever fills) and the 14-night chart from `chartData` ending on *last night* (dashed plan line, green/amber dots, hollow dots for unlogged nights, "nothing is scored" copy). SVGs have `role="img"` + `<title>`/`<desc>`; a "Read as a list" `<details>` lists every night in words (`Oct 6 · plan 05:15 · slept 06:40 · later`), so times across midnight are readable.
- **Settings**: plan summary + Edit (copy asserts history is kept), default sound (`prefs.sound`), voice (`prefs.voice`), reminder (`prefs.remind`, asks Notification permission on enable), Export (downloads `mymind-YYYY-MM-DD.json` from `storage.exportJSON`), Import (file input → `storage.importJSON`, strict errors shown, state reloaded), **Reset my data** behind a `<dialog>` confirm (falls back to `confirm()`), privacy / not-medical / see-a-doctor / page-open-only text.

### "Which night is tonight?" (UI decision, flagged for Agent 03)
The domain has no helper for this, so `app.js` has one small rule (`currentNight`): before noon **and** before the wake time, the user is still inside last night → `nightDate = addDays(today, −1)` and "now" is measured as `nightMin(now)`; otherwise `nightDate = today` and "now" is the plain clock minute. Everything else (planned bedtime, wind-down, opportunity) is domain. **Request for Agent 03:** consider a `currentNight(nowMin, wakeMin, today)` export so the shell carries no clock reasoning at all.

### Reminder
Replaced the old `setTimeout` with a tick-based check (fires once per night when wind-down is ≤ 10 min away, page-open only; notification if granted, otherwise the gold countdown cue). `prefs.remind` is the single source; the home button and the settings toggle flip the same pref.

### Commands run (results)
- `node --check` on `src/app.js`, `src/night.js`, `src/domain.js`, `src/storage.js`, `sw.js` → all OK.
- `node --test` → `tests 55 · pass 55 · fail 0`.
- Browser (built-in pane, `python3 -m http.server 8421` from `.claude/worktrees/`, since port 8420 was already taken by another session serving a different tree): at **375×812** — setup (default values, preview, guardrail at wake 07:00 → "About 6.5 h…", validation with goal 06:00 > current → inline error + focus on goal), start plan → home (02:38 local: tonight = last night's date, bedtime 05:30, "Wind-down starts in 2 h 22 min"), morning log 04:50 → stored `{date, slept, onTime:true}`, seeded 6 nights → progress (HOLD visible: Oct 6 repeats 05:15 after a late Oct 5), settings (sound → rain, voice on, both persisted), export → reset → import round-trip byte-identical, bad JSON → "Not imported: That file is not valid JSON.", reset dialog Keep it / Yes erase → setup, v1 blob migration on load, wind-down steps 1–5 → dark (clock, sound segments, back home), tempted from home (sleep window text), can't-sleep → mind racing → back to the dark → back home, keyboard Tab → visible indigo focus ring, `visibilitychange`/`focus` recompute the countdown. At **1024×800**: layout centred at 480 px, body 18 px, primary button 54 px tall, nav links 45 px.
- **Not run:** `prefers-reduced-motion` emulation (the browser pane has no media-query emulation); the CSS rule is present and reviewed. Export was exercised through `storage.exportJSON()` rather than the download click (same code path minus the `<a download>`).

### Defect found and fixed during verification
A nested `/* … /* night */ … */` comment in `app.css` terminated early and swallowed the `.sheet` rule, so overlays lost `position: fixed`. Fixed; overlays verified at `fixed` covering `0,0,375,812`.

### For Agent 05 — file list for `sw.js`
`./`, `./index.html`, `./app.css`, `./src/app.js`, `./src/domain.js`, `./src/storage.js`, `./src/night.js`, `./manifest.webmanifest`, `./icons/icon-192.png`, `./icons/icon-512.png`, `./icons/icon-180.png`. Bump `CACHE` (currently `mymind-v2`). `theme-color` is now `#0a0e1a` (manifest still says `#0b0d14`; harmless, your call).

### For Agent 04
- Replace `src/night.js` wholesale; the shell only needs the four exports and calls `MyMind.go('home')` expectations as in the scaffold. `MyMind.save()` normalises and re-reads state — read `MyMind.state` again after saving.
- **Blocker for your card:** `storage.normalize` keeps only `prefs.sound/voice/remind`; a `prefs.windDown = {startedAt, stepIndex}` would be dropped on save. Needs Agent 03 to allow it (or a dedicated `state.windDown`).
- Tokens available: `--bg --bg-2 --card --card-2 --line --text --dim --faint --accent --accent-soft --indigo --ok --late`; `.sheet`, `.breath`, `.dots`, `#dark` styles; `.sr-only`; `button.link`.
- The morning `UP` flow currently returns home and focuses the morning-log input.

### Known limitations / open
- Chart at 375 px is small (440×260 viewBox); the list is the accessible fallback.
- Desktop verified at 1024 px inside the pane only (no separate desktop browser).
- Export triggers a file download; on iOS Safari this opens a share sheet rather than saving silently.

---
## 2026-10-14 — Agent 04 (Fable 5.1): night experience — PARTIAL (session cut off at usage limit)

### Files changed
- `src/night.js` — replaced wholesale. Timed 30-min wind-down (3/7/5/8/7) anchored on `state.windDown.startedAt`; every step change re-anchors so the new step starts now with full length, early finishes pull the anchor earlier and the settle step absorbs the remainder; lights-out at `max(planned bedtime, anchor+30 min)` or on tap. Resumes after refresh via `state.windDown` (deferred `setTimeout(resumeWindDown, 0)` so `window.MyMind` exists; stale after 3 h). Steps 1, 3, 4 auto-advance at time-up; brain dump shows a nudge and waits; "Leave wind-down" clears `windDown` and goes home. Breathing: 4-7-8 orb or gentle in-4/out-6 one tap away, "stop if dizzy" line, JS-driven progress bar (works under reduced motion; orb never scales there). Body scan: whole script always visible, current line highlighted, 50 s per part, voice opt-in (`prefs.voice` or button), "I'm ready" skips. Four can't-sleep branches (mind → one-line dump + one action; body → short scan / leave the bed; not sleepy → dull activity; phone → put it further + 1 min gentle breathing), each ending in "Back to the dark". Tempted: `domain.sleepRemaining` as "about Xh Ym … a window, not a promise", two minutes of in-4/out-6 with a definite end; wind-down from here calls `startWindDown()` which hides the dark overlay. Audio: generated rain/deep, one source at a time, fade over 20 min (`?fade=0.2` URL param shortens it for testing), re-entry reflects the playing sound and never starts a second. Morning: rising tone at wake (dark screen open only), curtains honour-system checkbox AND `UP` (case/space-insensitive) required, "set a normal alarm too" copy, then home + focus on the morning-log input. Escape closes can't-sleep / tempted sheets. `visibilitychange` recomputes.
- `index.html` — `@night` region only: new wind-down header (step name + soft time-left), tempted/can't-sleep sheets with `class="sheet black"`, dark screen with `<form id="alarmBox">` (checkbox + input).
- `app.css` — appended `/* night */ … /* /night */` block (near-black sheets, `.bar`, `.relax-list`, dark controls raised to ≥ 3:1).

### Commands run (results)
- `node --check` on `src/night.js`, `src/app.js`, `src/domain.js`, `src/storage.js`, `sw.js` → all OK.
- `node --test` → tests 60 · pass 60 · fail 0.
- **Browser at 375 px: NOT RUN.** The session hit its usage limit before the preview. Nothing in the card's "Verify" list has been exercised in a browser. Treat every flow as unverified.

### For the next worker (finish Agent 04's verification)
Serve with `python3 -m http.server 8420` from `.claude/worktrees/`, open `/determined-mccarthy-b63d6f/` at 375×812 and run the card's list: full wind-down (check the time-left label, auto-advance on step 1, the brain-dump nudge, settle → auto dark at bedtime; a plan with bedtime a few minutes away makes this quick), both breathing modes, every can't-sleep branch, tempted from home and from dark (confirm the dark overlay hides when going to wind-down), audio start/switch/stop and `?fade=0.2` fade-out, refresh mid-wind-down (resume), morning dismissal (`up`, ` UP `, checkbox required), keyboard Tab/Escape. Likely rough edges to look for: `.bar` sits with a negative top margin under `.breath` — check spacing; `focusEl` sets `tabIndex=-1` on headings; `#windTitle` is re-created inside `stepBox` on each step (the `aria-labelledby` target).
- Files for Agent 05's cache list are unchanged from Agent 02's list. `sw.js` `CACHE` needs a bump (not done; not my file).

---
## 2026-10-14 — Agent 01 (Fable 5.1): Agent 04 verification + merge

Agent 04 ran out of usage budget before its browser pass, so the lead ran the card's verify list on its branch at 375×812 (served from the worktree on :8430): wind-down step 1 with time-left label; refresh mid-wind-down → resumed at the same step with `state.windDown` intact; step 3 both modes (4-7-8 and gentle in-4/out-6) with the dizzy line; body scan with voice/next/skip; settle → "Lights out now" → dark, `windDown` cleared; tempted from dark shows `sleepRemaining` copy and "take me to the wind-down" hides the dark overlay (QA regression fixed); can't-sleep → not sleepy → back to the dark; rain → deep switches the pressed state (one source), silent stops; morning form refuses ` up ` until the curtains box is ticked, then returns home with focus on the log input; Escape closes sheets. Zero console errors. `node --test` 60/60. Fast-forwarded as `8d446f6`.

Not exercised: the 20-min audio fade (code reviewed; `?fade=0.2` hook exists), auto-advance at step time-up, reduced-motion emulation. Agent 05 should cover these.

---
## 2026-10-14 — Agent 05 (Fable 5.1): PWA, integration tests, release verification

### Files changed
- `sw.js` — `CACHE` → `mymind-v3`; precache = the 11-file set from Agent 02's list; `r.ok` guard on both branches (QA #4); cross-origin requests ignored; old caches deleted; relative paths.
- `manifest.webmanifest` — `theme_color`/`background_color` → `#0a0e1a` (matches the page meta and `--bg`).
- `tests/integration.test.js` (new, 6 tests) — precache vs disk, cache tag bumped, `r.ok`/cleanup present, JS ids exist in HTML, no absolute URLs, manifest sanity + theme match.
- `docs/RELEASE_REPORT.md` (new) — full evidence, verdict **NOT READY** (one Major a11y defect, otherwise passing).

### Commands run
- `node --check` on every JS file → OK. `node --test` → tests 66 · pass 66 · fail 0.
- Browser: the built-in pane cannot register service workers (script fetch never reaches the server), so SW/offline/network/audio/keyboard ran in real Chrome 152 via the extension; layout + flows also at 375×812 in the pane. Server `python3 -m http.server 8431` from `~/Documents/MyMind`, stopped afterwards; test localStorage, SW registration and caches removed in both browsers.
- Verified: SW scope `./`, activated, cache `mymind-v3` = exactly the 11 entries; 404 navigation no longer poisons the shell; offline reload serves the full app; zero third-party requests after all flows; `?fade=0.2` fade lifecycle; step-1 auto-advance (via resume path); brain-dump overrun nudge; both breathing modes; body scan; settle → dark; sounds (one source, re-entry safe); four can't-sleep branches; tempted; Escape; morning `UP` + curtains; corrupt storage → setup + `mymind.corrupt`; reset; export → import byte-identical; bad import message; edit plan keeps log; same-morning log replaced; keyboard Tab order + visible focus rings; touch targets ≥ 44 px; contrast measured.

### Defects routed to other owners (repro + smallest fix in `docs/RELEASE_REPORT.md`)
1. **Major · Agent 04 (`src/night.js`)** — overlays (`wind`, `dark`, sheets) do not make `main` inert; Tab/screen readers reach the home controls underneath. Fix: toggle `document.querySelector('main').inert` (and `aria-hidden`) whenever any night overlay is open/closed.
2. **Minor · Agent 02 (`app.css`)** — `--faint #6c6a62` is 3.6:1 on `--bg`, used for 13–15 px text incl. the medical disclaimer. Fix: `--faint: #8a877c` (5.4:1).
3. **Minor · Agent 04** — entering the dark screen inside the wake window rings the alarm immediately (QA #8 still open). Fix: ignore `checkAlarm` for ~60 s after `goDark()` or when dark was entered after the wake time.
4. **Minor · Agent 04** — settle step can read "lights out in 1441 min"; format hours.
5. **Minor · Agent 04** — when the alarm fires inside `goDark()`, focus ends on the clock instead of the curtains checkbox.
6. **Note · Agent 02** — px font sizes ignore the OS text-size preference.

### For Agent 01
- Device install (Android Chrome / iOS Safari) was not possible here; the checklist is in the release report.
- Any fix to `src/*.js` / `app.css` / `index.html` needs `CACHE` bumped to `mymind-v4` in `sw.js` and `PREVIOUS_CACHE` in `tests/integration.test.js` moved to `mymind-v3`.

---
## 2026-10-14 — Agent 01 (Fable 5.1): Agent 05 merged, review defects fixed

Fast-forwarded `fc1f2ea` (sw v3, manifest colours, 6 integration tests, release report). Then `3fc7190`: inert shell under overlays (Major), contrast, alarm grace, hours formatting, alarm focus; cache v4. Open: Note #6 (rem-based sizing) → Agent 02 next round. All five cards have run. `main` ready to push on the owner's approval.

---
## 2026-10-14 — Agent 02 (Fable 5.1), round 2: rem-based type (Release Note #6)

- `app.css` only: every `font-size` (and the body `font:` shorthand) converted from px to rem at a 16 px root — 17px → 1.0625rem, 15px → 0.9375rem, 13px → 0.8125rem, 58px → 3.625rem, etc. Visual sizes at the default root are unchanged (computed: body 17px, h1 24px, label 15px, `#dark .t` 40px). Inputs/selects/buttons stay at 1.0625rem (≥ 1rem, no iOS zoom). Spacing, radii and tap targets untouched. `.topbar` gained `flex-wrap: wrap` because at 200 % root size the title + Progress/Settings nav overflowed a 375 px viewport by ~106 px; at the default size it still renders on one line.
- Commands: `node --test` → 66 pass / 0 fail. Served `python3 -m http.server 8431` from `~/Documents/MyMind` (stopped afterwards); built-in browser at 375×812: setup, home, settings and the dark screen look unchanged; `document.documentElement.style.fontSize='200%'` on home → body 34px, big clock 116px, `scrollWidth` 375 (no horizontal overflow, nav wraps under the title). Test localStorage removed.
- **For Agent 05**: `app.css` changed → bump `CACHE` in `sw.js` (v4 → v5) and move `PREVIOUS_CACHE` in `tests/integration.test.js`. Not edited here.
- Open: none from this round.

---
## 2026-10-14 — Agent 01 (Fable 5.1): QA round 2 fixes
Review in `Review/qa-round2-2026-10-14.md` (0 Blocker · 2 Major · 7 Minor). Fixed: Major 1 — morning check-in before the planned bedtime (02:00, bed at 05:00) now targets the night *before* the one in progress (`domain.logNight`, used by `app.js`); Major 2 — `validatePlan` rejects a wake time that is not after both bedtimes; Minors — alarm LFO no longer spikes volume at t=0, focus after UP waits for `<main>` to leave inert. Cache `mymind-v6`. 73 tests pass. Still open (Minors/Notes): afternoon slept times judged on-time, alarm form under an open sheet, early wind-down settle copy, HOLD silent on home, can't-sleep-from-home "Back to the dark" routing — next round.

## QA round 2 — Minor fixes 3, 6, 7, 8, 9 (2026-10-14, Claude Fable 5.1, branch worktree-agent-aa1cb8b3fbf543121)
Files changed: `src/domain.js` (`isOnTime` now also rejects actuals more than `ON_TIME_EARLY_MAX` = 180 min before the plan — a 15:30 or noon entry stays a logged star, just not bright), `tests/domain.test.js` (+2 tests), `src/night.js` (alarm closes can't-sleep/tempted sheets before showing the wake form; settle step shows "You're early — lights out is at HH:MM…" and the wind sheet switches to `.black` when lights-out is > 60 min away; can't-sleep remembers whether it was opened from the dark screen — from home its back buttons read "Back home" and go home), `src/app.js` + `index.html` (new `#holdInfo` line under the bedtime when tonight's plan equals last night's because last night was logged late — derived by comparing `plannedBedtime` for the two nights), `app.css` (near-black card inside `.sheet.black`).
Commands: `node --check` on src/app.js, night.js, domain.js, storage.js — clean; `node --test` — 75 pass, 0 fail. Browser at 375 px (local server): HOLD line rendered with a seeded late night; can't-sleep from home → "Back home" returns to home with `#dark` hidden; wind-down started 4 h early → settle step shows the early line on the near-black sheet. Finding 6 (alarm under a sheet) verified by code path only: the wake window needs a morning clock and the check ran at 23:50 local, so the live ring was not reproduced.
**Agent 05:** bump `sw.js` CACHE v6 → v7 (index.html, app.css, src/app.js, src/night.js, src/domain.js changed). Not edited here.
Open: none new. Finding 4 (alarm LFO loudness) and 5 (focus after dismiss) untouched.

---

## Agent 02 — v0.3 scroll-guard "Phone setup" screen (2026-10-24)

**Files changed:** `index.html` (new `#phone` section after Settings; `#phoneHomeLink` under the home hero actions; `#phoneSetupBtn` ghost button + note in Settings → Night), `app.css` (`.steps` numbered list, `button.link.inline`), `src/app.js` (`phone` added to `SHELL`; `renderPhone`, `loadPhone`/`savePhone`, wiring; `doReset` also clears the phone key). No night-region or sw.js edits.

**What it does:** Two segments (iPhone / Android) show five short numbered steps each: Downtime / Bedtime mode scheduled from the wind-down start to the wake time, Always Allowed (Phone, Messages, Clock), App Limits / app timers, Sleep Focus / Focus mode, grayscale (Android), charger across the room. The two schedule times come live from domain: `windDownStart(plannedBedtime(plan, log, currentNight(...).nightDate))` and `plan.wake`, recomputed on every render so they track the plan night by night. Footer is honest: these are the phone's own tools; MyMind never sees, blocks or controls other apps and can't tell whether it was set up. Plain text only, no deep links, no images, no external links.

**Persistence (interface note):** `storage.normalizePrefs` whitelists `sound/voice/remind` and drops anything else, so the platform choice and the "Done, it's set up" flag are NOT in `mymind.v2`. They live under a separate localStorage key **`mymind.phone`** = `{ kind: 'ios'|'android'|null, done: boolean }`, read/written only in `src/app.js` with try/catch. Export/import does not carry it (it is a UI convenience, not user data). "Reset my data" clears it. If Agent 03 wants it inside prefs, add `phone: 'ios'|'android'|null` + `phoneDone: boolean` to `normalizePrefs` and I will move it over.

**Links:** Settings → Night → "Set up my phone" (always). Home → "Set up your phone to help at night →" under the primary actions, hidden once Done is tapped; the phone screen has a "Show the home-screen link again" ghost button to undo.

**For Agent 04:** wind-down step 1 (phone away) in `src/night.js` could mention the Phone setup screen in one line ("Downtime set up? Settings → Set up my phone"). Not edited by me.

**For Agent 05:** shipped files changed (`index.html`, `app.css`, `src/app.js`) → bump `sw.js` CACHE v7 → v8. No new files to precache.

**Commands run:**
- `node --check src/app.js` → OK
- `node --test` → 75 pass, 0 fail
- `python3 -m http.server 8434` + built-in browser at 375×812: seeded `mymind.v2` plan (cur 05:30 → goal 00:30, wake 09:00, step 30, start 2026-10-20). Verified: home link present; phone screen opens; iPhone tab shows "from 03:30 to 09:00" (tonight's planned 04:00 − 30 min, wake 09:00) in both the summary line and step 1; Android tab the same; "Done, it's set up" writes `{"kind":"android","done":true}`, Home then hides the link (`phoneHomeLink.hide === true`); Settings "Set up my phone" opens the screen; all controls are native `<button>`s (keyboard-operable), smallest visible target 44.5 px. No animations added (reduced-motion safe by construction). localStorage cleared, viewport reset, server stopped afterwards.
- Screenshots: `/private/tmp/claude-501/-Users-rampenjarla-Documents-MyMind-MyMind/879977b5-e368-49ab-8248-9873c353049d/scratchpad/phone-ios-375.jpg`, `.../phone-android-375.jpg`.

**Open issues:** none known. Menu paths are described generically (iOS Screen Time / Android Digital Wellbeing, Samsung note); they are not deep links and may drift with OS versions.

---
## 2026-10-24 — Agent 01 (Fable 5.1): v0.3 follow-ups
Phone choice/done flag moved from the `mymind.phone` side key into `prefs.phone` / `prefs.phoneDone` (storage normalises them; one-time migration in `app.js` `loadPhone`). Wind-down step 1 now points at Settings → Set up my phone. Cache `mymind-v9`. 76 tests.

---
## 2026-10-25 — Agent 04 (Fable 5.1): live-render review fixes (orb/bar, late start, alarm form)

**Files changed:** `src/night.js`, `app.css` (`/* night */` block only). No `index.html` change.

1. **Breathing orb vs progress bar** — `.bar` lost its `-20px` top margin (`margin: 0 auto 10px`) and `.breath` now has `margin: 40px auto 44px` in the night block. The orb grows to 1.35× (+28 px below its box), so the bar clears it by 16 px in 4-7-8, 20 px in gentle (1.3×) and 44 px under reduced motion (no transform). Applies to the wind-down, can't-sleep "phone" branch and tempted sheet alike (same classes).
2. **Late start / stable footer** — `wd` now carries `lightsOut` and `late`, fixed once by `lightsOutFor(startedAt)` = max(planned bedtime, start + 30 min); `darkAt()` returns it, so "Lights out at HH:MM" no longer drifts earlier on each skip (re-anchoring still only affects the per-step "time left"). When the planned bedtime has already passed at start, `lightsOut = start`, the footer reads "Lights out now — you're past bedtime; tap when ready." on every step, steps keep their normal lengths, and the settle step goes dark the moment it is reached. Rule documented in the timing-model comment at the top of `night.js`. Interface note: storage still persists only `{ startedAt, stepIndex }`, so a resume after refresh recomputes `lightsOut` from the (re-anchored) `startedAt` — it can be earlier than the original only if the user skipped ahead *and* refreshed; acceptable, flag to Agent 03 if a `lightsOut` field in `normalizeWindDown` is wanted.
3. **Alarm form alone** — `ringAlarm()` adds `#dark.waking`; the night CSS hides `.seg`, `.snd-info`, `#cantBtn`, `#temptedDark`, `#darkHome` under it. `goDark()` and `leaveDark()` remove the class (and `leaveDark` now also hides `#alarmBox`). Form unchanged: native checkbox + text input, focus lands on `#curtainsDone`.

**Commands run:** `node --check src/night.js` → OK. `node --test` → 76 pass / 0 fail. Served `python3 -m http.server 8435 --directory ~/Documents/MyMind` (stopped afterwards); built-in browser at 375×812 on the worktree path with a seeded plan whose bedtime was 1 h ago (cur = now−1 h, goal 20:00, wake 09:00, step 30, alarm on). Verified: home "Bedtime was 1 h 1 min ago"; wind-down footer shows the past-bedtime copy on steps 1–3 with "about 3 min left" / 5 min (normal lengths); footer text identical across three skips; 4-7-8 at full "Breathe in"/"Hold" scale measured orb-bottom 463 px vs bar-top 479 px (screenshot `/private/tmp/claude-501/-Users-rampenjarla-Documents-MyMind-MyMind/879977b5-e368-49ab-8248-9873c353049d/scratchpad/breath-478-expanded-375.jpg`); gentle mode gap 20 px; transform cleared gap 44 px (reduced-motion equivalent; media query not emulated); "I'm ready — skip ahead" on step 4 → settle → dark within 300 ms, `windDown` null; alarm fired through the real `checkAlarm` path (wake set to the current minute, waited past the 60 s grace) → `#dark.waking`, sound segment/info/can't-sleep/tempted/home all `display:none`, focus on `curtainsDone` (screenshot `.../scratchpad/alarm-form-alone-375.jpg`); Space + Tab + "up" dismissed it to home with focus on `#slept`; re-entering the dark screen shows all controls again with the form hidden. Console: only the built-in pane's known SW script-fetch errors. localStorage cleared, viewport reset.

**For Agent 05:** `src/night.js` and `app.css` changed → bump `sw.js` CACHE v9 → v10 (and `PREVIOUS_CACHE` in `tests/integration.test.js`). Not edited here.

**Open:** none new. "Phone face-down. Goodnight." stays visible under the clock while the alarm rings (not in the hide list; harmless but could be swapped for a morning line).

---
## 2026-10-25 — Agent 03/04 (Fable 5.1): persist lights-out across refresh; hide goodnight line while ringing

**Files changed:** `src/storage.js` (`normalizeWindDown` → `{ startedAt, stepIndex, lightsOut }`; `lightsOut` must be a finite positive number, anything else/missing → `null`), `src/night.js` (`wdRecord()` writes `lightsOut` at start and on every step change; `resumeWindDown` uses the stored `lightsOut` and only falls back to `lightsOutFor(startedAt)` for old blobs with `lightsOut: null`; `late` derived as `lightsOut <= startedAt`; header + timing-model comment updated), `app.css` (`#dark.waking #darkNote` added to the night block's hide list), `docs/ARCHITECTURE.md` (windDown line), `tests/storage.test.js` (+1 test: lightsOut round-trip, garbage → null; existing round-trip now expects `lightsOut: null`).

**Commands run:** `node --check src/night.js src/storage.js` → OK. `node --test` → 77 pass / 0 fail. Served `python3 -m http.server 8436 --directory ~/Documents/MyMind` (stopped afterwards); built-in browser at 375×812 on the worktree path, seeded plan with bedtime 1 h ahead (23:35). Start wind-down → footer "Lights out at 23:35.", stored `windDown.lightsOut` = 23:35 epoch. To prove resume reads storage rather than recomputing, bumped the stored `lightsOut` to 23:50 and reloaded → footer "Lights out at 23:50." (a recompute would have shown 23:35). "Done, it's across the room" re-anchored `startedAt` but left `lightsOut` unchanged. `#darkNote` computed display: block → `none` with `#dark.waking` → block after removing it. localStorage cleared, viewport reset, server stopped.

**For Agent 05:** `src/night.js`, `src/storage.js`, `app.css` changed → bump `sw.js` CACHE v10 → v11 (and `PREVIOUS_CACHE` in `tests/integration.test.js`). Not edited here.

**Open:** none new.
