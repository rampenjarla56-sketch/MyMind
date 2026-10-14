import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseClock, fmtClock, nightMin, localDate, addDays, dayDiff, validatePlan,
  plannedBedtime, windDownStart, nightsRemaining, sleepOpportunity, opportunityCheck,
  sleepRemaining, isOnTime, chartData, skyData,
} from '../src/domain.js';

// cur 05:30 (1770) → goal 00:30 (1470), 30-min steps, started 2026-10-01
const planA = { cur: '05:30', goal: '00:30', wake: '09:00', step: 30, start: '2026-10-01', alarm: true };
const night = i => addDays('2026-10-01', i);

describe('parseClock / fmtClock / nightMin', () => {
  test('valid clocks', () => {
    assert.equal(parseClock('00:00'), 0);
    assert.equal(parseClock('23:59'), 1439);
    assert.equal(parseClock('7:05'), 425);
    assert.equal(parseClock(' 05:30 '), 330);
  });
  test('invalid clocks → null', () => {
    assert.equal(parseClock('24:00'), null);
    assert.equal(parseClock('7:5'), null);
    assert.equal(parseClock(''), null);
    assert.equal(parseClock('garbage'), null);
    assert.equal(parseClock('12:60'), null);
    assert.equal(parseClock(null), null);
    assert.equal(parseClock(330), null);
  });
  test('fmtClock wraps and pads', () => {
    assert.equal(fmtClock(0), '00:00');
    assert.equal(fmtClock(1470), '00:30');
    assert.equal(fmtClock(1440), '00:00');
    assert.equal(fmtClock(-30), '23:30');
    assert.equal(fmtClock(NaN), '--:--');
  });
  test('nightMin orders the evening correctly: 23:00 < 00:30 < 05:30', () => {
    const a = nightMin(parseClock('23:00')), b = nightMin(parseClock('00:30')), c = nightMin(parseClock('05:30'));
    assert.deepEqual([a, b, c], [1380, 1470, 1770]);
    assert.ok(a < b && b < c);
    assert.equal(nightMin(720), 720);
    assert.equal(nightMin(719), 2159);
  });
});

describe('dates', () => {
  test('localDate uses local getters', () => {
    assert.equal(localDate(new Date(2026, 0, 5)), '2026-01-05');
    assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
  });
  test('addDays across month, year, leap day', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2026-10-01', 13), '2026-10-14');
    assert.equal(addDays('bad', 1), null);
  });
  test('dayDiff across boundaries and DST days', () => {
    assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
    assert.equal(dayDiff('2026-10-14', '2026-10-01'), -13);
    assert.equal(dayDiff('2026-10-31', '2026-11-02'), 2);   // US DST end 2026-11-01
    assert.equal(dayDiff('2026-03-07', '2026-03-09'), 2);   // US DST start 2026-03-08
    assert.equal(dayDiff('2026-03-28', '2026-03-30'), 2);   // EU DST start 2026-03-29
    assert.equal(addDays('2026-11-01', 1), '2026-11-02');
    assert.equal(addDays('2026-03-08', 1), '2026-03-09');
    assert.ok(Number.isNaN(dayDiff('x', '2026-01-01')));
  });
});

describe('validatePlan', () => {
  test('valid plan', () => assert.deepEqual(validatePlan(planA), { ok: true, errors: [] }));
  test('equal goal and current is valid', () => assert.equal(validatePlan({ ...planA, goal: '05:30' }).ok, true));
  test('string step is accepted', () => assert.equal(validatePlan({ ...planA, step: '45' }).ok, true));
  test('goal later than current → error', () => {
    const r = validatePlan({ ...planA, cur: '00:30', goal: '01:00' });
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /goal/i);
  });
  test('goal 23:00 from cur 01:00 is valid (crosses midnight the right way)', () => {
    assert.equal(validatePlan({ ...planA, cur: '01:00', goal: '23:00' }).ok, true);
    assert.equal(validatePlan({ ...planA, cur: '23:00', goal: '01:00' }).ok, false);
  });
  test('empty field → error', () => {
    const r = validatePlan({ ...planA, wake: '' });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /wake/i);
    assert.equal(validatePlan({}).errors.length, 4);
  });
  test('bad time → error', () => assert.equal(validatePlan({ ...planA, cur: '25:00' }).ok, false));
  test('step 20 → error', () => {
    const r = validatePlan({ ...planA, step: 20 });
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /15, 30 or 45/);
  });
});

describe('plannedBedtime progression', () => {
  test('05:30 → 00:30 by 30: 10 nights, lands exactly on 00:30', () => {
    assert.equal(plannedBedtime(planA, [], night(0)), 1770);
    assert.equal(plannedBedtime(planA, [], night(1)), 1740);
    assert.equal(plannedBedtime(planA, [], night(9)), 1500);
    assert.equal(plannedBedtime(planA, [], night(10)), 1470);
    assert.equal(fmtClock(plannedBedtime(planA, [], night(10))), '00:30');
    assert.equal(nightsRemaining(planA, [], night(0)), 10);
    assert.equal(nightsRemaining(planA, [], night(9)), 1);
    assert.equal(nightsRemaining(planA, [], night(10)), 0);
  });
  test('by 15 and by 45; final short step', () => {
    const p15 = { ...planA, step: 15 }, p45 = { ...planA, step: 45 };
    assert.equal(plannedBedtime(p15, [], night(19)), 1485);
    assert.equal(plannedBedtime(p15, [], night(20)), 1470);
    assert.equal(nightsRemaining(p15, [], night(0)), 20);
    assert.equal(plannedBedtime(p45, [], night(6)), 1500);
    assert.equal(plannedBedtime(p45, [], night(7)), 1470); // last step is 30, not 45
    assert.equal(nightsRemaining(p45, [], night(0)), 7);
    assert.equal(nightsRemaining(p45, [], night(6)), 1);
  });
  test('beyond the goal stays at goal; start in the future → cur', () => {
    assert.equal(plannedBedtime(planA, [], night(40)), 1470);
    assert.equal(nightsRemaining(planA, [], night(40)), 0);
    assert.equal(plannedBedtime(planA, [], night(-3)), 1770);
    assert.equal(nightsRemaining(planA, [], night(-3)), 10);
  });
  test('never moves later', () => {
    let prev = Infinity;
    for (let i = -2; i < 30; i++) {
      const p = plannedBedtime(planA, [], night(i));
      assert.ok(p <= prev, `night ${i}`);
      prev = p;
    }
  });
  test('cur 01:00 → goal 23:00 crosses midnight correctly', () => {
    const p = { ...planA, cur: '01:00', goal: '23:00' };
    assert.equal(fmtClock(plannedBedtime(p, [], night(0))), '01:00');
    assert.equal(fmtClock(plannedBedtime(p, [], night(1))), '00:30');
    assert.equal(fmtClock(plannedBedtime(p, [], night(2))), '00:00');
    assert.equal(fmtClock(plannedBedtime(p, [], night(3))), '23:30');
    assert.equal(plannedBedtime(p, [], night(4)), 1380);
    assert.equal(plannedBedtime(p, [], night(5)), 1380);
    assert.equal(nightsRemaining(p, [], night(0)), 4);
  });
  test('equal cur and goal: always goal, 0 remaining', () => {
    const p = { ...planA, goal: '05:30' };
    assert.equal(plannedBedtime(p, [], night(5)), 1770);
    assert.equal(nightsRemaining(p, [], night(0)), 0);
  });
  test('invalid plan → null', () => {
    assert.equal(plannedBedtime(null, [], night(0)), null);
    assert.equal(plannedBedtime({ ...planA, step: 20 }, [], night(0)), null);
  });
  test('windDownStart is 30 min before', () => assert.equal(windDownStart(1770), 1740));
});

describe('HOLD rule', () => {
  // morning date D describes night D−1
  const late = d => ({ date: addDays(d, 1), slept: '07:00' });  // 1860 > planned + 60 for every night here
  test('late night holds the next night', () => {
    const log = [late(night(0))];
    assert.equal(plannedBedtime(planA, log, night(1)), 1770);
    assert.equal(plannedBedtime(planA, log, night(2)), 1740); // resumes with no log for night 1
    assert.equal(nightsRemaining(planA, log, night(1)), 10);
  });
  test('two late nights hold twice', () => {
    const log = [late(night(0)), late(night(1))];
    assert.equal(plannedBedtime(planA, log, night(1)), 1770);
    assert.equal(plannedBedtime(planA, log, night(2)), 1770);
    assert.equal(plannedBedtime(planA, log, night(3)), 1740);
  });
  test('on-time night resumes the step', () => {
    const log = [late(night(0)), { date: night(2), slept: '05:45' }];
    assert.equal(plannedBedtime(planA, log, night(2)), 1740);
  });
  test('exactly planned + 60 is not late; +61 is', () => {
    assert.equal(plannedBedtime(planA, [{ date: night(1), slept: '06:30' }], night(1)), 1740);
    assert.equal(plannedBedtime(planA, [{ date: night(1), slept: '06:31' }], night(1)), 1770);
  });
  test('a hold never moves the bedtime later', () => {
    const log = [late(night(2)), late(night(5)), late(night(6))];
    let prev = Infinity;
    for (let i = 0; i < 20; i++) {
      const p = plannedBedtime(planA, log, night(i));
      assert.ok(p <= prev, `night ${i}`);
      prev = p;
    }
    assert.equal(plannedBedtime(planA, log, night(19)), 1470);
  });
  test('unparsable slept and log entries for other dates are ignored', () => {
    assert.equal(plannedBedtime(planA, [{ date: night(1), slept: 'nope' }], night(1)), 1740);
    assert.equal(plannedBedtime(planA, [late(night(0))], night(0)), 1770);
  });
});

describe('sleep opportunity and safety', () => {
  test('sleepOpportunity', () => {
    assert.equal(sleepOpportunity(1470, 540), 510);  // 00:30 → 09:00
    assert.equal(sleepOpportunity(1560, 420), 300);  // 02:00 → 07:00
    assert.equal(sleepOpportunity(1380, 420), 480);  // 23:00 → 07:00
    assert.equal(sleepOpportunity(1770, 780), 450);  // 05:30 → 13:00
    assert.equal(sleepOpportunity(nightMin(parseClock('22:00')), parseClock('06:00')), 480);
  });
  test('opportunityCheck warns below 480, calmly, with the 8–10 h framing', () => {
    const warn = opportunityCheck(300);
    assert.equal(warn.ok, false);
    assert.equal(warn.hours, 5);
    assert.match(warn.message, /8–10 h/);
    assert.doesNotMatch(warn.message, /cure|disorder|insomnia|fail|bad/i);
    assert.equal(opportunityCheck(479).ok, false);
    const ok = opportunityCheck(480);
    assert.equal(ok.ok, true);
    assert.equal(ok.hours, 8);
    assert.match(ok.message, /8–10 h/);
    assert.equal(opportunityCheck(510).hours, 8.5);
    assert.equal(opportunityCheck(511).hours, 8.5);
  });
  test('sleepRemaining', () => {
    assert.equal(sleepRemaining(80, 540), 460);    // 01:20 → 09:00
    assert.equal(sleepRemaining(1380, 540), 600);  // 23:00 → 09:00
    assert.equal(sleepRemaining(780, 540), 1200);  // 13:00 → 09:00
    assert.equal(sleepRemaining(540, 540), 0);
  });
  test('isOnTime grace boundary', () => {
    assert.equal(isOnTime(parseClock('01:30'), 1500), true);   // exactly +30
    assert.equal(isOnTime(parseClock('01:31'), 1500), false);  // +31
    assert.equal(isOnTime(parseClock('23:30'), 1500), true);   // earlier than planned
    assert.equal(isOnTime(parseClock('01:45'), 1500, 60), true);
    assert.equal(isOnTime(null, 1500), false);
  });
});

describe('chartData', () => {
  const end = '2026-10-14';
  const log = [
    { date: night(5), slept: '04:00' },  // night 4: planned 03:30 (1650), actual 1680 → on time (exactly +30)
    { date: night(6), slept: '06:00' },  // night 5: planned 1620, actual 1800 → late
  ];
  test('14 rows ending on endDate, missing nights actual:null', () => {
    const rows = chartData(planA, log, end);
    assert.equal(rows.length, 14);
    assert.equal(rows[0].nightDate, '2026-10-01');
    assert.equal(rows[13].nightDate, end);
    assert.equal(rows[0].actual, null);
    assert.equal(rows[0].onTime, null);
    assert.equal(rows[0].planned, 1770);
    assert.equal(rows.filter(r => r.actual !== null).length, 2);
  });
  test('on-time and late nights', () => {
    const rows = chartData(planA, log, end);
    assert.deepEqual(rows[4], { nightDate: night(4), planned: 1650, actual: 1680, onTime: true });
    assert.deepEqual(rows[5], { nightDate: night(5), planned: 1620, actual: 1800, onTime: false });
    assert.equal(rows[6].planned, 1620); // held after the late night
    assert.equal(rows[6].actual, null);
  });
  test('custom length and planless chart', () => {
    assert.equal(chartData(planA, log, end, 7).length, 7);
    assert.equal(chartData(planA, log, end, 7)[0].nightDate, '2026-10-08');
    const rows = chartData(null, log, end);
    assert.equal(rows[4].planned, null);
    assert.equal(rows[4].actual, 1680);
    assert.equal(rows[4].onTime, null);
  });
  test('a plan change keeps old rows: stored onTime wins, earlier nights keep a planned value', () => {
    const newPlan = { ...planA, cur: '02:00', start: '2026-10-10' };
    const oldLog = [{ date: night(3), slept: '05:00', onTime: true }];
    const rows = chartData(newPlan, oldLog, end);
    assert.equal(rows[2].onTime, true);        // judged by the plan of its time, not today's
    assert.equal(rows[2].planned, 1560);       // before start → cur
    assert.equal(rows[9].planned, 1560);       // 10-10 = night 0 of the new plan
    assert.equal(rows[10].planned, 1530);
  });
});

describe('skyData', () => {
  const log = [
    { date: night(1), slept: '05:00', onTime: true },
    { date: night(2), slept: '05:30' },  // night 1 planned 1740, actual 1770 → on time (+30)
    { date: night(3), slept: '07:00', onTime: false },
  ];
  test('one star per log entry, bright if on time', () => {
    const sky = skyData(planA, log);
    assert.equal(sky.count, 3);
    assert.equal(sky.count, log.length);
    assert.equal(sky.brightCount, 2);
    assert.deepEqual(sky.stars.map(s => s.nightDate), [night(0), night(1), night(2)]);
    assert.deepEqual(sky.stars.map(s => s.bright), [true, true, false]);
  });
  test('adding a late night never decrements either count', () => {
    const before = skyData(planA, log);
    const after = skyData(planA, [...log, { date: night(4), slept: '08:00' }]);
    assert.equal(after.count, before.count + 1);
    assert.equal(after.brightCount, before.brightCount);
    assert.ok(after.count >= before.count && after.brightCount >= before.brightCount);
  });
  test('empty log', () => assert.deepEqual(skyData(planA, []), { stars: [], count: 0, brightCount: 0 }));
});
