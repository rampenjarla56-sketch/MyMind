// MyMind — versioned local state over localStorage. Nothing here ever leaves the device.
//
// Keys:   mymind.v2       current state (schema below)
//         mymind.v1       the original single-file app's blob; migrated on first load, never modified
//         mymind.corrupt  the last unparsable v2/v1 blob, kept so nothing is silently thrown away
//
// state = { v: 2,
//           plan: null | { cur:'HH:MM', goal:'HH:MM', wake:'HH:MM', step:15|30|45,
//                          start:'YYYY-MM-DD', alarm:boolean },
//           log:  [{ date:'YYYY-MM-DD' (morning), slept:'HH:MM', onTime:boolean }]   // one per date, sorted
//           prefs:{ sound:'off'|'rain'|'deep', voice:boolean, remind:boolean } }
//
// The store is injectable: createStorage(store) takes anything with getItem/setItem/removeItem
// (a Map-backed mock in tests). The bare exports use globalThis.localStorage at call time.

import { parseClock, isDateStr, addDays, isOnTime, plannedBedtime, validatePlan } from './domain.js';

export const KEY = 'mymind.v2';
export const KEY_V1 = 'mymind.v1';
export const KEY_CORRUPT = 'mymind.corrupt';
const SOUNDS = ['off', 'rain', 'deep'];

export function freshState() {
  return { v: 2, plan: null, log: [], prefs: { sound: 'off', voice: false, remind: false, phone: null, phoneDone: false }, windDown: null };
}

// In-progress wind-down so a refresh mid-routine can resume. Owned by night.js.
function normalizeWindDown(w) {
  if (!isObj(w)) return null;
  const startedAt = Number(w.startedAt), stepIndex = Number(w.stepIndex);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isInteger(stepIndex) || stepIndex < 0) return null;
  // lightsOut (epoch ms) was added later; older blobs lack it → null and night.js recomputes.
  const lightsOut = typeof w.lightsOut === 'number' && Number.isFinite(w.lightsOut) && w.lightsOut > 0 ? w.lightsOut : null;
  return { startedAt, stepIndex, lightsOut };
}

function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

function normalizePlan(p) {
  if (!isObj(p)) return null;
  const plan = {
    cur: String(p.cur ?? ''), goal: String(p.goal ?? ''), wake: String(p.wake ?? ''),
    step: Number(p.step), start: String(p.start ?? ''), alarm: !!p.alarm,
  };
  if (!validatePlan(plan).ok || !isDateStr(plan.start)) return null;
  return plan;
}

// Drops unusable entries, keeps the last entry per morning date, sorts by date.
// onTime is computed for entries that lack it (legacy v1 rows), using plan + log.
function normalizeLog(log, plan) {
  const byDate = new Map();
  for (const l of Array.isArray(log) ? log : []) {
    if (!isObj(l) || !isDateStr(l.date) || parseClock(l.slept) === null) continue;
    byDate.set(l.date, { date: l.date, slept: l.slept.trim(), onTime: l.onTime });
  }
  const out = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const l of out) {
    if (typeof l.onTime === 'boolean') continue;
    const planned = plan ? plannedBedtime(plan, out, addDays(l.date, -1)) : null;
    l.onTime = planned === null ? false : isOnTime(parseClock(l.slept), planned);
  }
  return out;
}

function normalizePrefs(p) {
  const d = freshState().prefs;
  if (!isObj(p)) return d;
  return {
    sound: SOUNDS.includes(p.sound) ? p.sound : d.sound,
    voice: typeof p.voice === 'boolean' ? p.voice : d.voice,
    remind: typeof p.remind === 'boolean' ? p.remind : d.remind,
    phone: p.phone === 'ios' || p.phone === 'android' ? p.phone : null,
    phoneDone: p.phoneDone === true,
  };
}

// Any object → valid v2 state. Repairs missing/invalid fields instead of failing.
export function normalize(raw) {
  if (!isObj(raw)) return freshState();
  const plan = normalizePlan(raw.plan);
  return { v: 2, plan, log: normalizeLog(raw.log, plan), prefs: normalizePrefs(raw.prefs), windDown: normalizeWindDown(raw.windDown) };
}

// v1 blob {cur,goal,wake,step,alarm,start,log} → v2 state.
export function migrateV1(v1) {
  if (!isObj(v1)) return freshState();
  const plan = normalizePlan({ cur: v1.cur, goal: v1.goal, wake: v1.wake, step: v1.step, start: v1.start, alarm: v1.alarm });
  return { v: 2, plan, log: normalizeLog(v1.log, plan), prefs: freshState().prefs, windDown: null };
}

// Strict check used by importJSON: reports problems instead of repairing them.
function checkImport(raw) {
  const errors = [];
  if (!isObj(raw)) return ['Not a MyMind export.'];
  const isV1 = raw.v === undefined && typeof raw.cur === 'string';
  if (raw.v !== 2 && !isV1) errors.push('Unknown export version.');
  const plan = isV1 ? raw : raw.plan;
  if (plan !== null && plan !== undefined) {
    const v = validatePlan(plan);
    if (!v.ok) errors.push(...v.errors);
    else if (!isDateStr(String(plan.start))) errors.push('The plan start date is invalid.');
  }
  if (raw.log !== undefined) {
    if (!Array.isArray(raw.log)) errors.push('The log must be a list.');
    else raw.log.forEach((l, i) => {
      if (!isObj(l) || !isDateStr(l.date) || parseClock(l.slept) === null) errors.push(`Log entry ${i + 1} is invalid.`);
    });
  }
  if (raw.prefs !== undefined && !isObj(raw.prefs)) errors.push('Preferences are invalid.');
  return errors;
}

export function createStorage(store) {
  const s = () => store || globalThis.localStorage;
  const get = k => { try { return s().getItem(k); } catch { return null; } };
  const set = (k, v) => { try { s().setItem(k, v); } catch { /* quota or private mode: keep running */ } };
  const del = k => { try { s().removeItem(k); } catch { /* ignore */ } };

  function parseOrCorrupt(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isObj(parsed)) return parsed;
    } catch { /* fall through */ }
    set(KEY_CORRUPT, raw);
    return null;
  }

  function load() {
    const raw2 = get(KEY);
    if (raw2 !== null && raw2 !== undefined) {
      const parsed = parseOrCorrupt(raw2);
      return parsed ? normalize(parsed) : freshState();
    }
    const raw1 = get(KEY_V1);
    if (raw1 !== null && raw1 !== undefined) {
      const parsed = parseOrCorrupt(raw1);
      const state = parsed ? migrateV1(parsed) : freshState();
      if (parsed) set(KEY, JSON.stringify(state)); // v1 key stays untouched
      return state;
    }
    return freshState();
  }

  function save(state) {
    set(KEY, JSON.stringify(normalize(state)));
  }

  // Explicit user action only. Also drops v1 and the corrupt copy so nothing resurrects.
  function reset() {
    del(KEY); del(KEY_V1); del(KEY_CORRUPT);
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(str) {
    let raw;
    try { raw = JSON.parse(String(str)); } catch { return { ok: false, errors: ['That file is not valid JSON.'] }; }
    const errors = checkImport(raw);
    if (errors.length) return { ok: false, errors };
    const state = raw.v === 2 ? normalize(raw) : migrateV1(raw);
    save(state);
    return { ok: true, errors: [] };
  }

  return { load, save, reset, exportJSON, importJSON };
}

const defaultStorage = createStorage(null);
export const load = defaultStorage.load;
export const save = defaultStorage.save;
export const reset = defaultStorage.reset;
export const exportJSON = defaultStorage.exportJSON;
export const importJSON = defaultStorage.importJSON;
