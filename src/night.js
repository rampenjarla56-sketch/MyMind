// MyMind — night screens. SCAFFOLD written by Agent 02: a faithful port of the
// pre-split inline behaviour so nothing regresses. Agent 04 owns this file and
// is expected to replace it (timed 30-min wind-down, gentle breathing, resumable
// state, morning flow). Interface kept per docs/ARCHITECTURE.md:
//   exports startWindDown(), openCant(), openTempted(), goDark()
//   reads window.MyMind = { state, save, go, tick }

import { parseClock, fmtClock, sleepRemaining } from './domain.js';

const $ = id => document.getElementById(id);
const MM = () => window.MyMind;
const plan = () => (MM() && MM().state.plan) || null;
const prefs = () => (MM() && MM().state.prefs) || { sound: 'off', voice: false, remind: false };
const nowClock = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const sheet = (id, on) => $(id).classList.toggle('hide', !on);

// ---- wind-down ----
const steps = [
  () => `<h2>1 · Phone away from bed</h2><p>Plug your phone in across the room (or outside the bedroom). Turn on Do Not Disturb. If you need an alarm, set it now.</p><p>Close every feed. Anything still open is tomorrow's problem.</p><button type="button" data-next>Done</button>`,
  () => `<h2>2 · Empty your head</h2><p class="dim">Write anything on your mind: worries, to-dos, ideas. Nothing is saved or sent — it's gone when you move on.</p><label for="dump" class="sr-only">Brain dump</label><textarea id="dump" placeholder="Tomorrow I need to…"></textarea><button type="button" data-next>Done, it's out of my head</button>`,
  () => `<h2>3 · Slow breathing</h2><p class="dim">In for 4 · hold 7 · out for 8. Four rounds — follow the circle. Stop if it feels uncomfortable or you get dizzy; just breathe normally.</p><div class="breath" id="br" aria-live="polite">Get ready</div><button type="button" id="brStart">Start</button><button type="button" class="ghost" data-next>Skip breathing</button>`,
  () => `<h2>4 · Relax your body</h2><p id="relax" aria-live="polite">Lie down, get comfortable. Eyes can close between parts.</p><button type="button" id="relVoice">Guide me with a quiet voice</button><button type="button" class="ghost" id="relNext">I'll tap through silently</button>`,
  () => `<h2>5 · Lights out</h2><p>The screen will go black with a faint clock. Put it face-down. If you're still awake after ~20 minutes, tap "I can't sleep" — get up, keep the light low, do something boring, come back when sleepy.</p><button type="button" id="goDark">Lights out</button>`,
];
let si = 0, breathT, voiceTimer;

function renderStep() {
  stopVoice(); clearTimeout(breathT);
  sheet('wind', true);
  $('dots').innerHTML = steps.map((_, i) => `<i class="${i <= si ? 'on' : ''}"></i>`).join('');
  $('stepBox').innerHTML = steps[si]();
  $('stepBox').querySelectorAll('[data-next]').forEach(b => b.onclick = () => { si++; renderStep(); });
  if ($('brStart')) $('brStart').onclick = breathe;
  if ($('relNext')) relax();
  if ($('goDark')) $('goDark').onclick = goDark;
  const h = $('stepBox').querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); }
}

function breathe() {
  const br = $('br'); let round = 0, p = 0;
  $('brStart').classList.add('hide');
  const phases = [['Breathe in', 4, 1.35], ['Hold', 7, 1.35], ['Breathe out', 8, 1]];
  (function run() {
    if (round >= 4) { br.textContent = 'Well done'; br.style.transform = 'scale(1)'; breathT = setTimeout(() => { si++; renderStep(); }, 1500); return; }
    const [label, sec, sc] = phases[p];
    br.textContent = label; br.style.transition = `transform ${sec}s ease-in-out`; br.style.transform = `scale(${sc})`;
    breathT = setTimeout(() => { p++; if (p > 2) { p = 0; round++; } run(); }, sec * 1000);
  })();
}

const relaxParts = ['Your forehead. Let it go smooth.', 'Your jaw. Unclench it. Let your teeth come apart.', 'Your shoulders. Let them drop away from your ears.', 'Your hands. Let them fall open, heavy.', 'Your belly. Soft. Breathing slow and easy.', 'Your legs. Heavy, sinking into the bed.', 'Your feet. Warm and loose.', 'Now just notice your breathing. Nothing else to do.'];
function relax() {
  let i = -1;
  const advance = () => {
    i++;
    if (i >= relaxParts.length) { si++; renderStep(); return true; }
    $('relax').textContent = relaxParts[i];
    $('relNext').textContent = i === relaxParts.length - 1 ? "I'm ready" : 'Next';
    return false;
  };
  $('relNext').onclick = () => { stopVoice(); advance(); };
  const startVoice = () => {
    $('relVoice').classList.add('hide');
    const speakNext = () => {
      if (advance()) return;
      try { const u = new SpeechSynthesisUtterance($('relax').textContent); u.rate = 0.82; u.pitch = 0.9; u.volume = 0.9; speechSynthesis.speak(u); } catch { /* no speech */ }
      voiceTimer = setTimeout(speakNext, i === relaxParts.length - 1 ? 14000 : 16000);
    };
    speakNext();
  };
  $('relVoice').onclick = startVoice;
  if (prefs().voice && 'speechSynthesis' in window) startVoice();
}
function stopVoice() { clearTimeout(voiceTimer); try { speechSynthesis.cancel(); } catch { /* ignore */ } }

export function startWindDown() {
  sheet('panic', false); sheet('cant', false); leaveDark();
  si = 0; renderStep();
}
function leaveWind() { stopVoice(); clearTimeout(breathT); sheet('wind', false); }
$('leaveWind').onclick = () => { leaveWind(); MM().go('home'); };

// ---- sounds (generated, nothing downloaded) ----
let AC, sndNodes = null, sndStopT;
const ac = () => AC = AC || new (window.AudioContext || window.webkitAudioContext)();
function stopSound() {
  clearTimeout(sndStopT);
  if (sndNodes) { try { sndNodes.src.stop(); } catch { /* */ } try { sndNodes.g.disconnect(); } catch { /* */ } sndNodes = null; }
}
function markSound(kind) {
  document.querySelectorAll('[data-snd]').forEach(b => {
    const on = b.dataset.snd === kind; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
}
function startSound(kind) {
  stopSound(); markSound(kind);
  if (kind === 'off') { $('sndInfo').textContent = 'Silent.'; return; }
  const ctx = ac(); ctx.resume && ctx.resume();
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (kind === 'deep') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w * 0.6; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; let node = src;
  if (kind === 'rain') { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.5; src.connect(f); node = f; }
  const g = ctx.createGain(); node.connect(g); g.connect(ctx.destination);
  const now = ctx.currentTime, mins = 20, lvl = kind === 'deep' ? 0.22 : 0.13;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(lvl, now + 4);
  g.gain.setValueAtTime(lvl, now + 60);
  g.gain.exponentialRampToValueAtTime(0.0001, now + mins * 60);
  src.start(); src.stop(now + mins * 60 + 2);
  sndNodes = { src, g }; sndStopT = setTimeout(() => sndNodes = null, mins * 60 * 1000 + 2500);
  $('sndInfo').textContent = (kind === 'rain' ? 'Rain' : 'Deep noise') + ' · fades out over 20 min. It may stop if the phone locks.';
}
document.querySelectorAll('[data-snd]').forEach(b => b.onclick = () => startSound(b.dataset.snd));

// ---- dark screen + wake alarm ----
let clk, alarmNodes = null, alarmFired = false;
export function goDark() {
  sheet('panic', false); sheet('cant', false); sheet('wind', false); clearInterval(clk);
  stopAlarmSound();
  $('dark').classList.remove('hide'); $('alarmBox').classList.add('hide');
  if (!sndNodes) markSound(prefs().sound); // show the preferred sound; it starts only on tap
  const p = plan(), m0 = nowClock(), w0 = p && p.alarm ? parseClock(p.wake) : -1;
  alarmFired = w0 >= 0 && m0 >= w0 && m0 < w0 + 30;
  const u = () => { $('darkClock').textContent = fmtClock(nowClock()); checkAlarm(); };
  u(); clk = setInterval(u, 20000);
  try { const pr = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); pr && pr.catch(() => {}); } catch { /* ignore */ }
}
function leaveDark() { $('dark').classList.add('hide'); clearInterval(clk); stopSound(); stopAlarmSound(); }
function exitFs() { try { const pr = document.exitFullscreen && document.exitFullscreen(); pr && pr.catch(() => {}); } catch { /* ignore */ } }
function checkAlarm() {
  const p = plan();
  if (!p || !p.alarm || alarmFired) return;
  const now = nowClock(), w = parseClock(p.wake);
  if (now >= w && now < w + 30) { alarmFired = true; ringAlarm(); }
}
function ringAlarm() {
  $('alarmBox').classList.remove('hide'); $('alarmInput').value = ''; $('alarmInput').focus();
  try {
    const ctx = ac(); ctx.resume && ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 523;
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime; g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 120);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.5; lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    o.start(); alarmNodes = { o, lfo };
  } catch { /* no audio */ }
}
function stopAlarmSound() { if (alarmNodes) { try { alarmNodes.o.stop(); alarmNodes.lfo.stop(); } catch { /* */ } alarmNodes = null; } }
$('alarmInput').oninput = e => {
  if (e.target.value.trim().toUpperCase() === 'UP') { leaveDark(); exitFs(); MM().go('home'); $('slept').focus(); }
};
$('darkHome').onclick = () => { leaveDark(); exitFs(); MM().go('home'); };

// ---- tempted / panic ----
let panicT;
export function openTempted() {
  const p = plan(), now = nowClock();
  $('panicTime').textContent = fmtClock(now);
  if (p) {
    const left = Math.max(sleepRemaining(now, parseClock(p.wake)) - 20, 0);
    $('panicMath').textContent = `If you're asleep in 20 minutes, you get about ${Math.floor(left / 60)}h ${left % 60}m before your ${p.wake} wake-up — a window, not a promise. Every minute of scrolling comes straight out of it.`;
  }
  sheet('panic', true); panicBreath();
}
function panicBreath() {
  const el = $('panicBr'); let on = false; clearInterval(panicT);
  const flip = () => { on = !on; el.textContent = on ? 'Breathe in…' : '…and let it go'; el.style.transition = 'transform 4s ease-in-out'; el.style.transform = on ? 'scale(1.3)' : 'scale(1)'; };
  flip(); panicT = setInterval(flip, 4000);
}
function closePanic() { clearInterval(panicT); sheet('panic', false); }
$('temptedDark').onclick = openTempted;
$('panicBack').onclick = () => { closePanic(); goDark(); };
$('panicWind').onclick = () => { closePanic(); startWindDown(); };
$('panicHome').onclick = () => { closePanic(); leaveDark(); exitFs(); MM().go('home'); };

// ---- can't sleep / why am I awake ----
const whys = {
  mind: { t: 'Mind racing', b: "Thoughts at night feel urgent but they're just loud. Get them out of your head and into the box below — then they can wait until morning.", x: `<label for="nightDump" class="sr-only">What's circling?</label><textarea id="nightDump" placeholder="What's circling?"></textarea><p class="faint">Nothing is saved or sent. Just get it out.</p>` },
  body: { t: "Body won't settle", b: 'Do one slow pass: unclench your jaw, drop your shoulders, let your hands and legs go heavy. Then breathe out longer than you breathe in, ten times.', x: '' },
  awake: { t: 'Not sleepy is fine', b: "Don't lie there fighting it — that teaches your brain the bed is for worrying. Get up, keep lights dim, do something genuinely boring (paper book, stretching). Come back the moment you feel sleepy. No phone feeds — that's the trap that got us here.", x: '' },
  phone: { t: 'The phone can wait', b: "That pull is real — apps are built by teams whose whole job is to keep you on them at 1 a.m. Nothing in the feed is worth more than how tomorrow-you feels. Leave it charging across the room.", x: '' },
};
document.querySelectorAll('[data-why]').forEach(b => b.onclick = () => {
  const w = whys[b.dataset.why];
  $('cantTitle').textContent = w.t; $('cantBody').textContent = w.b; $('cantExtra').innerHTML = w.x;
  $('cantPick').classList.add('hide'); $('cantAnswer').classList.remove('hide');
});
export function openCant() {
  $('cantPick').classList.remove('hide'); $('cantAnswer').classList.add('hide'); sheet('cant', true);
}
$('cantBtn').onclick = openCant;
$('cantBack').onclick = () => { sheet('cant', false); goDark(); };
$('cantBack0').onclick = () => { sheet('cant', false); goDark(); };
$('cantHomeBtn').onclick = () => { sheet('cant', false); leaveDark(); exitFs(); MM().go('home'); };
