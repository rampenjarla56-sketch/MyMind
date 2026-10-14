# MyMind

A bedtime coach for people who get stuck scrolling and can't fall asleep on time.
Built first for one real user: a teenager whose bedtime has drifted to 5–6 a.m. and needs to get back to 12–1 a.m.

## How this repo is organised (same pattern as Overripe)
- `DesignNotes/` – the "tree": vision, approach, roadmap, marketing, safety, architecture.
- `Design/briefs/` – one brief per worker session. Open a Claude session per brief and paste/point at the file.
- `Design/RESUME.md` – current state; update at the end of every session.
- `index.html` – the app: a single-file installable PWA (no build step), plus `manifest.webmanifest`, `sw.js` and `icons/`. Open it in a browser, or on your phone via GitHub Pages (add to home screen to install).

## Try it now
Open `index.html` in a browser (or https://rampenjarla56-sketch.github.io/MyMind/). Set your usual bedtime and your goal bedtime; it builds a gradual shift plan and walks you through a wind-down each night.
