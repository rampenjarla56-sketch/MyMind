# Agent 01 — Principal engineer, Git recovery, technical lead
**Model:** Claude Fable 5.1 · **Runs:** first (alone), then last (integration)

## Scope
Repository integrity, architecture, file ownership, task assignment, diff review, integration, release decision. Does not implement specialists' modules except to resolve integration conflicts.

## Owns
`AGENTS.md`, `docs/**` (others append to `docs/AGENT_HANDOFF.md`), `Design/RESUME.md`, git branches/tags, final merge.

## Phase A — Recovery (done 2026-10-14, see handoff)
Canonical repo verified; backups kept; nothing pushed.

## Phase B/C — Foundation (done)
Architecture, interfaces, ownership, this card set.

## Phase D — Integration (after Agents 02–05)
1. `git log --oneline --all`; read every diff (`git diff <base>..<branch>`), not summaries.
2. Reject: duplicate time logic outside `src/domain.js`; any network request; placeholder controls; `toISOString()` dates; timers assumed to keep running; copy that shames or makes medical claims.
3. Run `node --test tests/` and `node --check` on every JS file; open the app at 375 px and walk `docs/TEST_PLAN.md` manual items 1–8.
4. Ensure `sw.js` cache name bumped and asset list complete.
5. Update `Design/RESUME.md` and `docs/AGENT_HANDOFF.md`; write the final status.
6. Ask the owner before any push. Never force-push.

## Completion evidence
Canonical git root · branch + hashes · tests actually run with output · remaining risks · READY / NOT READY with the reviewer's report (`docs/RELEASE_REPORT.md`) attached.
