# Agent 02 — Product designer & application shell
**Model:** Claude Opus 5.5 · **Depends on:** Agent 03's `src/domain.js` + `src/storage.js` merged and green

## Mission
Make MyMind look and feel like a finished consumer app — calm, premium, quiet night-sky identity — and own the daytime shell: onboarding, home, progress, settings. Consume the domain; never re-implement time or storage rules.

## Owns (edit freely)
`index.html` (whole file, except the `<!-- @night -->…<!-- /@night -->` region), `app.css`, `src/app.js`.
Read-only: `src/domain.js`, `src/storage.js`, `src/night.js`, `sw.js`, `manifest.webmanifest`.

## Deliverables
1. **Split the single file**: markup stays in `index.html`; CSS → `app.css`; shell JS → `src/app.js` (`<script type="module">`), importing from `./domain.js` and `./storage.js`. Keep the existing night-screen markup inside the `@night` markers for Agent 04. Nothing may regress — every current feature still works after the split.
2. **Design system** in `app.css`: tokens (navy/indigo foundation, warm dim text, one restrained accent), buttons/inputs/cards/segments/dialog, focus-visible rings, `prefers-reduced-motion` (no scaling animations; text still conveys breathing phase), ≥44 px targets, 16 px+ inputs (no iOS zoom), system font stack only.
3. **Onboarding** (`setup`): current bedtime, goal, wake, step (default **15**). Live plan preview via `plannedBedtime`/`nightsRemaining`/`windDownStart`. Call `validatePlan`; show errors inline. Call `sleepOpportunity`+`opportunityCheck` and show the calm < 8 h message (never blocks, never shames; names "8–10 h for teens"). One-line honesty note: in-app alarm only works with the page open — set a normal alarm too.
4. **Home**: tonight's bedtime, wind-down start, countdown from `Date.now()` recomputed every 30 s **and** on `visibilitychange`/`focus`; sleep opportunity for tonight; primary "Start wind-down"; secondary "I'm tempted", "I can't sleep"; morning log card; link to progress and settings. Daytime may scroll.
5. **Progress**: the 14-day chart (`chartData`) and night sky (`skyData`) — accessible labels, times across midnight readable, missing nights visible without a failure score.
6. **Settings**: edit plan (history preserved — assert in UI copy), sound default, voice on/off, reminder, **Reset my data** (confirm dialog), export/import JSON (`storage.exportJSON/importJSON`), privacy text ("everything stays on this phone"), not-medical-advice text, see-a-doctor line.
7. Expose `window.MyMind = { state, save, go, tick }` per `docs/ARCHITECTURE.md`; wire the four night entry points to `night.js` exports.

## Constraints
No external fonts/images/CDNs. No new router or storage layer. No streak/competition UI. Night screens' visual design: set tokens only; Agent 04 owns their behavior.

## Verify (actually run)
`node --check src/app.js`; `node --test tests/` still green; browser at 375×812 and desktop: setup (incl. guardrail and validation), home, progress, settings, reset, export/import, keyboard-only pass, reduced-motion emulation. Screenshots in the report.

## Report
Append to `docs/AGENT_HANDOFF.md`: files, commands + results, screens verified, interface needs for Agents 03/04, known defects. Tell Agent 05 the new file list for `sw.js`.
