# Architecture
- `App/index.html`: single-file PWA-style app (HTML+CSS+JS). State in `localStorage` key `mymind.v1`:
  `{ currentBed, goalBed, wake, startDate, stepMin, log: [{date, sleptAt, note}] }`.
- Plan: `bedtimeFor(dayIndex) = max(goal, start - dayIndex*stepMin)` (wrapping past midnight handled in minutes).
- Wind-down: a linear list of steps; breathing uses CSS animation, timed by JS.
- Later: split into modules, add service worker + manifest, or port to SwiftUI.
