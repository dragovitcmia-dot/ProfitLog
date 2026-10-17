import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, wallToTs, wall, addDays, diffDays, dowOf, weekStartOf, monthStartOf, monthEndOf, addMonths,
  isValidKey, toDatetimeLocal, fromDatetimeLocal, fmtDay, fmtRange, fmtTime, daysInMonth, fmtMonthLabel, fmtMonthShort3,
} from '../js/core/dates.js';

test('Africa/Tunis is UTC+1: a late-evening UTC instant is already the next day', () => {
  const ts = Date.UTC(2026, 9, 16, 23, 30); // 23:30Z
  assert.equal(dayKey(ts), '2026-10-17');
  assert.equal(fmtTime(ts), '00:30');
});

test('wallToTs / wall are inverses', () => {
  const ts = wallToTs(2026, 10, 17, 14, 5);
  assert.equal(ts, Date.UTC(2026, 9, 17, 13, 5));
  assert.deepEqual(wall(ts), { y: 2026, m: 10, d: 17, h: 14, mi: 5 });
});

test('handles historical daylight saving (Tunisia used UTC+2 in summer 2008)', () => {
  assert.equal(wallToTs(2008, 7, 1, 12, 0), Date.UTC(2008, 6, 1, 10, 0));
  assert.equal(wallToTs(2008, 12, 1, 12, 0), Date.UTC(2008, 11, 1, 11, 0));
});

test('day arithmetic', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(diffDays('2026-10-01', '2026-10-17'), 16);
  assert.equal(dowOf('2026-10-17'), 6); // Saturday
  assert.equal(dowOf('1970-01-01'), 4); // Thursday
});

test('week start is configurable', () => {
  assert.equal(weekStartOf('2026-10-17', 1), '2026-10-12'); // Monday
  assert.equal(weekStartOf('2026-10-12', 1), '2026-10-12');
  assert.equal(weekStartOf('2026-10-18', 1), '2026-10-12'); // Sunday belongs to the Monday week
  assert.equal(weekStartOf('2026-10-17', 0), '2026-10-11'); // Sunday start
  assert.equal(weekStartOf('2026-10-17', 6), '2026-10-17'); // Saturday start
});

test('months', () => {
  assert.equal(monthStartOf('2026-10-17'), '2026-10-01');
  assert.equal(monthEndOf('2026-02-10'), '2026-02-28');
  assert.equal(monthEndOf('2028-02-10'), '2028-02-29');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-01');
  assert.equal(addMonths('2026-11-01', 3), '2027-02-01');
  assert.equal(daysInMonth(2026, 4), 30);
});

test('key validation', () => {
  assert.ok(isValidKey('2026-02-28'));
  assert.ok(!isValidKey('2026-02-30'));
  assert.ok(!isValidKey('2026-13-01'));
  assert.ok(!isValidKey('26-01-01'));
});

test('datetime-local round trip', () => {
  const ts = wallToTs(2026, 1, 5, 9, 7);
  assert.equal(toDatetimeLocal(ts), '2026-01-05T09:07');
  assert.equal(fromDatetimeLocal('2026-01-05T09:07'), ts);
  assert.equal(fromDatetimeLocal('nonsense'), null);
  assert.equal(fromDatetimeLocal('2026-02-30T09:07'), null);
});

test('labels', () => {
  assert.equal(fmtDay('2026-10-17', '2026-10-17'), 'Today');
  assert.equal(fmtDay('2026-10-16', '2026-10-17'), 'Yesterday');
  assert.equal(fmtDay('2026-10-14', '2026-10-17'), 'Wed 14 Oct');
  assert.equal(fmtDay('2025-12-31', '2026-10-17'), 'Wed 31 Dec 2025');
  assert.equal(fmtRange('2026-10-12', '2026-10-18', '2026-10-17'), '12 – 18 Oct');
  assert.equal(fmtRange('2026-09-28', '2026-10-04', '2026-10-17'), '28 Sep – 4 Oct');
});

test('month labels accept a month key or a day key', () => {
  assert.equal(fmtMonthLabel('2026-10'), 'October 2026');
  assert.equal(fmtMonthLabel('2026-10-17'), 'October 2026');
  assert.equal(fmtMonthLabel('2026-02', false), 'February');
  assert.equal(fmtMonthShort3('2026-09'), 'Sep');
});
