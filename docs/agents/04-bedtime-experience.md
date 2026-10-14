# Agent 04 — Guided bedtime, wind-down & lights-out experience
**Model:** Claude Sonnet 5.5 · **Depends on:** Agent 03 (domain) and Agent 02 (shell split + tokens) merged

## Mission
Own the screens that matter at 1 a.m. One purpose and one obvious next action per screen; dark, quiet, nothing that keeps the user looking.

## Owns
`src/night.js` (+ optional `src/audio.js`); the `<!-- @night -->…<!-- /@night -->` region of `index.html`; an appended `/* night */` block in `app.css`.
Read-only: everything else. Need a token or a shell hook? Request it in `docs/AGENT_HANDOFF.md`.

## Deliverables
1. **Wind-down, 30 min, timed**: phone-away 3 · brain-dump 7 · breathing 5 · body scan 8 · settle 7 (see architecture). Show a minimal progress indicator and a soft "time left in this step"; steps may be finished early; the settle step absorbs the remainder and auto-transitions to lights-out at the planned bedtime (from `MyMind.state` + `domain.plannedBedtime`). Resumable after refresh (persist `{startedAt, stepIndex}` in `prefs.windDown`). Exit affordance: a dim "Leave wind-down" that returns home.
2. **Breathing**: 4-7-8 orb (in/hold/out text + scale) and a **gentle alternative** (in 4 / out 6, no hold) one tap away. Copy: "Stop if it feels uncomfortable or you get dizzy — just breathe normally." Reduced-motion: no scaling, phase text + a simple progress bar.
3. **Body scan**: keep the current script; optional voice via `speechSynthesis` (opt-in, never required); written version always visible; "I'm ready" skips.
4. **I can't sleep**: four branches (racing mind → one-line dump + one action for tomorrow; restless body → short scan/leave-the-bed; not sleepy → dull activity in dim light, back when sleepy; wanting phone → put it further + short breathing). Each ends with one button back to dark. Stay near-black.
5. **I'm tempted**: `domain.sleepRemaining(now, wake)` shown as "about Xh Ym of possible sleep — a window, not a promise"; urge-passing breathing with a definite end (~2 min); "put the phone back"; buttons: lights out / wind-down. Opening the wind-down from here must hide the dark overlay (regression from QA).
6. **Lights-out + audio**: near-black with faint clock; rain / deep / silent; Web Audio generated noise; fade to silence over ~20 min; starts only on tap; stop/switch without double audio; survives re-entry; honest note that audio stops if the phone locks (platform-dependent).
7. **Morning**: at wake time (page open only), gentle rising tone; prompt to open curtains (honor system — never claim verification); confirm checkbox + type `UP` (case/space-insensitive) to dismiss; then morning log prompt. Copy includes "set a normal alarm too".
8. All of the above keyboard-operable with labels; dark-screen controls perceivable (dim but ≥ 3:1 on black).

## Constraints
No second scheduling engine, storage layer, or router — use `window.MyMind` and `domain`. No video, feeds, journals, reward animations. No paid voice APIs.

## Verify (actually run)
Full wind-down at 375 px; both breathing modes; every can't-sleep branch; tempted from home and from dark; audio start/switch/stop/fade (shorten fade via a debug flag during testing, restore after); refresh mid-wind-down; morning dismissal with `up`, ` UP `; reduced-motion; keyboard. `node --check src/night.js`; `node --test tests/` unaffected.

## Report
Append to `docs/AGENT_HANDOFF.md`: interactions actually tested, browser limits observed, tokens/hooks you needed, files for Agent 05's cache list.
