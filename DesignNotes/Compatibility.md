# Compatibility

What actually works where. "PWA" = added to Home Screen / installed. Claims are from platform knowledge as of early 2026; anything marked *verify on device* has not been confirmed on real hardware.

| Feature | iOS Safari (tab) | iOS (installed PWA) | Android Chrome | Desktop (Chrome/Edge/Safari) |
|---|---|---|---|---|
| Install | Manual only: Share → Add to Home Screen, no prompt API | n/a (that *is* the install) | Install prompt + menu entry; works | Chrome/Edge: omnibox install. macOS Safari: Add to Dock. Firefox: no install |
| Offline (sw.js cache) | Works; storage is small and evictable | Works; most reliable on iOS | Works | Works |
| Notification API | **Absent** (`window.Notification` undefined) — our code falls back to the in-page highlight silently | Permission + SW notifications exist since iOS 16.4, built around Web Push; whether `showNotification` without a push event displays: *verify on device* | Works, but only via `registration.showNotification` — `new Notification()` throws (we call the SW path first for this reason) | Works (both paths) |
| Web Audio in background / locked screen | Suspends on lock or tab switch; the 20-min fade will not finish face-down-and-locked | Same suspension behavior expected; *verify on device* | Often keeps playing briefly, then suspended; varies by OEM battery policy — *verify on device* | Keeps playing in background tabs |
| speechSynthesis | Works after a user gesture (our voice button is one); voice quality varies | Same as tab | Works; known to stall on long utterances (ours are short) and pause when backgrounded | Works |
| requestFullscreen | **Not supported on iPhone** for non-video elements — dark screen just isn't fullscreen (we catch and ignore). iPad: works | Moot — standalone display has no browser chrome anyway | Works | Works |
| Wake alarm (page-open only) | Only while screen is on and page frontmost; the OS lock suspends all JS | Same — install does not grant background execution | Same; timers also throttled in background tabs | Works if the machine doesn't sleep |
| localStorage persistence | **ITP deletes script-writable storage after 7 days of Safari non-use of the site** — the whole log can vanish | Exempt from the 7-day cap; storage is per-install and stable | Persists; evictable only under storage pressure | Persists; same pressure caveat |

## Mitigations (one line each)

- **Install:** keep the "works best added to your Home Screen" hint (iOS especially — it upgrades three rows above at once).
- **Offline:** already handled — versioned cache, bump `mymind-vN` on every ship so stale shells get replaced.
- **Notifications:** already handled — reminder degrades to the in-page countdown highlight; never advertise notifications as guaranteed.
- **Web Audio background:** keep the "phone face-down" instruction compatible with the screen staying on, or accept the fade stops at lock; don't promise 20 minutes.
- **speechSynthesis:** keep utterances short (done) and always start them from a tap (done).
- **Fullscreen:** treat it as a nice-to-have (done — wrapped in try/catch); the black `#dark` overlay is the real darkness.
- **Wake alarm:** keep the in-app "set a normal backup alarm too" copy prominent; this is a bonus feature, not an alarm clock.
- **localStorage:** the one real data-loss risk — recommend installing to Home Screen on iOS; a later cheap insurance is `navigator.storage.persist()` plus a one-tap "copy my log" export.
