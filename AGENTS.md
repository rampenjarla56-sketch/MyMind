# AGENTS.md — rules for every MyMind worker

Read this, then `docs/ARCHITECTURE.md`, then your card in `docs/agents/`. Read `docs/AGENT_HANDOFF.md` before and after your task.

## Product rules (non-negotiable)
- Free. No accounts, logins, payments, ads, analytics, trackers, or third-party SDKs.
- All data stays on the device (`localStorage`, key `mymind.v2`). Nothing is uploaded, ever.
- No runtime network requests beyond the app's own same-origin files. No external fonts, CDNs, or media streams.
- No streaks that can be lost, no shame language, no penalties. A bad night never removes progress.
- No medical claims. Allowed framing: "helps build a consistent bedtime". Keep the see-a-doctor prompt.
- Teen sleep guardrail: if goal bedtime → wake time gives < 8 h of sleep opportunity, say so calmly and never call that schedule a success.
- Honest about limits: the in-app alarm only rings while the page is open; curtains-open is honor-system; sleep onset is a user estimate, never "measured".
- Dark, quiet, one primary action per screen at night. Nothing in the app may itself keep the user up.
- No placeholder buttons, dead navigation, or fake integrations.

## Engineering rules
- Stack: plain HTML/CSS/ES modules, no build step, no dependencies. Tests run with `node --test`. Node ≥ 20.
- All paths relative (`./`) — the site is served from `/MyMind/` on GitHub Pages.
- Time/schedule/persistence logic lives ONLY in `src/domain.js` and `src/storage.js`. UI never re-implements it.
- Dates are local calendar dates (`YYYY-MM-DD` from local `getFullYear/getMonth/getDate`), never `toISOString()`.
- A night is identified by the date of its evening. A morning log entered on date D describes night D−1.
- Countdowns are computed from `Date.now()` on every tick and on `visibilitychange`; never assume a timer kept running.
- Edit only the files your card owns (see `docs/ARCHITECTURE.md` → File ownership). Need something outside? Write the smallest interface request in `docs/AGENT_HANDOFF.md` and stop.
- Bump `CACHE` in `sw.js` (and its asset list) whenever shipped files change — Agent 05 owns this; others note it in the handoff.
- Run the real checks before reporting: `node --test`, `node --check` on every JS file, and open the app in the browser at 375 px. Report what you actually ran. Never claim a test passed that you did not run.
- Git: commit on your own branch or in the shared tree as the lead instructs. Never `reset --hard`, `clean -fdx`, force-push, or push to GitHub. Pushing needs the owner's explicit approval.
- Commit messages end with: `Co-Authored-By: <your model name> <noreply@anthropic.com>`.

## Reporting
Finish by appending to `docs/AGENT_HANDOFF.md`: files changed, commands run with results, interface assumptions, open issues, and what the next worker needs.
