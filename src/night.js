// MyMind — night screens (Agent 04).
// Wind-down sequencer, breathing, body scan, can't-sleep branches, tempted
// screen, lights-out with generated audio, and the morning wake flow.
//
// Boundary (docs/ARCHITECTURE.md → UI contracts):
//   exports  startWindDown(), openCant(), openTempted(), goDark()
//   reads    window.MyMind = { state, save, go, tick }
// All clock/plan maths comes from ./domain.js; the only persistence is
// MyMind.state.windDown = { startedAt, stepIndex } | null via MyMind.save().

import { parseClock, fmtClock, localDate, plannedBedtime, sleepRemaining, currentNight } from './domain.js';

const $ = id => document.getElementById(id);
const MM = () => window.MyMind;
const plan = () => (MM() && MM().state.plan) || null;
const prefs = () => (MM() && MM().state.prefs) || { sound: 'off', voice: false, remind: false };
const nowClock = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const sheet = (id, on) => $(id).classList.toggle('hide', !on);
const isOpen = id => !$(id).classList.contains('hide');
const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtMin = m => { m = Math.max(0, Math.ceil(m)); if (m >= 60) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; } return m === 1 ? '1 min' : `${m} min`; };
const focusEl = el => { if (!el) return; if (el.tabIndex < 0 && !/^(button|input|textarea)$/i.test(el.tagName)) el.tabIndex = -1; el.focus({ preventScroll: false }); };

// Testing hook (card: "shorten fade via a debug flag during testing"):
// ?fade=0.2 shortens the audio fade to 0.2 min. Absent → 20 min.
const FADE_MIN = (() => { const q = Number(new URLSearchParams(location.search).get('fade')); return q > 0 ? q : 20; })();
const RESUME_MAX_MS = 3 * 60 * 60 * 1000; // a wind-down older than 3 h is stale

// Convert "tonight's planned bedtime" to an epoch. Everything about *which*
// night and *what* bedtime is domain's; this only attaches it to the wall clock.
function bedtimeEpoch() {
  const p = plan();
  if (!p) return null;
  const { nightDate, nowRef } = currentNight(nowClock(), parseClock(p.wake) ?? 0, localDate());
  const planned = plannedBedtime(p, MM().state.log, nightDate);
  if (planned === null) return null;
  const d = new Date(); d.setSeconds(0, 0);
  return d.getTime() + (planned - nowRef) * 60000;
}

// =============================================================================
// WIND-DOWN — 30 min: phone-away 3 · brain-dump 7 · breathing 5 · body scan 8 · settle 7
// Timing model: `anchor` (= state.windDown.startedAt) is the schedule origin.
// Step i runs from anchor + CUM[i] to anchor + CUM[i+1]. On every step change
// the anchor is re-set so the new step starts *now* with its full length;
// finishing early therefore pulls the anchor earlier and the settle step
// absorbs the remainder up to the planned bedtime. Lights-out happens at
// max(planned bedtime, anchor + 30 min) or on "Lights out", whichever first.
// =============================================================================
const STEP_MIN = [3, 7, 5, 8, 7];
const CUM = STEP_MIN.reduce((a, m) => (a.push(a[a.length - 1] + m), a), [0]); // [0,3,10,15,23,30]
const STEP_NAME = ['Phone away', 'Empty your head', 'Slow breathing', 'Relax your body', 'Settle'];
const AUTO_ADVANCE = [true, false, true, true, false]; // brain dump waits for you; settle ends in the dark

let wd = null;           // { anchor, step } while a wind-down is live
let wdTimer = null;      // 1 s tick while the sheet is open
let stepCleanup = null;  // tears down the current step's timers/voice

function persistWind(value) {
  const mm = MM(); if (!mm) return;
  mm.state.windDown = value;
  mm.save();
}

function stepEndsAt() { return wd.anchor + CUM[wd.step + 1] * 60000; }
function darkAt() { const b = bedtimeEpoch(); const end = wd.anchor + CUM[5] * 60000; return b === null ? end : Math.max(b, end); }

export function startWindDown() {
  closePanic(); closeCant(); leaveDark();
  wd = { anchor: Date.now(), step: 0 };
  persistWind({ startedAt: wd.anchor, stepIndex: 0 });
  showWind();
}

function resumeWindDown() {
  const mm = MM(); if (!mm || !mm.state.plan) return;
  const saved = mm.state.windDown;
  if (!saved) return;
  if (Date.now() - saved.startedAt > RESUME_MAX_MS || saved.stepIndex > 4) { persistWind(null); return; }
  wd = { anchor: saved.startedAt, step: saved.stepIndex };
  showWind();
}

function showWind() {
  sheet('wind', true);
  clearInterval(wdTimer); wdTimer = setInterval(windTick, 1000);
  renderStep();
}

function setStep(i) {
  if (!wd) return;
  if (i >= STEP_MIN.length) { finishWind(); goDark(); return; }
  wd.step = i;
  wd.anchor = Date.now() - CUM[i] * 60000; // the new step starts now, full length
  persistWind({ startedAt: wd.anchor, stepIndex: i });
  renderStep();
}
const nextStep = () => setStep(wd.step + 1);

function finishWind() {
  if (stepCleanup) { stepCleanup(); stepCleanup = null; }
  clearInterval(wdTimer); wdTimer = null;
  wd = null;
  persistWind(null);
  sheet('wind', false);
  $('wind').classList.remove('black');
}

function leaveWind() { finishWind(); MM().go('home'); }
$('leaveWind').onclick = leaveWind;

function windTick() {
  if (!wd || !isOpen('wind')) return;
  const now = Date.now();
  const left = (stepEndsAt() - now) / 60000;
  const last = wd.step === 4;
  if (last) {
    const toDark = (darkAt() - now) / 60000;
    $('windLeft').textContent = toDark <= 0 ? 'Lights out now' : `lights out in ${fmtMin(toDark)}`;
    if (toDark <= 0) { finishWind(); goDark(); return; }
    // Started well before bedtime: say so plainly and drop to the near-black treatment
    // rather than parking a lit navy card in front of the user for hours.
    const early = toDark > 60, at = new Date(darkAt());
    $('wind').classList.toggle('black', early);
    const note = $('settleEarly');
    if (note) { note.classList.toggle('hide', !early); note.textContent = early ? `You're early — lights out is at ${fmtClock(at.getHours() * 60 + at.getMinutes())}. Stay here quietly, or tap Lights out now.` : ''; }
  } else if (left <= 0) {
    $('windLeft').textContent = 'time is up for this step';
    if (AUTO_ADVANCE[wd.step]) { nextStep(); return; }
    $('stepBox').classList.add('overrun');
  } else {
    $('windLeft').textContent = `about ${fmtMin(left)} left`;
  }
  if (!last) $('wind').classList.remove('black');
  const bed = bedtimeEpoch();
  const at = new Date(darkAt());
  $('windBed').textContent = bed === null ? '' : `Lights out at ${fmtClock(at.getHours() * 60 + at.getMinutes())}.`;
}

function renderStep() {
  if (stepCleanup) { stepCleanup(); stepCleanup = null; }
  const i = wd.step;
  $('dots').innerHTML = STEP_MIN.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('');
  $('windStep').textContent = `Step ${i + 1} of 5 · ${STEP_NAME[i]}`;
  $('stepBox').classList.remove('overrun');
  const box = $('stepBox');
  box.innerHTML = STEPS[i]();
  box.querySelectorAll('[data-next]').forEach(b => b.onclick = nextStep);
  stepCleanup = (STEP_INIT[i] && STEP_INIT[i]()) || null;
  windTick();
  focusEl(box.querySelector('h2'));
}

const STEPS = [
  () => `<h2 id="windTitle">Phone away from bed</h2>
    <p>Plug it in across the room, or outside the bedroom. Do Not Disturb on. If you need an alarm, set it now — a normal one, not just this app.</p>
    <p class="dim">Close every feed. Anything still open is tomorrow's problem. (Settings → Set up my phone can make the phone do this for you.)</p>
    <button type="button" data-next>Done, it's across the room</button>`,
  () => `<h2 id="windTitle">Empty your head</h2>
    <p class="dim">Worries, to-dos, ideas — write them here so they stop circling. Nothing is saved or sent; it's gone when you move on.</p>
    <label for="dump" class="sr-only">Brain dump</label><textarea id="dump" placeholder="Tomorrow I need to…"></textarea>
    <p class="faint overrun-note">Time's up for this step. Finish the thought, then tap Done.</p>
    <button type="button" data-next>Done, it's out of my head</button>`,
  () => `<h2 id="windTitle">Slow breathing</h2>
    <p class="dim" id="brHow">In for 4, hold for 7, out for 8. Follow the circle.</p>
    <p class="faint">Stop if it feels uncomfortable or you get dizzy — just breathe normally.</p>
    <div class="breath" id="br" aria-live="polite">Ready?</div>
    <div class="bar" aria-hidden="true"><i id="brBar"></i></div>
    <p class="faint center" id="brRound"></p>
    <button type="button" id="brStart">Start</button>
    <div class="seg" role="group" aria-label="Breathing pattern">
      <button type="button" class="ghost" data-mode="478" aria-pressed="true">4 · 7 · 8</button>
      <button type="button" class="ghost" data-mode="gentle" aria-pressed="false">Gentle: in 4, out 6</button>
    </div>
    <button type="button" class="ghost" data-next>Done breathing</button>`,
  () => `<h2 id="windTitle">Relax your body</h2>
    <p id="relax" class="relax-now" aria-live="polite">Lie down, get comfortable. Eyes can close between parts.</p>
    <ol class="relax-list" id="relaxList" aria-label="The full script">${RELAX.map(t => `<li>${t}</li>`).join('')}</ol>
    <button type="button" class="ghost" id="relVoice">Read it to me in a quiet voice</button>
    <button type="button" class="quiet" id="relNext">Next part</button>
    <button type="button" class="ghost" data-next>I'm ready — skip ahead</button>`,
  () => `<h2 id="windTitle">Settle</h2>
    <p class="dim hide" id="settleEarly"></p>
    <p>Nothing left to do. Eyes closed if you like. When it's time, the screen goes almost black with a faint clock, and you put the phone face-down.</p>
    <p class="dim">If you're still awake after about twenty minutes in the dark, tap "I can't sleep" — getting up for a bit beats lying there fighting it.</p>
    <button type="button" id="goDarkNow">Lights out now</button>`,
];

// ---- step 3: breathing (4-7-8 orb or gentle in-4/out-6; reduced motion → text + bar) ----
const PATTERNS = {
  '478': { phases: [['Breathe in', 4, 1.35], ['Hold', 7, 1.35], ['Breathe out', 8, 1]], how: 'In for 4, hold for 7, out for 8. Follow the circle.' },
  gentle: { phases: [['Breathe in', 4, 1.3], ['Breathe out', 6, 1]], how: 'In for 4, out for 6. No holding — just a long, easy out-breath.' },
};

// Runs a breathing pattern inside {orb, bar, round} until stop() or `rounds` is reached.
function runBreath(ui, pattern, rounds, onEnd) {
  let round = 0, p = 0, t = null, raf = null, phaseStart = 0, phaseSec = 1, alive = true;
  const rm = reducedMotion();
  const paint = () => {
    if (!alive) return;
    const frac = Math.min(1, (Date.now() - phaseStart) / (phaseSec * 1000));
    if (ui.bar) ui.bar.style.width = `${(frac * 100).toFixed(1)}%`;
    raf = setTimeout(paint, 200);
  };
  const phase = () => {
    if (!alive) return;
    if (round >= rounds) { stop(); ui.orb.textContent = 'Well done'; if (ui.round) ui.round.textContent = ''; onEnd && onEnd(); return; }
    const [label, sec, scale] = pattern.phases[p];
    phaseStart = Date.now(); phaseSec = sec;
    ui.orb.textContent = label;
    if (!rm) { ui.orb.style.transition = `transform ${sec}s ease-in-out`; ui.orb.style.transform = `scale(${scale})`; }
    if (ui.round) ui.round.textContent = `Round ${round + 1} of ${rounds} · ${label.toLowerCase()} ${sec}`;
    t = setTimeout(() => { p++; if (p >= pattern.phases.length) { p = 0; round++; } phase(); }, sec * 1000);
  };
  const stop = () => { alive = false; clearTimeout(t); clearTimeout(raf); ui.orb.style.transform = ''; if (ui.bar) ui.bar.style.width = '0%'; };
  phase(); paint();
  return stop;
}

function initBreathStep() {
  let mode = '478', stop = null;
  const ui = { orb: $('br'), bar: $('brBar'), round: $('brRound') };
  const setMode = m => {
    mode = m;
    $('brHow').textContent = PATTERNS[m].how;
    $('stepBox').querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    if (stop) { stop(); stop = null; $('brStart').classList.remove('hide'); ui.orb.textContent = 'Ready?'; ui.round.textContent = ''; }
  };
  $('stepBox').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('brStart').onclick = () => {
    $('brStart').classList.add('hide');
    // Rounds sized to the 5-minute step: 4-7-8 × 12 ≈ 3.8 min; gentle × 24 = 4 min.
    stop = runBreath(ui, PATTERNS[mode], mode === '478' ? 12 : 24, () => { stop = null; $('brStart').classList.remove('hide'); $('brStart').textContent = 'Again'; });
  };
  return () => { if (stop) stop(); };
}

// ---- step 4: body scan (written list always visible; optional voice; "I'm ready" skips) ----
const RELAX = [
  'Your forehead. Let it go smooth.',
  'Your jaw. Unclench it. Let your teeth come apart.',
  'Your shoulders. Let them drop away from your ears.',
  'Your hands. Let them fall open, heavy.',
  'Your belly. Soft. Breathing slow and easy.',
  'Your legs. Heavy, sinking into the bed.',
  'Your feet. Warm and loose.',
  'Now just notice your breathing. Nothing else to do.',
];
const RELAX_PART_MS = 50000; // 8 parts ≈ 6.7 min of the 8-min step
let voiceTimer = null;

function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.82; u.pitch = 0.9; u.volume = 0.9;
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}
function stopVoice() { clearTimeout(voiceTimer); voiceTimer = null; try { speechSynthesis.cancel(); } catch { /* no speech */ } }

function initRelaxStep() {
  let i = -1, voice = false, partTimer = null;
  const items = Array.from($('relaxList').children);
  const show = () => {
    i++;
    if (i >= RELAX.length) { nextStep(); return; }
    $('relax').textContent = RELAX[i];
    items.forEach((li, k) => li.classList.toggle('now', k === i));
    $('relNext').textContent = i === RELAX.length - 1 ? "I'm ready" : 'Next part';
    if (voice) speak(RELAX[i]);
    clearTimeout(partTimer); partTimer = setTimeout(show, RELAX_PART_MS);
  };
  const startVoice = () => {
    if (!('speechSynthesis' in window)) { $('relVoice').textContent = 'No voice on this device — the words are below'; $('relVoice').disabled = true; return; }
    voice = true; $('relVoice').classList.add('hide');
    if (i >= 0) speak(RELAX[i]);
  };
  $('relVoice').onclick = startVoice;
  $('relNext').onclick = show;
  if (prefs().voice) startVoice();
  show();
  return () => { clearTimeout(partTimer); stopVoice(); };
}

const STEP_INIT = [null, null, initBreathStep, initRelaxStep, () => { $('goDarkNow').onclick = () => { finishWind(); goDark(); }; return null; }];

// =============================================================================
// AUDIO — generated rain / deep noise, fades to silence over FADE_MIN. Starts
// only on a tap. One source at a time; re-entering the dark screen never
// starts a second one.
// =============================================================================
let AC = null, snd = null, sndEndTimer = null;
const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());

function markSound(kind) {
  document.querySelectorAll('[data-snd]').forEach(b => {
    const on = b.dataset.snd === kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
}
function stopSound() {
  clearTimeout(sndEndTimer); sndEndTimer = null;
  if (snd) { try { snd.src.stop(); } catch { /* already stopped */ } try { snd.g.disconnect(); } catch { /* */ } snd = null; }
}
function sndMsg(text) { $('sndInfo').textContent = text; }
function startSound(kind) {
  stopSound(); markSound(kind);
  if (kind === 'off') { sndMsg('Silent.'); return; }
  let ctx;
  try { ctx = ac(); if (ctx.resume) ctx.resume(); } catch { sndMsg('No audio on this device.'); markSound('off'); return; }
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'deep') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w * 0.6;
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; let node = src;
  if (kind === 'rain') { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.5; src.connect(f); node = f; }
  const g = ctx.createGain(); node.connect(g); g.connect(ctx.destination);
  const now = ctx.currentTime, secs = FADE_MIN * 60, lvl = kind === 'deep' ? 0.22 : 0.13;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(lvl, now + Math.min(4, secs / 4));
  g.gain.setValueAtTime(lvl, now + Math.min(60, secs / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, now + secs);
  src.start(); src.stop(now + secs + 1);
  snd = { kind, src, g };
  sndEndTimer = setTimeout(() => { snd = null; markSound('off'); sndMsg('Faded out. Tap a sound to start it again.'); }, (secs + 1) * 1000);
  const mins = FADE_MIN >= 1 ? `${Math.round(FADE_MIN)} min` : `${Math.round(FADE_MIN * 60)} s`;
  sndMsg(`${kind === 'rain' ? 'Rain' : 'Deep noise'} · fades to silence over ${mins}. It may stop if the phone locks.`);
}
document.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => startSound(b.dataset.snd));

// =============================================================================
// DARK SCREEN + MORNING WAKE
// =============================================================================
let clockTimer = null, alarm = null, alarmFiredOn = null, darkOpenedAt = 0;

export function goDark() {
  closePanic(); closeCant();
  if (wd) finishWind();
  clearInterval(clockTimer); darkOpenedAt = Date.now();
  $('dark').classList.remove('hide');
  $('alarmBox').classList.add('hide');
  if (snd) { markSound(snd.kind); } else {
    markSound('off');
    const pref = prefs().sound;
    sndMsg(pref === 'off'
      ? 'Tap a sound to start it. It fades to silence over about 20 minutes and may stop if the phone locks.'
      : `Tap ${pref === 'rain' ? 'Rain' : 'Deep'} (your usual) to start it. It fades to silence over about 20 minutes and may stop if the phone locks.`);
  }
  const paint = () => { $('darkClock').textContent = fmtClock(nowClock()); checkAlarm(); };
  paint(); clockTimer = setInterval(paint, 20000);
  try { const pr = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (pr && pr.catch) pr.catch(() => {}); } catch { /* ignore */ }
  focusEl($('darkClock'));
}
function leaveDark() { $('dark').classList.add('hide'); clearInterval(clockTimer); stopSound(); stopAlarm(); }
function exitFs() { try { const pr = document.fullscreenElement && document.exitFullscreen && document.exitFullscreen(); if (pr && pr.catch) pr.catch(() => {}); } catch { /* ignore */ } }
function toHome() { leaveDark(); exitFs(); MM().go('home'); }
$('darkHome').onclick = toHome;

function checkAlarm() {
  const p = plan();
  if (!p || !p.alarm || !isOpen('dark') || alarm) return;
  if (Date.now() - darkOpenedAt < 60000) return; // entering the dark inside the wake window must not ring instantly
  const w = parseClock(p.wake); if (w === null) return;
  const now = nowClock(), today = localDate();
  if (now >= w && now < w + 30 && alarmFiredOn !== today) { alarmFiredOn = today; ringAlarm(); }
}
function ringAlarm() {
  closePanic(); closeCant(); // the wake form must not appear underneath an open sheet
  $('alarmBox').classList.remove('hide');
  $('curtainsDone').checked = false; $('alarmInput').value = ''; $('alarmHint').textContent = '';
  focusEl($('curtainsDone'));
  stopSound(); markSound('off'); sndMsg('');
  try {
    const ctx = ac(); if (ctx.resume) ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 523;
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 120); // rises gently over two minutes
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.5; lg.gain.setValueAtTime(0.0001, now); lg.gain.exponentialRampToValueAtTime(0.1, now + 120);
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); o.start();
    alarm = { o, lfo };
  } catch { alarm = { o: null, lfo: null }; /* silent wake prompt still shows */ }
  focusEl($('curtainsDone'));
}
function stopAlarm() {
  if (alarm) { try { alarm.o && alarm.o.stop(); alarm.lfo && alarm.lfo.stop(); } catch { /* */ } alarm = null; }
}
function tryDismissAlarm() {
  const typed = $('alarmInput').value.replace(/\s+/g, '').toLowerCase() === 'up';
  const curtains = $('curtainsDone').checked;
  if (typed && !curtains) { $('alarmHint').textContent = 'Tick the curtains box first — then the sound stops.'; return; }
  if (!typed) { $('alarmHint').textContent = ''; return; }
  stopAlarm(); toHome();
  setTimeout(() => { const slept = $('slept'); if (slept) slept.focus(); }, 0); // after the inert observer releases <main>
}
$('alarmInput').oninput = tryDismissAlarm;
$('curtainsDone').onchange = tryDismissAlarm;
$('alarmBox').onsubmit = e => { e.preventDefault(); tryDismissAlarm(); };

// =============================================================================
// TEMPTED — sleep window from domain, two minutes of urge-passing breathing
// =============================================================================
let panicStop = null;
export function openTempted() {
  closeCant();
  const p = plan(), now = nowClock();
  $('panicTime').textContent = fmtClock(now);
  if (p && parseClock(p.wake) !== null) {
    const left = sleepRemaining(now, parseClock(p.wake));
    const h = Math.floor(left / 60), m = left % 60;
    $('panicMath').textContent = `If you fall asleep now you get about ${h}h ${m}m of possible sleep before your ${p.wake} wake-up — a window, not a promise. Every minute of scrolling comes straight out of it.`;
  } else {
    $('panicMath').textContent = 'Every minute of scrolling comes straight out of tonight.';
  }
  resetPanicBreath();
  sheet('panic', true);
  focusEl($('panicTitle'));
}
function resetPanicBreath() {
  if (panicStop) { panicStop(); panicStop = null; }
  $('panicBr').textContent = 'Ready?'; $('panicRound').textContent = ''; $('panicBar').style.width = '0%';
  $('panicStart').classList.remove('hide'); $('panicStart').textContent = 'Start two minutes of breathing';
}
$('panicStart').onclick = () => {
  $('panicStart').classList.add('hide');
  // in 4 / out 6 × 12 rounds = exactly two minutes, then it ends.
  panicStop = runBreath({ orb: $('panicBr'), bar: $('panicBar'), round: $('panicRound') }, PATTERNS.gentle, 12, () => {
    panicStop = null;
    $('panicBr').textContent = 'Two minutes. Done.';
    $('panicRound').textContent = 'The urge had its peak. Phone down now.';
    $('panicStart').textContent = 'Again'; $('panicStart').classList.remove('hide');
  });
};
function closePanic() { if (panicStop) { panicStop(); panicStop = null; } sheet('panic', false); }
$('temptedDark').onclick = openTempted;
$('panicBack').onclick = () => { closePanic(); goDark(); };
$('panicWind').onclick = () => { closePanic(); startWindDown(); }; // startWindDown hides the dark overlay
$('panicHome').onclick = () => { closePanic(); toHome(); };

// =============================================================================
// CAN'T SLEEP — four branches, each ending in one button back to the dark
// =============================================================================
const WHYS = {
  mind: {
    t: 'Mind racing',
    b: "Thoughts at night feel urgent, but they're just loud. One line for what's circling, one small thing you'll do about it tomorrow. Then it can wait.",
    x: `<label for="nightDump">What's circling?</label><input id="nightDump" autocomplete="off" placeholder="One line is enough">
        <label for="nightAction">One thing for tomorrow</label><input id="nightAction" autocomplete="off" placeholder="e.g. message Sam before school">
        <p class="faint">Nothing is saved or sent. Writing it is the point.</p>`,
  },
  body: {
    t: "Body won't settle",
    b: 'One slow pass, top to bottom. If you are still restless after that, get out of bed for ten minutes — stretch or sit in dim light — and come back when heavy.',
    x: `<ol class="relax-list short"><li>Unclench your jaw. Let your teeth come apart.</li><li>Drop your shoulders away from your ears.</li><li>Hands open, legs heavy, sinking into the bed.</li><li>Breathe out longer than you breathe in. Ten times.</li></ol>`,
  },
  awake: {
    t: "Not sleepy is fine",
    b: "Don't lie there fighting it — that teaches your brain the bed is for worrying. Get up, keep the lights low, do something genuinely dull: a paper book, folding clothes, slow stretching. Come back the moment you feel sleepy.",
    x: `<p class="faint">No phone, no feed — that's the trap. Same wake time tomorrow either way; one short night won't undo anything.</p>`,
  },
  phone: {
    t: 'The phone can wait',
    b: "That pull is real — apps are built to keep you on them at 1 a.m. Put the phone further away than it is now, then breathe through one minute here.",
    x: `<div class="breath" id="cantBr" aria-live="polite">Ready?</div><div class="bar" aria-hidden="true"><i id="cantBar"></i></div><p class="faint center" id="cantRound"></p>
        <button type="button" class="ghost" id="cantBrStart">One minute of slow breathing</button>`,
  },
};
let cantStop = null, cantFromDark = false; // where the sheet was opened from decides where "back" goes
document.querySelectorAll('[data-why]').forEach(b => b.onclick = () => {
  const w = WHYS[b.dataset.why];
  $('cantTitle').textContent = w.t; $('cantBody').textContent = w.b; $('cantExtra').innerHTML = w.x;
  $('cantPick').classList.add('hide'); $('cantAnswer').classList.remove('hide');
  const start = $('cantBrStart');
  if (start) start.onclick = () => {
    start.classList.add('hide');
    cantStop = runBreath({ orb: $('cantBr'), bar: $('cantBar'), round: $('cantRound') }, PATTERNS.gentle, 6, () => { cantStop = null; $('cantRound').textContent = 'One minute. Phone further away, then back to the dark.'; });
  };
  focusEl($('cantTitle'));
});
export function openCant() {
  closePanic();
  if (cantStop) { cantStop(); cantStop = null; }
  cantFromDark = isOpen('dark');
  $('cantPick').classList.remove('hide'); $('cantAnswer').classList.add('hide'); $('cantExtra').innerHTML = '';
  $('cantBack').textContent = $('cantBack0').textContent = cantFromDark ? 'Back to the dark' : 'Back home';
  $('cantHomeBtn').classList.toggle('hide', !cantFromDark); // from home it would duplicate the primary action
  sheet('cant', true);
  focusEl($('cantHeading'));
}
function closeCant() { if (cantStop) { cantStop(); cantStop = null; } sheet('cant', false); }
function cantBack() { closeCant(); if (cantFromDark) goDark(); else toHome(); }
$('cantBtn').onclick = openCant;
$('cantBack').onclick = cantBack;
$('cantBack0').onclick = cantBack;
$('cantHomeBtn').onclick = () => { closeCant(); toHome(); };

// Escape closes the two overlay sheets back to wherever they came from.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (isOpen('cant')) { closeCant(); if (isOpen('dark')) focusEl($('darkClock')); else MM().go('home'); }
  else if (isOpen('panic')) { closePanic(); if (isOpen('dark')) focusEl($('darkClock')); else MM().go('home'); }
});

// Countdowns never trust a timer that may have been paused: recompute on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (wd) windTick();
  if (isOpen('dark')) { $('darkClock').textContent = fmtClock(nowClock()); checkAlarm(); }
});

// Resume an in-progress wind-down after a refresh. Deferred so app.js has
// finished building window.MyMind (it imports this module first).
setTimeout(resumeWindDown, 0);

// While any night overlay is open the daytime shell underneath must be unreachable
// by Tab and screen readers. One observer covers every open/close path.
(() => {
  const main = document.querySelector('main');
  const overlays = ['wind', 'panic', 'cant', 'dark'].map($).filter(Boolean);
  const sync = () => { const open = overlays.some(el => !el.classList.contains('hide')); main.inert = open; main.setAttribute('aria-hidden', open ? 'true' : 'false'); };
  const mo = new MutationObserver(sync);
  overlays.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));
  sync();
})();
