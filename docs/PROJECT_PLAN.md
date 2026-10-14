# MyMind — Project plan

## Scope
Turn the working single-file MVP (`index.html`, 465 lines, feature-complete v0.2) into a complete, tested, installable, offline-first bedtime coach, without a rewrite. Preserve every feature that already works. Add what the master brief requires and the MVP lacks.

## Where we are (recovered 2026-10-14)
Working today: plan builder, tonight's bedtime + countdown, 5-step wind-down, generated rain/deep-noise with 20-min fade, voice body scan, lights-out dark screen, "I can't sleep" triage, "I'm tempted" screen with sleep-remaining math, wake alarm with "UP" task, morning log, 14-day chart, night sky, local reminder, PWA manifest + service worker + icons. QA review in `Review/qa-2026-10-14.md` (all Majors fixed).

Gaps against the master brief:
1. No automated tests; domain logic is tangled with UI in one file.
2. No sleep-opportunity guardrail (< 8 h warning); default step is 30 min, brief wants 15.
3. Progression advances purely by calendar day; no "hold a step" after a very late night.
4. Wind-down steps have no timing plan that adds up to 30 minutes.
5. No gentle alternative to 4-7-8 breathing; no "stop if dizzy" text.
6. Countdown ticks on `setInterval` only; no `visibilitychange` recompute.
7. No settings screen (edit plan exists; no sound prefs, data reset, export/import, privacy text).
8. No reduced-motion support; accessibility unaudited (focus states, labels, keyboard).
9. Schema is v1 and untyped; no validation/migration layer.
10. Storage key is `mymind.v1`; brain-dump text is discarded (copy now says so honestly).

## Milestones (in dependency order)
- **M0 — Recovery & foundation (Agent 01, done):** git history recovered, backups kept, docs + cards written, module split defined.
- **M1 — Domain engine (Agent 03):** `src/domain.js`, `src/storage.js`, `tests/`. Pure, tested, no DOM. v1→v2 migration.
- **M2 — Shell & design (Agent 02):** split `index.html` into shell + `app.css` + `src/app.js`; onboarding with plan preview + guardrail; home; progress; settings. Consumes M1.
- **M3 — Night experience (Agent 04):** `src/night.js`: timed 30-min wind-down, breathing + alternative, body scan, can't-sleep, tempted, lights-out + audio, morning wake. Consumes M1 + M2 design tokens.
- **M4 — PWA, a11y, release (Agent 05):** `sw.js`/manifest for the new file set, offline verification, accessibility audit, integration tests, `docs/RELEASE_REPORT.md`.
- **M5 — Integration (Agent 01):** review diffs, run full suite, update RESUME, ask owner before pushing.

M2 and M3 may run in parallel only on separate branches/worktrees; otherwise M1 → M2 → M3 → M4 strictly in sequence.

## Acceptance criteria
The 16 criteria in the master brief, §16. In short: valid repo with recovered history; `node --test` green (failures disclosed); setup → plan → countdown correct across midnight; guardrail works; full wind-down, can't-sleep, tempted, lights-out + fade, morning "UP" all work; log → chart → sky persist; offline after caching; installable; keyboard/contrast/reduced-motion checked; no dead controls; independent reviewer report filed.

## Out of scope for now
Native iOS port, push notifications, parent-share, accounts of any kind, marketing execution (drafts exist in `Design/marketing/`, need owner approval).
