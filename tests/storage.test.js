import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, load, save, KEY, KEY_V1, KEY_CORRUPT, freshState } from '../src/storage.js';

class MockStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const plan = { cur: '05:30', goal: '00:30', wake: '09:00', step: 30, start: '2026-10-01', alarm: true };
const FRESH = { v: 2, plan: null, log: [], prefs: { sound: 'off', voice: false, remind: false } };
let store, S;
beforeEach(() => { store = new MockStorage(); S = createStorage(store); });

describe('load', () => {
  test('fresh load → empty v2 state, nothing written', () => {
    assert.deepEqual(S.load(), FRESH);
    assert.deepEqual(freshState(), FRESH);
    assert.equal(store.map.size, 0);
  });
  test('v1 blob migrates: fields renamed, onTime computed, old key untouched', () => {
    const v1 = JSON.stringify({ cur: '05:30', goal: '00:30', wake: '09:00', step: 30, alarm: true, start: '2026-10-01',
      log: [{ date: '2026-10-02', slept: '05:45' }, { date: '2026-10-03', slept: '07:00' }] });
    store.setItem(KEY_V1, v1);
    const st = S.load();
    assert.equal(st.v, 2);
    assert.deepEqual(st.plan, plan);
    assert.deepEqual(st.prefs, FRESH.prefs);
    assert.equal(st.log.length, 2);
    assert.equal(st.log[0].onTime, true);    // 05:45 vs planned 05:30 (+15)
    assert.equal(st.log[1].onTime, false);   // 07:00 vs planned 05:00 on night 2
    assert.equal(store.getItem(KEY_V1), v1);
    assert.deepEqual(JSON.parse(store.getItem(KEY)), st);
    assert.deepEqual(S.load(), st);          // second load reads v2 and agrees
  });
  test('v1 without a log still migrates', () => {
    store.setItem(KEY_V1, JSON.stringify({ cur: '05:30', goal: '00:30', wake: '09:00', step: 30, start: '2026-10-01' }));
    const st = S.load();
    assert.deepEqual(st.plan, { ...plan, alarm: false });
    assert.deepEqual(st.log, []);
  });
  test('corrupt JSON → fresh state, blob preserved under mymind.corrupt', () => {
    store.setItem(KEY, '{"v":2,"plan":');
    assert.deepEqual(S.load(), FRESH);
    assert.equal(store.getItem(KEY_CORRUPT), '{"v":2,"plan":');
    assert.equal(store.getItem(KEY), '{"v":2,"plan":');  // not overwritten until the user saves
  });
  test('parseable but not an object → treated as corrupt', () => {
    store.setItem(KEY, '[1,2,3]');
    assert.deepEqual(S.load(), FRESH);
    assert.equal(store.getItem(KEY_CORRUPT), '[1,2,3]');
  });
  test('corrupt v1 → fresh state, preserved', () => {
    store.setItem(KEY_V1, 'nope');
    assert.deepEqual(S.load(), FRESH);
    assert.equal(store.getItem(KEY_CORRUPT), 'nope');
    assert.equal(store.getItem(KEY), null);
  });
  test('missing log is repaired; invalid plan and prefs are repaired', () => {
    store.setItem(KEY, JSON.stringify({ v: 2, plan }));
    assert.deepEqual(S.load(), { ...FRESH, plan });
    store.setItem(KEY, JSON.stringify({ v: 2, plan: { ...plan, goal: '06:00' }, log: 'x', prefs: { sound: 'loud', voice: 'yes' } }));
    assert.deepEqual(S.load(), FRESH);
    store.setItem(KEY, JSON.stringify({ v: 2, plan: null, log: [{ date: '2026-10-02', slept: '05:45' }, { date: 'bad' }, null], prefs: { sound: 'rain', voice: true, remind: true } }));
    const st = S.load();
    assert.deepEqual(st.prefs, { sound: 'rain', voice: true, remind: true });
    assert.deepEqual(st.log, [{ date: '2026-10-02', slept: '05:45', onTime: false }]); // no plan → cannot have been on time
  });
});

describe('save / reset / export / import', () => {
  test('save → load round-trip', () => {
    const st = { v: 2, plan, log: [{ date: '2026-10-02', slept: '05:45', onTime: true }], prefs: { sound: 'deep', voice: true, remind: false } };
    S.save(st);
    assert.deepEqual(S.load(), st);
    assert.equal(typeof store.getItem(KEY), 'string');
  });
  test('same-date log entry replaces, log sorted by date, stored onTime kept', () => {
    S.save({ v: 2, plan, log: [
      { date: '2026-10-03', slept: '05:00', onTime: false },
      { date: '2026-10-02', slept: '07:00', onTime: false },
      { date: '2026-10-02', slept: '05:40', onTime: true },
    ], prefs: FRESH.prefs });
    const st = S.load();
    assert.equal(st.log.length, 2);
    assert.deepEqual(st.log.map(l => l.date), ['2026-10-02', '2026-10-03']);
    assert.deepEqual(st.log[0], { date: '2026-10-02', slept: '05:40', onTime: true });
    assert.equal(st.log[1].onTime, false);
  });
  test('reset wipes v2, v1 and the corrupt copy', () => {
    store.setItem(KEY_V1, '{}'); store.setItem(KEY_CORRUPT, 'x');
    S.save({ v: 2, plan, log: [], prefs: FRESH.prefs });
    S.reset();
    assert.equal(store.map.size, 0);
    assert.deepEqual(S.load(), FRESH);
  });
  test('export → import round-trip into another store', () => {
    const st = { v: 2, plan, log: [{ date: '2026-10-02', slept: '05:45', onTime: true }], prefs: { sound: 'rain', voice: false, remind: true } };
    S.save(st);
    const json = S.exportJSON();
    assert.deepEqual(JSON.parse(json), st);
    const S2 = createStorage(new MockStorage());
    assert.deepEqual(S2.importJSON(json), { ok: true, errors: [] });
    assert.deepEqual(S2.load(), st);
  });
  test('import of a v1 export is accepted', () => {
    const r = S.importJSON(JSON.stringify({ cur: '05:30', goal: '00:30', wake: '09:00', step: 30, start: '2026-10-01', log: [] }));
    assert.equal(r.ok, true);
    assert.deepEqual(S.load().plan, { ...plan, alarm: false });
  });
  test('import of garbage is rejected and leaves the store alone', () => {
    S.save({ v: 2, plan, log: [], prefs: FRESH.prefs });
    const before = store.getItem(KEY);
    for (const bad of ['nope', '[1,2]', '"str"', '{"v":3}',
      JSON.stringify({ v: 2, plan: { ...plan, goal: '06:00' } }),
      JSON.stringify({ v: 2, plan: { ...plan, start: 'soon' } }),
      JSON.stringify({ v: 2, plan: null, log: [{ date: '2026-10-02', slept: '25:00' }] }),
      JSON.stringify({ v: 2, plan: null, log: {} })]) {
      const r = S.importJSON(bad);
      assert.equal(r.ok, false, bad);
      assert.ok(r.errors.length > 0, bad);
    }
    assert.equal(store.getItem(KEY), before);
  });
});

describe('default exports use globalThis.localStorage', () => {
  test('load/save through the global', () => {
    globalThis.localStorage = new MockStorage();
    try {
      assert.deepEqual(load(), FRESH);
      save({ v: 2, plan, log: [], prefs: FRESH.prefs });
      assert.deepEqual(load().plan, plan);
    } finally { delete globalThis.localStorage; }
  });
  test('no storage at all → fresh state, no throw', () => {
    assert.deepEqual(load(), FRESH);
    assert.doesNotThrow(() => save(FRESH));
  });
});
