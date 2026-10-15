// MyMind — domain logic. Pure functions only: no DOM, no storage, no Date.now().
// Callers pass dates and minutes in; every number the app shows comes from here.
//
// ─────────────────────────────────────────────────────────────────────────────
// TIME MODEL
//   clock minutes  0..1439, from an 'HH:MM' string (parseClock / fmtClock).
//   night minutes  the same clock, but anything before noon counts as "after
//                  midnight": m < 720 ? m + 1440 : m. So 23:00 → 1380,
//                  00:30 → 1470, 05:30 → 1770 and the evening orders correctly.
//   local date     'YYYY-MM-DD' built from local getters, never toISOString().
//   night date     the date of the evening. A morning log saved on date D
//                  describes night addDays(D, -1).
//
// PROGRESSION (plannedBedtime)
//   Night 0 is plan.start and its planned bedtime is plan.cur. Each following
//   night moves plan.step minutes earlier, never below plan.goal (so the last
//   step may be shorter). Nights before plan.start use plan.cur. The planned
//   bedtime never moves later than the night before.
//
// HOLD RULE
//   If the previous night was logged and the actual bedtime was more than
//   60 minutes later than that night's plan, tonight repeats the previous
//   night's planned value instead of moving earlier. Two late nights hold
//   twice; an on-time (or missing) night resumes the step. A hold is never a
//   penalty: nothing moves later, and the goal is only reached a little later.
//   Because holds depend on history, plannedBedtime walks night by night from
//   plan.start and the log is the only input besides the plan.
//
// SAFETY (sleepOpportunity / opportunityCheck) is kept separate from the
// progression: it judges a schedule, it never changes one.
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [15, 30, 45];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const HOLD_LATE_MIN = 60;
export const WIND_DOWN_MIN = 30;
export const MIN_OPPORTUNITY = 480;

// ---- clock -----------------------------------------------------------------

export function parseClock(str) {
  if (typeof str !== 'string') return null;
  const m = CLOCK_RE.exec(str.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtClock(min) {
  if (!Number.isFinite(min)) return '--:--';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export function nightMin(min) {
  return min < 720 ? min + 1440 : min;
}

// ---- dates -----------------------------------------------------------------

function pad2(n) { return String(n).padStart(2, '0'); }

export function localDate(date = new Date()) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function parts(dateStr) {
  const m = typeof dateStr === 'string' ? DATE_RE.exec(dateStr) : null;
  if (!m) return null;
  return [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
}

export function isDateStr(dateStr) {
  const p = parts(dateStr);
  if (!p) return false;
  const d = new Date(p[0], p[1], p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] && d.getDate() === p[2];
}

export function addDays(dateStr, n) {
  const p = parts(dateStr);
  if (!p) return null;
  return localDate(new Date(p[0], p[1], p[2] + n));
}

// Whole days from a to b (b − a). Uses UTC day numbers so DST never yields 0.96 days.
export function dayDiff(a, b) {
  const pa = parts(a), pb = parts(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pb[0], pb[1], pb[2]) - Date.UTC(pa[0], pa[1], pa[2])) / 864e5);
}

// ---- plan ------------------------------------------------------------------

export function validatePlan(plan) {
  const errors = [];
  const p = plan || {};
  const times = { cur: 'current bedtime', goal: 'goal bedtime', wake: 'wake time' };
  const mins = {};
  for (const key of Object.keys(times)) {
    const v = p[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      errors.push(`Enter your ${times[key]}.`);
    } else {
      mins[key] = parseClock(String(v));
      if (mins[key] === null) errors.push(`The ${times[key]} must be a time like 23:30.`);
    }
  }
  if (mins.cur != null && mins.goal != null && nightMin(mins.goal) > nightMin(mins.cur)) {
    errors.push('The goal bedtime has to be earlier than (or the same as) the current one.');
  }
  if (mins.wake != null && mins.cur != null && mins.goal != null &&
      (nightMin(mins.wake) <= nightMin(mins.cur) || nightMin(mins.wake) <= nightMin(mins.goal))) {
    errors.push('The wake time has to come after both bedtimes (morning, after you have slept).');
  }
  const step = Number(p.step);
  if (!STEPS.includes(step)) errors.push('Pick a step of 15, 30 or 45 minutes.');
  return { ok: errors.length === 0, errors };
}

// Map morning-date → log entry; later entries for the same date win.
function logByDate(log) {
  const map = new Map();
  for (const l of Array.isArray(log) ? log : []) {
    if (l && typeof l.date === 'string') map.set(l.date, l);
  }
  return map;
}

function actualNightMin(entry) {
  if (!entry) return null;
  const m = parseClock(entry.slept);
  return m === null ? null : nightMin(m);
}

// Walks from plan.start to nightDate applying the step and the HOLD rule.
function walk(plan, log, nightDate) {
  const cur = nightMin(parseClock(plan.cur));
  const goal = Math.min(cur, nightMin(parseClock(plan.goal)));
  const step = Number(plan.step);
  const days = dayDiff(plan.start, nightDate);
  if (!(days > 0)) return cur; // night 0, before the start, or an unparsable date
  const byDate = logByDate(log);
  let planned = cur;
  let prevNight = plan.start;
  for (let i = 1; i <= days; i++) {
    const prevActual = actualNightMin(byDate.get(addDays(prevNight, 1)));
    const late = prevActual !== null && prevActual > planned + HOLD_LATE_MIN;
    if (!late) planned = Math.max(goal, planned - step);
    prevNight = addDays(prevNight, 1);
  }
  return planned;
}

export function plannedBedtime(plan, log, nightDate) {
  if (!plan || !validatePlan(plan).ok) return null;
  return walk(plan, log, nightDate);
}

export function windDownStart(bedtimeNightMin) {
  return bedtimeNightMin - WIND_DOWN_MIN;
}

// Nights still to go after nightDate before the plan reaches the goal (0 once there).
export function nightsRemaining(plan, log, nightDate) {
  const planned = plannedBedtime(plan, log, nightDate);
  if (planned === null) return 0;
  const goal = nightMin(parseClock(plan.goal));
  return Math.max(0, Math.ceil((planned - goal) / Number(plan.step)));
}

// ---- sleep opportunity / safety --------------------------------------------

// Minutes from going to bed until the wake alarm, wrapping past midnight.
export function sleepOpportunity(bedtimeNightMin, wakeMin) {
  const bed = ((bedtimeNightMin % 1440) + 1440) % 1440;
  return (((wakeMin - bed) % 1440) + 1440) % 1440;
}

export function opportunityCheck(minutes) {
  const hours = Math.round(minutes / 6) / 10;
  const ok = minutes >= MIN_OPPORTUNITY;
  const h = hours % 1 === 0 ? String(hours) : hours.toFixed(1);
  const message = ok
    ? `About ${h} h between bedtime and wake time. Most teens do best with 8–10 h, so this schedule has room for it.`
    : `About ${h} h between bedtime and wake time. Most teens do best with 8–10 h. A later wake time or an earlier goal would open that up; until then this schedule stays a work in progress, not a win.`;
  return { ok, hours, message };
}

export function sleepRemaining(nowMin, wakeMin) {
  return (((wakeMin - nowMin) % 1440) + 1440) % 1440;
}

export function isOnTime(actualMin, plannedNightMin, graceMin = 30) {
  if (!Number.isFinite(actualMin) || !Number.isFinite(plannedNightMin)) return false;
  return nightMin(actualMin) <= plannedNightMin + graceMin;
}

// Stored onTime is the historical truth (judged against the plan of that time);
// legacy entries are judged against the plan+log we have now.
function entryOnTime(entry, plan, log) {
  if (typeof entry.onTime === 'boolean') return entry.onTime;
  const actual = parseClock(entry.slept);
  const planned = plannedBedtime(plan, log, addDays(entry.date, -1));
  if (actual === null || planned === null) return null;
  return isOnTime(actual, planned);
}

// ---- progress views --------------------------------------------------------

export function chartData(plan, log, endDate, days = 14) {
  const rows = [];
  const byDate = logByDate(log);
  for (let i = days - 1; i >= 0; i--) {
    const nightDate = addDays(endDate, -i);
    const entry = byDate.get(addDays(nightDate, 1));
    const planned = plannedBedtime(plan, log, nightDate);
    const actual = actualNightMin(entry);
    let onTime = null;
    if (entry) {
      if (typeof entry.onTime === 'boolean') onTime = entry.onTime;
      else if (actual !== null && planned !== null) onTime = isOnTime(actual, planned);
    }
    rows.push({ nightDate, planned, actual, onTime });
  }
  return rows;
}

export function skyData(plan, log) {
  const stars = [];
  for (const entry of logByDate(log).values()) {
    stars.push({ nightDate: addDays(entry.date, -1), bright: entryOnTime(entry, plan, log) === true });
  }
  stars.sort((a, b) => (a.nightDate < b.nightDate ? -1 : a.nightDate > b.nightDate ? 1 : 0));
  return { stars, count: stars.length, brightCount: stars.filter(s => s.bright).length };
}

// Which night is "tonight" for a given wall-clock moment. Before noon and before the
// wake time the user is still inside last night, so the night date is yesterday and
// "now" is expressed in night minutes so it compares with a planned bedtime.
export function currentNight(nowMin, wakeMin, today) {
  const inNight = nowMin < 720 && nowMin < wakeMin;
  return { nightDate: inNight ? addDays(today, -1) : today, nowRef: inNight ? nightMin(nowMin) : nowMin, inNight };
}

// Which night the morning check-in describes. Before the planned bedtime on a
// night still in progress (02:00, bed at 05:00) the user has not slept yet, so
// "last night" is the night before the one in progress.
export function logNight(nowMin, wakeMin, today, plannedNightMin) {
  const cn = currentNight(nowMin, wakeMin, today);
  const notYetInBed = cn.inNight && plannedNightMin !== null && cn.nowRef < plannedNightMin;
  const nightDate = notYetInBed ? addDays(cn.nightDate, -1) : (cn.inNight ? cn.nightDate : addDays(today, -1));
  return { nightDate, morningDate: addDays(nightDate, 1) };
}
