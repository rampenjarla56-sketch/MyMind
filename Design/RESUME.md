# RESUME
Updated: 2026-10-24

## Latest (v0.3 shipped)
- `main` at `01611bd`, pushed; cache `mymind-v9`; 76 tests. New **Phone setup** screen (iPhone Screen Time Downtime / Android Digital Wellbeing Bedtime mode, live downtime window from the plan), linked from Settings, Home (until marked done) and wind-down step 1. Phone choice lives in `prefs.phone/phoneDone`.
- QA round 2 (`Review/qa-round2-2026-10-14.md`): all Majors and Minors closed. Open Notes only: star hash collisions (cosmetic), silent storage-write failure, three wording softenings.
- Still untested on a physical phone. Next real step: owner installs from Pages and logs a night; then the "Earlier" rename decision and marketing drafts (`Design/marketing/`).
- Local preview: `python3 -m http.server 8430 --directory ~/Documents/MyMind` → `/MyMind/` (the app's preview tool serves a stale folder).


## Latest (M1–M5 complete — all five agents ran, 2026-10-14)
- `main` at `3fc7190`: domain engine + storage (Agent 03, tests), shell split with design system/onboarding/progress/settings (Agent 02), timed resumable night experience (Agent 04), PWA cache v4 + integration tests + `docs/RELEASE_REPORT.md` (Agent 05), lead fixes for the review's Major (inert overlays) and minors. `node --test` → 66 pass.
- Verdict: READY for the owner's own phone; no physical-device test yet (checklist in the release report). Open minor: px→rem sizing for OS text-size (Agent 02).
- Commits are local, not pushed — awaiting owner approval. Preview tool serves a stale folder; use `python3 -m http.server 8430 --directory ~/Documents/MyMind` and open `/MyMind/`.

## Earlier (M0 — Agent 01)
- Canonical repo is now `~/Documents/MyMind/MyMind` (moved from the session's temp folder; git history recovered via bundle, tag `recovery-2026-10-14`; backups kept beside it). Commits `b89a8a5`, `60b503a`, `6dcf780` are local only — **not pushed**.
- New process: `AGENTS.md`, `docs/PROJECT_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md`, `docs/AGENT_HANDOFF.md`, cards in `docs/agents/01..05`. The old `Design/briefs/` are historical.
- Next: run Agent 03 (domain + tests) → 02 (shell split) → 04 (night) → 05 (PWA/a11y/release) → 01 integration. Session cards were created for 03/02/04/05.

## Previous session (features)

## State
- `index.html` (repo root) is the single source of truth; `App/` removed. Installable PWA: `manifest.webmanifest`, offline `sw.js` (cache `mymind-v2`, network-first navigations, only caches `r.ok` responses), generated `icons/`.
- New features this session: "I'm tempted" panic screen (real sleep math + breathing), why-am-I-awake triage (replaces the old alert), night-sky companion (stars per logged night, moon fills with on-time nights, never resets), generated sleep sounds (rain/deep noise, 20-min fade), optional voice-guided body scan (speechSynthesis), honest 14-day chart, wake alarm with get-out-of-bed "UP" task (page-open only; UI says set a backup alarm), "remind me 10 min before wind-down" local notification (best-effort, on-device).
- All five briefs executed: content pass (spoken-friendly body scan, sourced claims in `DesignNotes/Research.md` → "Content sources"), UX polish (dimmer night primaries, tap targets, no night scrolling, overscroll off), engineering (reminder, timer-leak fixes, `DesignNotes/Compatibility.md`), marketing drafts (`Design/marketing/` — NOT posted anywhere), QA (`Review/qa-2026-10-14.md`).
- QA Majors all fixed after the review: local-time dates (was UTC), plan validation (empty fields, goal-later-than-current rejected with message), SW no longer caches 404s as the shell. Also fixed: duplicate same-day logs now replace, missing-log-array tolerated, alarm doesn't fire instantly inside the wake window, honest brain-dump copy, disclaimer on first-run setup screen.
- `DesignNotes/Research.md`: competitor research (9 apps, 38 sources). Key gaps: teen bedtime-shifting is an unowned niche; incumbents $40–100/yr with billing complaints; engagement-heavy design backfires.

## Open decisions (owner)
- Rename? Marketing recommends "Earlier" ("A little earlier every night") — "MyMind" collides with mymind.com. Fallback: keep MyMind, tagline "One bedtime. Tonight."
- Push this session's commits to GitHub (Pages redeploy) — awaiting owner approval.
- Marketing drafts in `Design/marketing/` await approval before any filming/posting.

## Known issues (minor, from Review/qa-2026-10-14.md)
- Afternoon countdown can read oddly ("Bedtime was N min ago") long before evening.
- Wind-down has no exit button once started (arguably intentional; revisit after real use).
- Moon crescent mask can faintly overlap nearby stars (cosmetic).
- iOS Safari tab: no notifications, localStorage evicted after 7 days unused — installing to Home Screen mitigates (see `DesignNotes/Compatibility.md`).

## Next
1. Owner dogfoods tonight (install from GitHub Pages after push); log what fails, fix that first (Roadmap v0.1).
2. Decide on rename + approve/edit marketing drafts.
3. v0.3 scroll-guard (Screen Time / Digital Wellbeing guide) still unstarted.
