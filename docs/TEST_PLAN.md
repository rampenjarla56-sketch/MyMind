# MyMind — Test plan

## Automated (`node --test tests/`)
Owner: Agent 03 for domain/storage, Agent 05 for integration.

### domain.test.js
- parseClock: valid, `24:00`, `7:5`, empty, garbage → null.
- nightMin ordering: 23:00 < 00:30 < 05:30.
- dayDiff/addDays across month and year boundaries; DST days.
- plannedBedtime: 05:30 → 00:30 by 30 (expect 10 nights, lands exactly on 00:30); by 15 and 45; final short step; day index beyond goal stays at goal; start date in the future → cur.
- plannedBedtime never moves later; never crosses noon boundary wrongly (goal 23:00 from cur 01:00).
- HOLD rule: late night (actual > planned + 60) holds next night; two late nights hold twice; on-time night resumes.
- validatePlan: goal later than current → error; equal → ok; empty → error; step 20 → error.
- sleepOpportunity: 00:30→09:00 = 510; 02:00→07:00 = 300 (warn); 23:00→07:00 = 480 (ok, boundary).
- sleepRemaining: 01:20→09:00 = 460; 23:00→09:00 = 600; 13:00→09:00 = 1200.
- isOnTime grace boundary (exactly +30 → true, +31 → false).
- chartData: 14 rows, missing nights `actual:null`, later-than-planned night `onTime:false`, historical plan change keeps old rows' `planned`.
- skyData: count equals log length; bright count; adding a late night never decrements either.

### storage.test.js (mock `localStorage` with a Map)
- fresh load → `{v:2, plan:null, log:[], prefs}`.
- v1 blob migrates: fields renamed, `onTime` computed for legacy entries, old key left untouched.
- corrupt JSON → fresh state, blob preserved under `mymind.corrupt`.
- parseable but missing `log` → repaired.
- save→load round-trip; same-date log replaces; export→import round-trip; import of garbage rejected.

### integration (Agent 05)
- `sw.js` asset list matches files on disk; cache name differs from last tag.
- `index.html` references only relative paths; no `http(s)://` except the GitHub link in README.
- Every `id` referenced in JS exists in HTML.

## Manual (browser, 375×812 and desktop)
Run with `python3 -m http.server 8420` from the repo's PARENT dir, open `http://localhost:8420/MyMind/`.
1. First run → setup; try goal later than current, empty field, 02:00→07:00 (guardrail text), normal plan.
2. Home: bedtime, wind-down start, countdown; background the tab 2 min, return → countdown correct.
3. Full wind-down end to end; skip breathing via alternative; exit mid-way and resume.
4. Lights-out: rain/deep/silent; volume audibly fades; stop mid-fade; re-enter dark screen — no double audio.
5. Can't-sleep: all four branches return to dark. Tempted: from home and from dark; "take me to wind-down" shows wind-down (no black overlay).
6. Morning: set wake = now+1 min, keep page open → alarm; `up`, ` UP ` accepted; home shows.
7. Log 01:10 → chart dot + star; log again same morning → replaced, not duplicated.
8. Settings: change goal → history intact; reset → confirm → fresh; export/import.
9. Keyboard only: tab through setup/home/settings, visible focus, Enter activates. VoiceOver labels on time inputs and dark-screen buttons.
10. `prefers-reduced-motion`: breathing circle still conveys phase (text), no scaling.
11. Offline: load once, kill server, reload → app shell loads; log a night; restart server → still there.
12. Install: Android Chrome "Add to Home screen"; iOS Safari share → Add to Home Screen; launches standalone.
