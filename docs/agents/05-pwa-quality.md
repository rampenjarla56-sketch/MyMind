# Agent 05 — PWA engineer, accessibility reviewer & release verifier
**Model:** Claude Opus 5.5 · **Depends on:** Agents 02–04 merged · **Runs:** last before the lead's integration

## Mission
Make MyMind a genuine installable offline-first app, then independently challenge the whole product. Evidence only — do not accept other agents' summaries.

## Owns
`sw.js`, `manifest.webmanifest`, `icons/`, `tests/integration.test.js`, `docs/RELEASE_REPORT.md`. May fix defects inside these; defects elsewhere → document with repro and the smallest proposed change in `docs/AGENT_HANDOFF.md` (the lead applies or reassigns). Do not rewrite other modules.

## Deliverables
1. **PWA**: precache list = every shipped file (`index.html`, `app.css`, `src/*.js`, manifest, icons); cache name bumped (`mymind-vN`); network-first navigations, cache-first assets, cache only `r.ok`; old caches deleted on activate; `skipWaiting`+`clients.claim`; all paths relative (`/MyMind/` subpath). Manifest: name, short_name, start_url `./`, scope `./`, standalone, icons incl. maskable, theme/background colors matching tokens.
2. **Background honesty**: confirm countdown recomputes on `visibilitychange`; alarm/reminder copy says page-open-only + set a normal alarm; no claim of verifying curtains; sleep onset labelled as an estimate.
3. **Privacy**: zero network requests beyond same-origin files (check with the browser's network panel after exercising every flow); no external domains in code; no permissions beyond Notification (opt-in).
4. **Resilience**: corrupt/missing storage → graceful; reset works; export/import round-trips; nothing lost when editing a plan.
5. **Accessibility audit**: keyboard operability + visible focus on every screen; semantic headings/labels; contrast (daytime ≥ 4.5:1 text; dark screen controls ≥ 3:1); touch targets ≥ 44 px; text scaling at 200 %; reduced-motion honored; breathing stoppable; low-light controls perceivable; error messages meaningful.
6. **Integration tests** (`node --test`): sw asset list vs disk; cache name ≠ previous tag; HTML ids referenced by JS exist; no absolute URLs.
7. **End-to-end**: walk `docs/TEST_PLAN.md` manual items 1–12 at 375 px and desktop; offline reload after first load; install on Android Chrome and iOS Safari if devices available — otherwise say so and leave a checklist.
8. **`docs/RELEASE_REPORT.md`**: commands + results, PWA/offline/privacy/a11y findings, coverage actually done, open issues with severity, unmet requirements, **READY / NOT READY** with reasons.

## Constraints
No new framework, backend, or dependency. Don't mark READY because the home page renders.

## Verify (actually run)
`node --test` · browser Application panel: SW active, correct scope, cache contents · offline reload · network panel empty of third parties.

## Report
`docs/RELEASE_REPORT.md` + a short entry in `docs/AGENT_HANDOFF.md` listing defects routed to other owners.
