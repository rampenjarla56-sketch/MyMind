// MyMind — application shell (Agent 02).
// Screens: setup, home, progress, settings. All time/plan maths comes from
// ./domain.js and all persistence from ./storage.js; nothing is re-derived here.
// Night screens (wind-down, tempted, can't-sleep, dark, morning) live in ./night.js.

import {
  parseClock, fmtClock, nightMin, localDate, addDays,
  validatePlan, plannedBedtime, windDownStart, nightsRemaining,
  sleepOpportunity, opportunityCheck, isOnTime, chartData, skyData,
  WIND_DOWN_MIN, currentNight as domainCurrentNight, logNight } from './domain.js';
import * as storage from './storage.js';
import { startWindDown, openCant, openTempted } from './night.js';

const $ = id => document.getElementById(id);
const SHELL = ['setup', 'home', 'progress', 'settings'];
const REMIND_BEFORE_MIN = 10;

let state = storage.load();

// ---- clock helpers (reading the wall clock is the shell's job; maths is domain's) ----
function nowClock() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

// Which night is "tonight"? Before noon and before the wake time we are still
// inside last night (its date is yesterday's evening). Otherwise tonight is today.
function logTarget(plan, log) {
  const { nightDate: cur } = currentNight(plan);
  return logNight(nowClock(), parseClock(plan.wake) ?? 0, localDate(), plannedBedtime(plan, log, cur));
}

function currentNight(plan) {
  return domainCurrentNight(nowClock(), parseClock(plan.wake) ?? 0, localDate());
}

function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function persist() { storage.save(state); state = storage.load(); }

// ---- navigation ----
const render = { setup: renderSetup, home: renderHome, progress: renderProgress, settings: renderSettings };
function go(screen) {
  if (!SHELL.includes(screen)) screen = state.plan ? 'home' : 'setup';
  if (screen !== 'setup' && !state.plan) screen = 'setup';
  SHELL.forEach(s => $(s).classList.toggle('hide', s !== screen));
  render[screen]();
  window.scrollTo(0, 0);
}

// =============================================================================
// SETUP / ONBOARDING
// =============================================================================
let setupAttempted = false;

function readSetupForm() {
  return {
    cur: $('cur').value, goal: $('goal').value, wake: $('wake').value,
    step: Number($('step').value), start: localDate(), alarm: $('alarmOn').checked,
  };
}

function renderSetup() {
  const editing = !!state.plan;
  if (editing) {
    const p = state.plan;
    $('cur').value = p.cur; $('goal').value = p.goal; $('wake').value = p.wake;
    $('step').value = String(p.step); $('alarmOn').checked = !!p.alarm;
  }
  $('editNote').classList.toggle('hide', !editing);
  $('cancelSetup').classList.toggle('hide', !editing);
  $('savePlan').textContent = editing ? 'Save my plan' : 'Start my plan';
  setupAttempted = false;
  updateSetupPreview();
}

function updateSetupPreview() {
  const draft = readSetupForm();
  const v = validatePlan(draft);
  const errs = $('setupErrors');
  if (setupAttempted && !v.ok) {
    errs.innerHTML = v.errors.map(e => `<li>${e}</li>`).join('');
    errs.classList.remove('hide');
  } else {
    errs.classList.add('hide');
  }

  const preview = $('preview');
  if (v.ok) {
    const today = localDate();
    const first = plannedBedtime(draft, [], today);
    const nights = nightsRemaining(draft, [], today);
    const atGoal = nights === 0;
    preview.innerHTML =
      `<b>Tonight:</b> bed at ${fmtClock(first)}, wind-down from ${fmtClock(windDownStart(first))}.<br>` +
      (atGoal
        ? `You're already at your goal bedtime, so the plan just helps you hold it.`
        : `About <b>${nights} night${nights === 1 ? '' : 's'}</b> to reach ${draft.goal}, ${draft.step} min earlier each night.`);
  } else {
    const allParse = ['cur', 'goal', 'wake'].every(id => parseClock($(id).value) !== null);
    preview.textContent = allParse ? 'Adjust the times above to see your plan.' : 'Fill in the three times to see your plan.';
  }

  // Sleep-opportunity guardrail: judged on the goal schedule, shown calmly, never blocks.
  const guard = $('guardrail');
  const goalMin = parseClock(draft.goal), wakeMin = parseClock(draft.wake);
  if (goalMin !== null && wakeMin !== null) {
    const check = opportunityCheck(sleepOpportunity(nightMin(goalMin), wakeMin));
    guard.textContent = check.message;
    guard.classList.toggle('hide', check.ok);
    guard.classList.toggle('quiet', check.ok);
  } else {
    guard.classList.add('hide');
  }
}

$('setupForm').addEventListener('input', updateSetupPreview);
$('setupForm').addEventListener('change', updateSetupPreview);
$('setupForm').addEventListener('submit', e => {
  e.preventDefault();
  setupAttempted = true;
  const draft = readSetupForm();
  const v = validatePlan(draft);
  updateSetupPreview();
  if (!v.ok) {
    const firstBad = ['cur', 'goal', 'wake'].find(id => parseClock($(id).value) === null) || 'goal';
    $(firstBad).focus();
    return;
  }
  state.plan = draft;      // history (state.log) is untouched
  persist();
  remindedFor = null;
  go('home');
});
$('cancelSetup').onclick = () => go('home');

// =============================================================================
// HOME
// =============================================================================
function renderHome() {
  const { plan, log } = state;
  const { nightDate } = currentNight(plan);
  const planned = plannedBedtime(plan, log, nightDate);
  if (planned === null) { go('setup'); return; }

  const goal = nightMin(parseClock(plan.goal));
  const left = nightsRemaining(plan, log, nightDate);
  const opp = opportunityCheck(sleepOpportunity(planned, parseClock(plan.wake)));

  $('tonight').textContent = fmtClock(planned);
  $('windAt').textContent = `Wind-down at ${fmtClock(windDownStart(planned))} · wake at ${plan.wake}`;
  $('planinfo').textContent = planned <= goal
    ? (opp.ok ? "You're at your goal bedtime. Keep it steady." : "You're at the bedtime you set. See the note below.")
    : `Goal ${plan.goal} · about ${left} more night${left === 1 ? '' : 's'}. Same wake time every day, then daylight.`;
  const oppGoal = opportunityCheck(sleepOpportunity(goal, parseClock(plan.wake)));
  $('oppInfo').textContent = opp.ok
    ? `Tonight leaves about ${opp.hours} h for sleep.`
    : oppGoal.ok
      ? `About ${opp.hours} h for sleep tonight. Most teens do best with 8–10 h; each step of the plan opens that up.`
      : oppGoal.message;

  // Morning check-in describes last night (the night whose evening was yesterday).
  const today = localDate();
  const { nightDate: lastNight, morningDate: today2 } = logTarget(plan, log);
  const plannedLast = plannedBedtime(plan, log, lastNight);
  $('logPrompt').textContent = `Last night's plan was ${fmtClock(plannedLast)}. When did you actually fall asleep? Your best guess is fine.`;
  const todayEntry = log.find(l => l.date === today2);
  const recent = log.slice(-5).reverse().map(l => `${fmtDate(addDays(l.date, -1))} ${l.slept}`).join(' · ');
  $('logInfo').textContent = todayEntry
    ? `Logged for last night: fell asleep ${todayEntry.slept}${todayEntry.onTime ? ' · on time' : ' · later than planned. Tonight still counts.'}` +
      (recent ? `\nRecent: ${recent}` : '')
    : (recent ? `Recent: ${recent}` : '');

  tick();
}

$('saveLog').onclick = () => {
  const v = $('slept').value;
  if (!state.plan || parseClock(v) === null) { $('slept').focus(); return; }
  const { nightDate, morningDate: date } = logTarget(state.plan, state.log);
  // onTime is judged against the plan as it stood *before* this entry is added.
  const onTime = isOnTime(parseClock(v), plannedBedtime(state.plan, state.log, nightDate));
  state.log = state.log.filter(l => l.date !== date).concat([{ date, slept: v, onTime }]);
  persist();
  $('slept').value = '';
  renderHome();
};

// ---- countdown: recomputed from the wall clock on every tick ----
let remindedFor = null;

function tick() {
  if (!state.plan) return;
  const { nightDate, nowRef } = currentNight(state.plan);
  const planned = plannedBedtime(state.plan, state.log, nightDate);
  if (planned === null) return;
  const toBed = planned - nowRef;
  const toWind = toBed - WIND_DOWN_MIN;

  // Reminder (page-open only): fire once per night when the wind-down is ~10 min away.
  const soon = toWind <= REMIND_BEFORE_MIN && toWind > -WIND_DOWN_MIN;
  if (state.prefs.remind && soon && remindedFor !== nightDate) {
    remindedFor = nightDate;
    notify('MyMind', 'Wind-down starts in 10 min. Phone across the room, feeds closed.');
  }

  if ($('home').classList.contains('hide')) return;
  const el = $('countdown');
  el.textContent = toWind > 0
    ? `Wind-down starts in ${fmtDur(toWind)} (${WIND_DOWN_MIN} min before bed).`
    : toBed > 0
      ? `Wind-down time. Start now, bed in ${fmtDur(toBed)}.`
      : `Bedtime was ${fmtDur(-toBed)} ago. Start now — an imperfect night still counts.`;
  el.classList.toggle('soon', state.prefs.remind && soon);
  updateRemindBtn(toWind);
}

function updateRemindBtn(toWind) {
  const b = $('remindBtn');
  const on = state.prefs.remind;
  b.classList.toggle('hide', !on && toWind <= REMIND_BEFORE_MIN);
  b.textContent = on ? 'Reminder on — tap to turn off' : 'Remind me 10 min before wind-down';
  b.setAttribute('aria-pressed', String(on));
}

function notify(title, body) {
  try {
    if (!window.Notification || Notification.permission !== 'granted') return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready
        .then(r => r.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'mymind-wind' }))
        .catch(() => {});
    } else {
      new Notification(title, { body, tag: 'mymind-wind' });
    }
  } catch { /* notifications unavailable: the in-page cue still shows */ }
}

function setRemind(on) {
  state.prefs.remind = on;
  persist();
  if (on && window.Notification && Notification.permission === 'default') {
    try { Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
  }
  tick();
  if (!$('settings').classList.contains('hide')) renderSettings();
}
$('remindBtn').onclick = () => setRemind(!state.prefs.remind);

setInterval(tick, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.addEventListener('focus', tick);

// ---- night entry points (behaviour lives in night.js) ----
$('startWind').onclick = () => startWindDown();
$('tempted').onclick = () => openTempted();
$('cantHome').onclick = () => openCant();
$('toProgress').onclick = () => go('progress');
$('toSettings').onclick = () => go('settings');

// =============================================================================
// PROGRESS
// =============================================================================
function hashStr(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}

function renderSky() {
  const { stars, count, brightCount } = skyData(state.plan, state.log);
  let el = '';
  for (const s of stars) {
    const h = hashStr(s.nightDate), x = 20 + (h % 400), y = 14 + ((h >> 8) % 112);
    el += `<circle cx="${x}" cy="${y}" r="${s.bright ? 2.4 : 1.4}" fill="${s.bright ? '#e8d9ae' : '#5a5f72'}" opacity="${s.bright ? 0.95 : 0.7}"><title>${fmtDate(s.nightDate)}: ${s.bright ? 'on time' : 'later than planned'}</title></circle>`;
    if (s.bright) el += `<circle cx="${x}" cy="${y}" r="5.5" fill="#e8d9ae" opacity="0.12"/>`;
  }
  // The moon fills as on-time nights accumulate (full at 21). It only ever fills.
  const ph = Math.min(brightCount / 21, 1), r = 16, cx = 395, cy = 34;
  el += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#20263b"/>`;
  if (ph > 0) {
    el += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#d8cba0" opacity="${0.25 + ph * 0.75}"/>`;
    if (ph < 1) el += `<circle cx="${cx - r * 2 * (1 - ph) * 0.8}" cy="${cy - 3}" r="${r}" fill="#10152a"/>`;
  }
  const svg = $('sky');
  svg.querySelectorAll('circle').forEach(c => c.remove());
  svg.insertAdjacentHTML('beforeend', el);
  const desc = count === 0
    ? 'No nights logged yet.'
    : `${count} night${count === 1 ? '' : 's'} logged, ${brightCount} on time.`;
  $('skyDesc').textContent = desc;
  $('skyInfo').textContent = count === 0
    ? 'Every night you log becomes a star. On-time nights shine. Nothing here ever disappears.'
    : `${count} night${count === 1 ? '' : 's'} in your sky · ${brightCount} on time. A rough night never removes a star.`;
}

function renderChart() {
  const W = 440, H = 260, L = 46, R = 12, T = 14, B = 30, days = 14;
  const end = addDays(localDate(), -1); // last night is the newest night that can be logged
  const rows = chartData(state.plan, state.log, end, days);
  const lo = nightMin(21 * 60), hi = nightMin(7 * 60); // 21:00 .. 07:00 next morning
  const X = i => L + (W - L - R) * i / (days - 1);
  const Y = m => T + (H - T - B) * (Math.min(Math.max(m, lo), hi) - lo) / (hi - lo);
  let el = '';
  for (const hh of [22, 24, 26, 28, 30]) {
    const y = Y(hh * 60);
    el += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="#20263b"/>` +
          `<text x="${L - 6}" y="${y + 4}" fill="#a09c90" font-size="11" text-anchor="end">${fmtClock(hh * 60)}</text>`;
  }
  let line = '', started = false;
  rows.forEach((r, i) => {
    if (r.planned === null) return;
    line += (started ? 'L' : 'M') + X(i) + ' ' + Y(r.planned) + ' ';
    started = true;
  });
  el += `<path d="${line}" stroke="#c9a46a" stroke-width="1.5" fill="none" stroke-dasharray="4 3" opacity="0.8"/>`;
  let logged = 0, onTime = 0;
  rows.forEach((r, i) => {
    if (r.actual !== null) {
      logged++; if (r.onTime) onTime++;
      el += `<circle cx="${X(i)}" cy="${Y(r.actual)}" r="5" fill="${r.onTime ? '#7aa37a' : '#b3765a'}"/>`;
    } else if (r.planned !== null) {
      el += `<circle cx="${X(i)}" cy="${Y(r.planned)}" r="3.5" fill="#131a2e" stroke="#a09c90" stroke-width="1.2"/>`;
    }
  });
  for (const i of [0, 7, 13]) {
    el += `<text x="${X(i)}" y="${H - 10}" fill="#a09c90" font-size="11" text-anchor="middle">${fmtDate(rows[i].nightDate)}</text>`;
  }
  const svg = $('chartSvg');
  svg.querySelectorAll('line,text,path,circle').forEach(c => c.remove());
  svg.insertAdjacentHTML('beforeend', el);
  $('chartDesc').textContent = `Last ${days} nights: ${logged} logged, ${onTime} on time. The dashed line is the planned bedtime; the list below has every night.`;
  $('chartNote').textContent = logged
    ? `${logged} logged night${logged === 1 ? '' : 's'} in the last two weeks. Unlogged nights are just unlogged; nothing is scored.`
    : 'No logged nights in the last two weeks yet. Log each morning and the truth shows up here.';
  $('nightList').innerHTML = rows.map(r => {
    const when = fmtDate(r.nightDate);
    const plan = r.planned === null ? '—' : fmtClock(r.planned);
    const act = r.actual === null ? 'not logged' : `slept ${fmtClock(r.actual)} · ${r.onTime ? 'on time' : 'later'}`;
    return `<li><span>${when}</span><span>plan ${plan} · ${act}</span></li>`;
  }).join('');
}

function renderProgress() { renderSky(); renderChart(); }
$('progressBack').onclick = () => go('home');

// =============================================================================
// SETTINGS
// =============================================================================
function renderSettings() {
  const p = state.plan;
  $('planSummary').textContent = p
    ? `From ${p.cur} toward ${p.goal}, ${p.step} min earlier each night. Wake at ${p.wake}. Started ${fmtDate(p.start)}.`
    : 'No plan yet.';
  document.querySelectorAll('[data-pref-sound]').forEach(b => {
    const on = b.dataset.prefSound === state.prefs.sound;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('prefVoice').checked = !!state.prefs.voice;
  $('prefRemind').checked = !!state.prefs.remind;
}

$('settingsBack').onclick = () => go('home');
$('editPlan').onclick = () => go('setup');
document.querySelectorAll('[data-pref-sound]').forEach(b => b.onclick = () => {
  state.prefs.sound = b.dataset.prefSound;
  persist();
  renderSettings();
});
$('prefVoice').onchange = e => { state.prefs.voice = e.target.checked; persist(); };
$('prefRemind').onchange = e => setRemind(e.target.checked);

$('exportBtn').onclick = () => {
  const json = storage.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `mymind-${localDate()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  $('dataStatus').textContent = `Exported ${state.log.length} logged night${state.log.length === 1 ? '' : 's'} and your plan.`;
};

$('importFile').onchange = async e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  let text = '';
  try { text = await file.text(); } catch { text = ''; }
  const result = storage.importJSON(text);
  e.target.value = '';
  if (!result.ok) {
    $('dataStatus').textContent = 'Not imported: ' + result.errors.join(' ');
    return;
  }
  state = storage.load();
  remindedFor = null;
  $('dataStatus').textContent = `Imported: ${state.log.length} logged night${state.log.length === 1 ? '' : 's'}${state.plan ? ' and your plan' : ''}.`;
  renderSettings();
  if (!state.plan) go('setup');
};

const dlg = $('resetDlg');
$('resetBtn').onclick = () => {
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else if (window.confirm('Erase your plan, every logged night and your settings from this phone? There is no undo.')) doReset();
};
$('resetNo').onclick = () => dlg.close();
$('resetYes').onclick = () => { dlg.close(); doReset(); };
function doReset() {
  storage.reset();
  state = storage.load();
  remindedFor = null;
  $('dataStatus').textContent = '';
  go('setup');
}

// =============================================================================
// Boundary for night.js (see docs/ARCHITECTURE.md → UI contracts)
// =============================================================================
window.MyMind = {
  get state() { return state; },
  save() { persist(); },   // normalises and re-reads: read MyMind.state again after saving
  go,
  tick,
};

go(state.plan ? 'home' : 'setup');

// ---- PWA ----
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
