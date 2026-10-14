# MyMind — Release report (Agent 05, 2026-10-14)

Scope: the shipped file set at `e674a5b` plus this task's changes (`sw.js`, `manifest.webmanifest`, `tests/integration.test.js`). Everything below was run by me; nothing is taken from other agents' summaries.

## Verdict: NOT READY (one Major accessibility defect; otherwise close)

Reasons, in order:
1. **Major (a11y)** — night overlays do not trap keyboard/screen-reader focus. With the dark screen or wind-down open, every home-screen control stays in the Tab order and in the accessibility tree (`main` is neither `inert` nor `aria-hidden`). A keyboard or VoiceOver user tabbing past "Back home" lands on invisible controls underneath. Owner: Agent 04 (`night.js`) or Agent 02 (`app.js`). Fix is one line per overlay toggle (see handoff).
2. **Minor (a11y, contrast)** — `--faint: #6c6a62` on `--bg #0a0e1a` is **3.6:1** and is used for 13–15 px body text (`.faint`, `.field-note`, wind-down meta, the setup/home medical disclaimer). The card asks for ≥ 4.5:1 on daytime text. `--dim` (7.0:1), primary button (7.8:1) and body text pass.
3. No physical phone was tested (see Device coverage). Install on Android Chrome / iOS Safari is unverified.

Everything else in the card's "Verify" list passed. Once item 1 is fixed (and ideally 2), this is READY from the PWA/privacy/resilience side pending the device checklist.

## Commands run (actual results)

| Command | Result |
|---|---|
| `node --check` on `sw.js`, `src/app.js`, `src/domain.js`, `src/storage.js`, `src/night.js`, `tests/*.test.js` | all OK |
| `node --test` (Node v24.19.0) | tests 66 · suites 13 · pass 66 · fail 0 (60 existing + 6 new integration) |
| `python3 -m http.server 8431 --directory ~/Documents/MyMind` + browser at `/MyMind/.claude/worktrees/agent-a4f3a59c4de3e6bc6/` | served; stopped after testing |

### New integration tests (`tests/integration.test.js`)
- sw precache list ⊇ every shipped file on disk (`index.html`, `app.css`, manifest, every `src/*.js`, every `icons/*.png`), all relative, no duplicates, each exists.
- `CACHE` matches `mymind-vN`, ≠ `mymind-v2`, and N increased.
- sw caches only `r.ok`, deletes old caches, `skipWaiting` + `clients.claim`.
- every id looked up via `getElementById`/`$('…')` in `src/*.js` exists in `index.html` (ids created in JS template strings are allowed).
- no absolute `http(s)://` in `index.html`, `app.css`, `sw.js`, manifest, `src/*.js`.
- manifest: `start_url`/`scope` `./`, standalone, icons relative + present, a maskable icon, `theme_color` equals the page `<meta name="theme-color">`.

## Changes shipped by this task
- `sw.js`: `CACHE` → `mymind-v3`; precache = `./`, `./index.html`, `./app.css`, `./src/app.js`, `./src/domain.js`, `./src/storage.js`, `./src/night.js`, `./manifest.webmanifest`, three icons. Network-first navigations, cache-first assets, `r.ok` guard on both branches (QA #4), cross-origin requests ignored, old caches deleted on activate, `skipWaiting` + `clients.claim`, all paths relative.
- `manifest.webmanifest`: `theme_color` and `background_color` `#0b0d14` → `#0a0e1a` to match the page meta and `--bg`.

## PWA / offline (Chrome 152 desktop via the Claude-in-Chrome extension)
The desktop app's built-in browser pane cannot register service workers (the script fetch never reaches the server: "An unknown error occurred when fetching the script"), so SW checks ran in the user's real Chrome.
- Registration: scope `…/agent-a4f3a59c4de3e6bc6/` (= `./`), state `activated`, page controlled.
- Cache `mymind-v3` contains exactly the 11 precache entries; no other cache present.
- **404 poisoning (QA #4) fixed**: navigating to `…/bogus-page` (404) leaves `caches.match('./index.html')` at status 200 with the real shell.
- **Offline reload**: server killed (`curl` → connection refused), page reloaded → full shell rendered (`body` background applied, modules loaded, `window.MyMind` present, setup screen visible). Server restarted afterwards.
- Old-cache deletion on activate: covered by code + integration test only (would need a second SW version to observe live).
- `?fade=0.2` loaded through the SW with query string: served correctly (navigations are network-first and keyed to `./index.html`).

## Privacy
- Network list after exercising setup, home, progress, settings, full wind-down, dark + sounds, tempted, four can't-sleep branches, morning alarm, export/import/reset: only same-origin files (`index.html`, `app.css`, four `src/*.js`, manifest, `icon-192.png`). Zero `https://` requests. (The `chrome-extension://` entries in the raw list are the user's own Chrome extensions injecting into every page, not the app.)
- Code grep: no absolute URLs (test enforces it). Permissions: only `Notification` (opt-in via the reminder toggle), Web Audio and `speechSynthesis` after a tap, optional `requestFullscreen` wrapped in try/catch.
- Observation (not a defect): on a shared origin such as `localhost:8431`, other apps' localStorage keys sit next to `mymind.*`; on GitHub Pages the origin is shared with every other `github.io` project of the same account. Nothing of ours reads foreign keys.

## Resilience
- Corrupt storage: `mymind.v2 = 'garbage'` → reload → setup screen, `mymind.corrupt === 'garbage'`, no console error; v2 key left as-is until the next save (as documented).
- Reset: dialog opens (`<dialog>.open === true`), "Yes, erase" → `mymind.v2` removed, fresh state, setup shown.
- Export → reset → import (through the real `<input type=file>` change handler): `exportJSON()` byte-identical after import, status "Imported: 1 logged night and your plan."
- Bad import (`{nope`): "Not imported: That file is not valid JSON." and state untouched.
- Edit plan: note + Cancel shown, saving keeps `log` (1 entry before and after).
- Morning log twice in one morning: one entry, replaced (01:10 → 01:40).
- Validation: goal later than current → inline error, focus moves to `goal`. Guardrail at goal 02:00 / wake 07:00: "About 5 h … stays a work in progress, not a win" in warm text (not red), never blocks.

## Night flows (the items nobody had exercised)
- **Audio fade** (`?fade=0.2`): tapping Rain (real click → `AudioContext` state `running`) shows "fades to silence over 12 s"; 14 s later the state is "Faded out. Tap a sound to start it again." with Silent pressed. Rain → Deep → Silent switches keep exactly one pressed. Re-entering the dark screen while Rain plays (via tempted → "Put the phone down", and via can't-sleep → "Back to the dark") keeps Rain pressed and the same message: no second source. Audible level was not judged (no listener); the gain ramp was reviewed: 0 → level in ≤ 4 s, hold, exponential to ~0 at `FADE_MIN`.
- **Wind-down auto-advance**: step 1 anchored 3 min 1 s in the past, reload → resumed directly on step 2 "Empty your head" with "about 7 min left" (the resume path calls the same `windTick` that auto-advances live). Brain dump at 10 min 1 s: "time is up for this step", `.overrun` nudge visible, **does not** auto-advance (by design). Breathing step 4-7-8 (orb `scale(1.35)`, bar 36 % after 1.5 s, "Round 1 of 12"), gentle mode switch resets the orb and flips `aria-pressed`. Body scan highlights one `<li>` at a time, "Next part" advances. Settle → "Lights out now" → dark, `state.windDown === null`, wind sheet hidden.
- **Tempted** from dark: `sleepRemaining` copy, focus on the title. **Can't sleep**: all four branches render (`nightDump`/`nightAction`, body list, text, `cantBr` breathing) and "Back to the dark" returns to the dark screen each time.
- **Escape** closes can't-sleep and tempted; focus returns to the dark clock when the dark screen is underneath.
- **Morning**: with wake = now, entering dark fires the alarm box at once (QA #8 still present, see defects); ` uP ` without the curtains box → "Tick the curtains box first"; ticking it → home with focus on the morning-log input.
- Countdown recomputed on synthetic `visibilitychange` and `focus` without error.

## Accessibility
Pass:
- Keyboard: real Tab presses walk home in a sensible order; every control shows the 2 px indigo `:focus-visible` ring (`rgb(127,140,255)`), dark screen uses a dimmer ring. Enter/Escape work on sheets. Headings/labels: each screen has an `h1` with `aria-labelledby`, time inputs are labelled, SVGs have `role="img"` + title/desc + a text list fallback, live regions on countdown/errors/status.
- Touch targets: primary 54 px, quiet 54 px, ghost 54 px, nav links 45 px, inputs 52 px, dark-screen buttons 54/45 px — all ≥ 44 px.
- Contrast: body text 15:1, `--dim` 7.0:1, primary button text 7.8:1, dark-screen controls 3.9:1 (ghost text) and 3.0:1 (note text) on black — meets the ≥ 3:1 night rule. The faint clock (2.4:1) is deliberately dim.
- Reduced motion: CSS blocks at `app.css` lines 235 and 306; JS checks `matchMedia` and skips the orb scale while the text + bar still show phase. Not emulated live (neither browser tool exposes the media query); logic reviewed.
- Breathing stoppable ("Done breathing" / mode switch / Leave wind-down all call `stop()`).
- 375 px: no horizontal overflow (`scrollWidth === 375`), screenshots of home, breathing and dark look as designed.

Fail / gaps:
- **Major**: no focus trap on overlays (above).
- **Minor**: `--faint` 3.6:1 (above).
- **Minor**: font sizes are fixed `px`, so the OS/browser "text size" preference (root `font-size`) has no effect; only page zoom scales the UI. Verified by setting root `font-size: 200%` — body stayed 18 px. Browser zoom to 200 % was not run.
- **Minor**: when the alarm fires on entering the dark screen, `goDark()` moves focus to the clock after `ringAlarm()` set it on the curtains checkbox.
- VoiceOver on a real device: not run.

## Defects routed to other owners (also in `docs/AGENT_HANDOFF.md`)
| # | Sev | Where | Repro | Smallest fix |
|---|---|---|---|---|
| 1 | Major | `src/night.js` (Agent 04) | Open dark or wind-down, press Tab past the last button → focus enters home controls underneath; `document.querySelector('main').inert === false` | In `sheet()`, `goDark()`, `leaveDark()`/`finishWind()`: `document.querySelector('main').inert = anyOverlayOpen()`; also `aria-hidden` for older Safari |
| 2 | Minor | `app.css` (Agent 02) | `.faint` on `--bg` = 3.6:1 | `--faint: #8a877c` (5.4:1 on `--bg`, ≥ 4.5:1 on `--card`) |
| 3 | Minor | `src/night.js` (Agent 04) | wake = now, open dark → alarm fires immediately (QA #8) | In `goDark()` record `enteredAt`; in `checkAlarm()` skip if `Date.now() - enteredAt < 60_000` or if dark was entered inside the wake window |
| 4 | Minor | `src/night.js` (Agent 04) | settle step with bedtime far away shows "lights out in 1441 min" | route `fmtMin` through an h/min formatter for ≥ 60 |
| 5 | Minor | `src/night.js` (Agent 04) | alarm fires during `goDark()` → focus ends on `#darkClock`, not the curtains checkbox | call `checkAlarm()` after `focusEl($('darkClock'))`, or skip the clock focus when `alarmBox` is visible |
| 6 | Note | `app.css` (Agent 02) | px font sizes ignore the user's text-size setting | consider `rem` on `body`/`.big`/buttons |

## Device coverage
- Done: Chrome 152 on macOS (desktop window; SW, offline, audio, keyboard, network) and the Claude desktop built-in browser pane at 375×812 (layout, flows, screenshots). Desktop width 1512 px in Chrome.
- **Not done: no physical phone or tablet was tested.** Not done: Android Chrome install, iOS Safari "Add to Home Screen", standalone launch, iOS Web Audio behaviour on lock, VoiceOver/TalkBack, reduced-motion OS setting, 200 % browser zoom.

Checklist for the owner on a real device (served from GitHub Pages at `/MyMind/`):
- [ ] Android Chrome: install prompt or menu "Install app"; launches standalone; icon correct (maskable)
- [ ] iOS Safari: Share → Add to Home Screen; launches without browser chrome; status bar black-translucent
- [ ] Airplane mode after one load → app opens, plan and log still there
- [ ] Rain/Deep plays from a tap; what happens on lock (expect it to stop; copy says so)
- [ ] Morning alarm rings with the page open at wake time; "UP" + curtains dismisses
- [ ] VoiceOver/TalkBack: time inputs announce labels; dark-screen buttons announce; overlays do not leak the home screen (blocked by defect 1)
- [ ] OS reduced-motion on: orb does not scale, text + bar still show phase
- [ ] Text size at largest OS setting: still usable (expect no change, defect 6)

## Unmet requirements (card)
- Deliverable 5 (a11y): focus trap on overlays (Major), `--faint` contrast (Minor), 200 % text scaling not verified.
- Deliverable 7: install on Android/iOS not possible here; checklist above.

---
## Lead addendum — 2026-10-14 (after the review above)

Commit `3fc7190` addresses the reviewer's findings: **Major #1 fixed** (`<main>` is now `inert` + `aria-hidden` whenever any night overlay is open — verified in the browser: inert false → true on opening the wind-down → false on leaving); Minors #2 (`--faint` → `#8a877c`, 5.4:1), #3 (alarm ignores the first 60 s after entering the dark screen), #4 (settle countdown formats hours), #5 (alarm box focuses the curtains checkbox) fixed. Note #6 (px font sizes vs OS text-size preference) left open for Agent 02. `CACHE` → `mymind-v4`; integration test updated. `node --test`: 66 pass.

**Lead verdict: READY for the owner's own phone (dogfood).** Not yet verified on a physical Android or iOS device — the reviewer's device checklist above still applies before any wider sharing.
