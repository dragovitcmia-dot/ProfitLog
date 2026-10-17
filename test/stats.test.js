import test from 'node:test';
import assert from 'node:assert/strict';
import { sale } from './helpers.js';
import {
  totalProfit, firstDay, rangeTotals, filterByDays, elapsedDays, groupByDay, groupByWeek, groupByMonth,
  resolvePeriod, summarize, previousPeriod, compareTotals, dailySeries, weeklySeries, monthlySeries,
  byTag, projection, sortNewestFirst,
} from '../js/core/stats.js';

const TODAY = '2026-10-17'; // a Saturday
const ctx = (extra = {}) => ({ today: TODAY, weekStart: 1, ...extra });

// Week of Mon 12 Oct: 44.5   Week of Mon 5 Oct: 36   Week of Mon 28 Sep: 19.25
const SALES = [
  sale('2026-10-17', '09:00', 10, { tag: 'Roblox' }),
  sale('2026-10-17', '15:30', 5.5, { tag: 'Steam' }),
  sale('2026-10-16', '11:00', 20, { tag: 'Roblox' }),
  sale('2026-10-14', '10:00', -3),
  sale('2026-10-14', '18:00', 8, { tag: 'Xbox' }),
  sale('2026-10-12', '08:00', 4, { tag: 'Roblox' }),
  sale('2026-10-08', '13:00', 30, { tag: 'Apple' }),
  sale('2026-10-05', '13:00', 6),
  sale('2026-09-30', '13:00', 12, { tag: 'Roblox' }),
  sale('2026-09-28', '13:00', 7.25, { tag: 'Steam' }),
];

test('totals and counts', () => {
  assert.equal(totalProfit(SALES), 99750);
  assert.equal(totalProfit([]), 0);
  assert.deepEqual(rangeTotals(SALES, '2026-10-17', '2026-10-17'), { total: 15500, count: 2 });
  assert.deepEqual(rangeTotals(SALES, '2026-10-12', '2026-10-18'), { total: 44500, count: 6 });
  assert.equal(firstDay(SALES), '2026-09-28');
  assert.equal(filterByDays(SALES, '2026-10-14', '2026-10-16').length, 3);
});

test('sums stay exact with fractional dinars', () => {
  const s = [sale('2026-10-17', '09:00', 0.1), sale('2026-10-17', '10:00', 0.2), sale('2026-10-17', '11:00', 0.001)];
  assert.equal(totalProfit(s), 301);
});

test('group by day: newest first, with daily subtotals', () => {
  const days = groupByDay(SALES);
  assert.deepEqual(days.map((d) => d.day), [
    '2026-10-17', '2026-10-16', '2026-10-14', '2026-10-12', '2026-10-08', '2026-10-05', '2026-09-30', '2026-09-28',
  ]);
  assert.equal(days[0].total, 15500);
  assert.equal(days[0].count, 2);
  assert.equal(days[2].total, 5000); // -3 + 8
  assert.deepEqual(days[0].sales.map((s) => s.profit), [5500, 10000]); // newest sale first
});

test('a sale just after midnight in Tunis belongs to the new day', () => {
  const s = [sale('2026-10-17', '00:05', 1), sale('2026-10-16', '23:55', 2)];
  const days = groupByDay(s);
  assert.deepEqual(days.map((d) => [d.day, d.total]), [['2026-10-17', 1000], ['2026-10-16', 2000]]);
});

test('group by week (Monday start)', () => {
  const weeks = groupByWeek(SALES, ctx());
  assert.deepEqual(weeks.map((w) => w.start), ['2026-10-12', '2026-10-05', '2026-09-28']);
  const [w1, w2, w3] = weeks;
  assert.equal(w1.total, 44500);
  assert.equal(w1.count, 6);
  assert.equal(w1.days, 6); // Mon 12 → today (Sat 17): the week isn't over
  assert.equal(w1.avgPerDay, 44500 / 6);
  assert.equal(w1.end, '2026-10-18');
  assert.equal(w2.total, 36000);
  assert.equal(w2.days, 7);
  assert.equal(w2.avgPerDay, 36000 / 7);
  assert.equal(w3.total, 19250);
  assert.deepEqual(w1.dayGroups.map((g) => g.day), ['2026-10-17', '2026-10-16', '2026-10-14', '2026-10-12']);
});

test('weeks respect the configured week start', () => {
  const weeks = groupByWeek(SALES, ctx({ weekStart: 0 })); // Sunday
  assert.deepEqual(weeks.map((w) => w.start), ['2026-10-11', '2026-10-04', '2026-09-27']);
  assert.equal(weeks[0].total, 44500); // Sun 11 → Sat 17
  assert.equal(weeks[1].total, 36000); // Sun 4 → Sat 10 includes Mon 5 and Thu 8
  assert.equal(weeks[2].total, 19250);
});

test('empty weeks between sales are listed so gaps stay visible', () => {
  const s = [sale('2026-10-17', '09:00', 3), sale('2026-09-21', '09:00', 2)];
  const weeks = groupByWeek(s, ctx());
  assert.deepEqual(weeks.map((w) => [w.start, w.total, w.count]), [
    ['2026-10-12', 3000, 1], ['2026-10-05', 0, 0], ['2026-09-28', 0, 0], ['2026-09-21', 2000, 1],
  ]);
  assert.equal(groupByWeek(s, ctx({ fill: false })).length, 2);
});

test('the current week is listed even when it has no sales yet', () => {
  const s = [sale('2026-10-08', '09:00', 3)];
  const weeks = groupByWeek(s, ctx());
  assert.equal(weeks[0].start, '2026-10-12');
  assert.equal(weeks[0].total, 0);
});

test('group by month with averages and weeks', () => {
  const months = groupByMonth(SALES, ctx());
  assert.deepEqual(months.map((m) => m.key), ['2026-10', '2026-09']);
  const [oct, sep] = months;
  assert.equal(oct.total, 80500);
  assert.equal(oct.count, 8);
  assert.equal(oct.days, 17); // 1 Oct → 17 Oct (first sale is earlier, so nothing is clipped)
  assert.equal(oct.avgPerDay, 80500 / 17);
  assert.equal(oct.avgPerSale, 80500 / 8);
  assert.equal(sep.total, 19250);
  assert.equal(sep.days, 3); // Sep 28–30: days before the first sale don't dilute the average
  assert.equal(sep.avgPerDay, 19250 / 3);

  assert.deepEqual(oct.weeks.map((w) => [w.start, w.end, w.total, w.days]), [
    ['2026-10-12', '2026-10-18', 44500, 6],
    ['2026-10-05', '2026-10-11', 36000, 7],
    ['2026-10-01', '2026-10-04', 0, 4], // week of 28 Sep, clipped to October
  ]);
  const sepLast = sep.weeks[0];
  assert.deepEqual([sepLast.start, sepLast.end, sepLast.total], ['2026-09-28', '2026-09-30', 19250]);
  assert.equal(oct.weeks[0].dayGroups[0].day, '2026-10-17');
  // A month's weeks add up to the month
  assert.equal(oct.weeks.reduce((t, w) => t + w.total, 0), oct.total);
});

test('a week split by a month boundary is counted once per month', () => {
  const months = groupByMonth(SALES, ctx());
  const weekTotals = groupByWeek(SALES, ctx()).find((w) => w.start === '2026-09-28').total;
  const parts = months[1].weeks[0].total + months[0].weeks.find((w) => w.start === '2026-10-01').total;
  assert.equal(parts, weekTotals);
});

test('periods resolve to inclusive day ranges', () => {
  const o = { today: TODAY, weekStart: 1, first: '2026-09-28' };
  const r = (id, custom) => { const p = resolvePeriod(id, { ...o, custom }); return [p.start, p.end]; };
  assert.deepEqual(r('today'), [TODAY, TODAY]);
  assert.deepEqual(r('yesterday'), ['2026-10-16', '2026-10-16']);
  assert.deepEqual(r('week'), ['2026-10-12', '2026-10-18']);
  assert.deepEqual(r('month'), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(r('last7'), ['2026-10-11', TODAY]);
  assert.deepEqual(r('last30'), ['2026-09-18', TODAY]);
  assert.deepEqual(r('all'), ['2026-09-28', TODAY]);
  assert.deepEqual(r('custom', { start: '2026-10-14', end: '2026-10-12' }), ['2026-10-12', '2026-10-14']); // reversed → fixed
  assert.deepEqual(resolvePeriod('all', { today: TODAY, first: null }).start, TODAY);
  assert.throws(() => resolvePeriod('nope', { today: TODAY }));
});

test('period filtering includes both ends and excludes everything else', () => {
  const week = resolvePeriod('week', { today: TODAY, weekStart: 1 });
  const inWeek = filterByDays(SALES, week.start, week.end);
  assert.equal(inWeek.length, 6);
  assert.equal(totalProfit(inWeek), 44500);
  const l7 = resolvePeriod('last7', { today: TODAY });
  assert.equal(filterByDays(SALES, l7.start, l7.end).length, 6); // 11 Oct … 17 Oct
  const custom = filterByDays(SALES, '2026-10-05', '2026-10-08');
  assert.equal(custom.length, 2);
});

test('summary: total, count, averages, best and worst day', () => {
  const first = firstDay(SALES);
  const period = resolvePeriod('month', { today: TODAY, first });
  const s = summarize(filterByDays(SALES, period.start, period.end), period, { today: TODAY, first });
  assert.equal(s.total, 80500);
  assert.equal(s.count, 8);
  assert.equal(s.avgPerSale, 80500 / 8);
  assert.equal(s.days, 17);
  assert.equal(s.avgPerDay, 80500 / 17);
  assert.equal(s.activeDays, 6);
  assert.deepEqual(s.best, { day: '2026-10-08', total: 30000, count: 1 });
  assert.deepEqual(s.worst, { day: '2026-10-12', total: 4000, count: 1 }); // lowest day that had sales
});

test('worst day can be a losing day; ties resolve to the earliest day', () => {
  const s = [sale('2026-10-10', '10:00', -5), sale('2026-10-11', '10:00', -5), sale('2026-10-12', '10:00', 7), sale('2026-10-13', '10:00', 7)];
  const period = resolvePeriod('last30', { today: TODAY });
  const r = summarize(s, period, { today: TODAY, first: '2026-10-10' });
  assert.equal(r.worst.day, '2026-10-10');
  assert.equal(r.worst.total, -5000);
  assert.equal(r.best.day, '2026-10-12');
});

test('summary of nothing is all zeros, not NaN', () => {
  const period = resolvePeriod('today', { today: TODAY });
  const r = summarize([], period, { today: TODAY, first: null });
  assert.deepEqual([r.total, r.count, r.avgPerDay, r.avgPerSale, r.best, r.worst], [0, 0, 0, 0, null, null]);
});

test('elapsed days are clipped to [first sale, today]', () => {
  const c = { today: TODAY, first: '2026-10-10' };
  assert.equal(elapsedDays('2026-10-01', '2026-10-31', c), 8);
  assert.equal(elapsedDays('2026-09-01', '2026-09-30', c), 0);
  assert.equal(elapsedDays('2026-10-20', '2026-10-25', c), 0);
  assert.equal(elapsedDays('2026-10-17', '2026-10-17', c), 1);
  assert.equal(elapsedDays('2026-10-01', '2026-10-31', { today: TODAY, first: null }), 0);
});

test('previous period is compared like for like', () => {
  const o = { today: TODAY, weekStart: 1 };
  const p = (id, custom) => previousPeriod(resolvePeriod(id, { ...o, custom }), o);
  assert.deepEqual(pick(p('today')), ['2026-10-16', '2026-10-16']);
  assert.deepEqual(pick(p('yesterday')), ['2026-10-15', '2026-10-15']);
  // this week so far = Mon 12 … Sat 17 (6 days) → last week Mon 5 … Sat 10
  assert.deepEqual(pick(p('week')), ['2026-10-05', '2026-10-10']);
  // this month so far = 17 days → 1 … 17 Sep
  assert.deepEqual(pick(p('month')), ['2026-09-01', '2026-09-17']);
  assert.deepEqual(pick(p('last7')), ['2026-10-04', '2026-10-10']);
  assert.deepEqual(pick(p('last30')), ['2026-08-19', '2026-09-17']);
  assert.deepEqual(pick(p('custom', { start: '2026-10-10', end: '2026-10-14' })), ['2026-10-05', '2026-10-09']);
  assert.equal(p('all'), null);
  assert.equal(p('month').label, 'last month');
});

test('previous month never runs past its own end', () => {
  const o = { today: '2026-03-31', weekStart: 1 };
  const prev = previousPeriod(resolvePeriod('month', o), o);
  assert.deepEqual([prev.start, prev.end], ['2026-02-01', '2026-02-28']);
});

function pick(p) { return [p.start, p.end]; }

test('comparison and % change', () => {
  assert.deepEqual(compareTotals(150000, 100000), { delta: 50000, pct: 50 });
  assert.deepEqual(compareTotals(50000, 100000), { delta: -50000, pct: -50 });
  assert.deepEqual(compareTotals(5000, 0), { delta: 5000, pct: null });
  assert.equal(compareTotals(-50, -100).pct, 50);
});

test('daily series includes zero days and stops at today', () => {
  const s = dailySeries(SALES, '2026-10-12', '2026-10-31', TODAY);
  assert.equal(s.length, 6);
  assert.deepEqual(s.map((d) => d.total), [4000, 0, 5000, 0, 20000, 15500]);
  assert.deepEqual(s.map((d) => d.count), [1, 0, 2, 0, 1, 2]);
  assert.deepEqual(dailySeries(SALES, '2026-11-01', '2026-11-30', TODAY), []);
});

test('weekly and monthly series (oldest first)', () => {
  const w = weeklySeries(SALES, '2026-09-28', TODAY, ctx());
  assert.deepEqual(w.map((x) => [x.start, x.total, x.count]), [
    ['2026-09-28', 19250, 2], ['2026-10-05', 36000, 2], ['2026-10-12', 44500, 6],
  ]);
  const m = monthlySeries(SALES, '2026-09-01', TODAY, ctx());
  assert.deepEqual(m.map((x) => [x.key, x.total, x.count]), [['2026-09', 19250, 2], ['2026-10', 80500, 8]]);
  // series only count sales inside the requested range
  const partial = weeklySeries(SALES, '2026-10-14', TODAY, ctx());
  assert.equal(partial.length, 1);
  assert.equal(partial[0].total, 5000 + 20000 + 15500);
});

test('per-platform totals, sorted, with Untagged', () => {
  const t = byTag(SALES);
  assert.deepEqual(t.map((x) => [x.label, x.total, x.count]), [
    ['Roblox', 46000, 4],
    ['Apple', 30000, 1],
    ['Steam', 12750, 2],
    ['Xbox', 8000, 1],
    ['Untagged', 3000, 2], // -3 and 6
  ]);
  assert.equal(t.find((x) => x.label === 'Untagged').tag, null);
  const sumShares = t.reduce((a, x) => a + x.share, 0);
  assert.ok(Math.abs(sumShares - 1) < 1e-9);
});

test('a platform with a net loss has no donut share', () => {
  const t = byTag([sale('2026-10-17', '10:00', -5, { tag: 'Xbox' }), sale('2026-10-17', '11:00', 5, { tag: 'Steam' })]);
  assert.equal(t.find((x) => x.label === 'Xbox').share, 0);
  assert.equal(t.find((x) => x.label === 'Steam').share, 1);
});

test('projection: average daily, 30-day expectation, floor and ceiling', () => {
  const p = projection(SALES, ctx());
  assert.equal(p.hasData, true);
  assert.equal(p.dataDays, 20); // 28 Sep … 17 Oct
  assert.equal(p.enough, true);
  assert.equal(p.windowDays, 20);
  assert.equal(p.avgDaily, 99750 / 20);
  assert.equal(p.projected, Math.round((99750 / 20) * 30)); // 149625
  assert.equal(p.weeksUsed, 2); // 28 Sep and 5 Oct; the current week isn't complete
  assert.equal(p.lowestWeek.start, '2026-09-28');
  assert.equal(p.highestWeek.start, '2026-10-05');
  assert.equal(p.floor, Math.round((19250 * 30) / 7));
  assert.equal(p.ceiling, Math.max(p.projected, Math.round((36000 * 30) / 7)));
  assert.ok(p.floor <= p.projected && p.projected <= p.ceiling);
});

test('projection uses only the last 30 days once there is more data', () => {
  const old = sale('2026-06-01', '10:00', 1000);
  const recent = [sale('2026-10-10', '10:00', 30), sale('2026-10-16', '10:00', 60)];
  const p = projection([old, ...recent], ctx());
  assert.equal(p.windowDays, 30);
  assert.equal(p.avgDaily, 90000 / 30); // the 1000 TND from June is outside the window
  assert.equal(p.projected, 90000);
});

test('projection warns when there are fewer than 14 days of data', () => {
  const s = [sale('2026-10-10', '10:00', 10), sale('2026-10-15', '10:00', 20)];
  const p = projection(s, ctx());
  assert.equal(p.dataDays, 8);
  assert.equal(p.enough, false);
  assert.equal(p.avgDaily, 30000 / 8);
  // exactly 14 days is enough
  const s14 = [sale('2026-10-04', '10:00', 10)];
  assert.equal(projection(s14, ctx()).dataDays, 14);
  assert.equal(projection(s14, ctx()).enough, true);
  assert.equal(projection([sale('2026-10-05', '10:00', 10)], ctx()).enough, false); // 13 days
});

test('projection with no complete week has no floor/ceiling; with no data it says so', () => {
  const p = projection([sale('2026-10-15', '10:00', 20)], ctx());
  assert.equal(p.floor, null);
  assert.equal(p.ceiling, null);
  assert.equal(projection([], ctx()).hasData, false);
});

test('zero weeks count towards the floor', () => {
  const s = [sale('2026-09-14', '10:00', 50), sale('2026-10-12', '10:00', 50)];
  const p = projection(s, ctx());
  assert.equal(p.floor, 0);
  assert.ok(p.ceiling > 0);
});

test('sorting helper', () => {
  assert.deepEqual(sortNewestFirst(SALES).map((s) => s.ts), SALES.map((s) => s.ts).sort((a, b) => b - a));
});

test('performance: 20,000 sales group quickly', () => {
  const many = [];
  for (let i = 0; i < 20000; i++) many.push(sale(`2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`, '12:00', (i % 17) - 3));
  const t0 = performance.now();
  groupByMonth(many, ctx());
  groupByWeek(many, ctx());
  projection(many, ctx());
  assert.ok(performance.now() - t0 < 2000);
});
