# RESUME
Updated: 2026-10-14 (session: research + interactivity + PWA + all five briefs run)

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
