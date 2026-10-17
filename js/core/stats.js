// All of the app's number crunching lives here. Pure functions, no DOM, no storage.
//
// A sale is { id, ts, profit, tag, note } where `ts` is epoch ms and `profit`
// is integer millimes. Days are Africa/Tunis 'YYYY-MM-DD' keys (see dates.js).
//
// Conventions (also described in the README):
//  * "Average per day" divides by CALENDAR days that have elapsed in the period
//    (zero-sale days count), starting no earlier than the first day with data
//    and ending no later than today. So a brand-new log is not diluted by
//    days before you started using it.
//  * "Best/worst day" only consider days that have at least one sale.
//  * "Average per sale" is total / number of sales.

import {
  dayKey,
  addDays,
  diffDays,
  weekStartOf,
  monthStartOf,
  monthEndOf,
  monthKey,
  addMonths,
  maxKey,
  minKey,
} from './dates.js';

// ---------------------------------------------------------------------------
// Basics

export const byNewest = (a, b) => b.ts - a.ts || (a.id < b.id ? 1 : -1);

export function sortNewestFirst(sales) {
  return [...sales].sort(byNewest);
}

export function totalProfit(sales) {
  let t = 0;
  for (const s of sales) t += s.profit;
  return t;
}

/** Earliest day (key) that has a sale, or null. */
export function firstDay(sales) {
  let first = null;
  for (const s of sales) {
    const d = dayKey(s.ts);
    if (first === null || d < first) first = d;
  }
  return first;
}

export function lastDay(sales) {
  let last = null;
  for (const s of sales) {
    const d = dayKey(s.ts);
    if (last === null || d > last) last = d;
  }
  return last;
}

export function filterByDays(sales, start, end) {
  return sales.filter((s) => {
    const d = dayKey(s.ts);
    return d >= start && d <= end;
  });
}

/** { total, count } for the sales between two day keys (inclusive). */
export function rangeTotals(sales, start, end) {
  let total = 0;
  let count = 0;
  for (const s of sales) {
    const d = dayKey(s.ts);
    if (d >= start && d <= end) {
      total += s.profit;
      count++;
    }
  }
  return { total, count };
}

/**
 * Calendar days of [start, end] that count towards an average: clipped to
 * [first, today]. Returns 0 when the period is entirely before the first
 * sale or entirely in the future.
 */
export function elapsedDays(start, end, { today, first }) {
  if (!first) return 0;
  const lo = maxKey(start, first);
  const hi = minKey(end, today);
  return hi < lo ? 0 : diffDays(lo, hi) + 1;
}

// ---------------------------------------------------------------------------
// Grouping by day / week / month

/** Days that have sales, newest day first, sales newest first inside each day. */
export function groupByDay(sales) {
  const map = new Map();
  for (const s of sales) {
    const day = dayKey(s.ts);
    let g = map.get(day);
    if (!g) map.set(day, (g = { day, total: 0, count: 0, sales: [] }));
    g.total += s.profit;
    g.count++;
    g.sales.push(s);
  }
  const out = [...map.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  for (const g of out) g.sales.sort(byNewest);
  return out;
}

function makeBucket(start, end, dayGroups, ctx) {
  let total = 0;
  let count = 0;
  for (const g of dayGroups) {
    total += g.total;
    count += g.count;
  }
  const days = elapsedDays(start, end, ctx);
  return {
    key: start,
    start,
    end,
    total,
    count,
    days,
    avgPerDay: days ? total / days : 0,
    avgPerSale: count ? total / count : 0,
    dayGroups,
  };
}

function context(sales, opts) {
  return {
    today: opts.today,
    first: opts.first !== undefined ? opts.first : firstDay(sales),
    weekStart: opts.weekStart ?? 1,
    fill: opts.fill ?? true,
  };
}

/**
 * Weeks, newest first. Each week: { start, end, total, count, days, avgPerDay,
 * avgPerSale, dayGroups }. With `fill` (default) weeks without sales between the
 * first sale and today are included so gaps stay visible.
 */
export function groupByWeek(sales, opts) {
  const ctx = context(sales, opts);
  const map = new Map();
  for (const g of groupByDay(sales)) {
    const ws = weekStartOf(g.day, ctx.weekStart);
    let list = map.get(ws);
    if (!list) map.set(ws, (list = []));
    list.push(g);
  }
  if (ctx.fill && map.size) {
    const hi = weekStartOf(maxKey(ctx.today, lastDay(sales)), ctx.weekStart);
    for (let w = weekStartOf(ctx.first, ctx.weekStart); w <= hi; w = addDays(w, 7)) {
      if (!map.has(w)) map.set(w, []);
    }
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ws, groups]) => makeBucket(ws, addDays(ws, 6), groups, ctx));
}

/**
 * Months, newest first. Each month has the same fields as a week plus
 * `weeks`: the weeks that overlap it, clipped to the month, newest first.
 */
export function groupByMonth(sales, opts) {
  const ctx = context(sales, opts);
  const map = new Map();
  for (const g of groupByDay(sales)) {
    const mk = monthKey(g.day);
    let list = map.get(mk);
    if (!list) map.set(mk, (list = []));
    list.push(g);
  }
  if (ctx.fill && map.size) {
    const hi = monthKey(maxKey(ctx.today, lastDay(sales)));
    for (let m = monthStartOf(ctx.first); monthKey(m) <= hi; m = addMonths(m, 1)) {
      if (!map.has(monthKey(m))) map.set(monthKey(m), []);
    }
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([mk, groups]) => {
      const start = mk + '-01';
      const end = monthEndOf(start);
      const month = makeBucket(start, end, groups, ctx);
      month.key = mk;
      month.weeks = weeksInMonth(groups, start, end, ctx);
      return month;
    });
}

function weeksInMonth(groups, mStart, mEnd, ctx) {
  const map = new Map();
  // Weeks that haven't started yet (the rest of the current month) are not listed.
  const last = minKey(mEnd, maxKey(ctx.today, groups.length ? groups[0].day : ctx.today));
  for (let w = weekStartOf(mStart, ctx.weekStart); w <= last; w = addDays(w, 7)) map.set(w, []);
  for (const g of groups) map.get(weekStartOf(g.day, ctx.weekStart)).push(g);
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ws, list]) => makeBucket(maxKey(ws, mStart), minKey(addDays(ws, 6), mEnd), list, ctx));
}

// ---------------------------------------------------------------------------
// Periods (dashboard)

export const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

/** { id, label, start, end } where start/end are day keys (end may be in the future). */
export function resolvePeriod(id, { today, weekStart = 1, first = null, custom = null }) {
  const label = PERIODS.find((p) => p.id === id)?.label ?? id;
  let start, end;
  switch (id) {
    case 'today':
      start = end = today;
      break;
    case 'yesterday':
      start = end = addDays(today, -1);
      break;
    case 'week':
      start = weekStartOf(today, weekStart);
      end = addDays(start, 6);
      break;
    case 'month':
      start = monthStartOf(today);
      end = monthEndOf(today);
      break;
    case 'last7':
      start = addDays(today, -6);
      end = today;
      break;
    case 'last30':
      start = addDays(today, -29);
      end = today;
      break;
    case 'all':
      start = first && first < today ? first : today;
      end = today;
      break;
    case 'custom': {
      const a = custom?.start || today;
      const b = custom?.end || today;
      start = a <= b ? a : b;
      end = a <= b ? b : a;
      break;
    }
    default:
      throw new Error(`Unknown period "${id}"`);
  }
  return { id, label, start, end };
}

/** Summary numbers for the sales of one period (pass the already filtered sales). */
export function summarize(periodSales, period, { today, first }) {
  const total = totalProfit(periodSales);
  const count = periodSales.length;
  const days = elapsedDays(period.start, period.end, { today, first });
  const dayGroups = groupByDay(periodSales);
  let best = null;
  let worst = null;
  for (const g of dayGroups) {
    // dayGroups is newest first, so `>=` / `<=` let the earliest day win a tie.
    if (!best || g.total >= best.total) best = { day: g.day, total: g.total, count: g.count };
    if (!worst || g.total <= worst.total) worst = { day: g.day, total: g.total, count: g.count };
  }
  return {
    total,
    count,
    days,
    activeDays: dayGroups.length,
    avgPerSale: count ? total / count : 0,
    avgPerDay: days ? total / days : 0,
    best,
    worst,
  };
}

/**
 * The period to compare against, like for like:
 *  this week/month → the same number of elapsed days in the previous week/month,
 *  rolling windows and custom ranges → the window of equal length right before.
 * Returns null for "all time".
 */
export function previousPeriod(period, { today, weekStart = 1 }) {
  const elapsedEnd = minKey(period.end, today);
  const len = diffDays(period.start, elapsedEnd) + 1;
  switch (period.id) {
    case 'today':
    case 'yesterday': {
      const d = addDays(period.start, -1);
      return { id: 'prev', label: period.id === 'today' ? 'yesterday' : 'the day before', start: d, end: d };
    }
    case 'week': {
      const start = addDays(period.start, -7);
      return { id: 'prev', label: 'last week', start, end: addDays(start, len - 1) };
    }
    case 'month': {
      const start = addMonths(period.start, -1);
      return { id: 'prev', label: 'last month', start, end: minKey(addDays(start, len - 1), monthEndOf(start)) };
    }
    case 'last7':
    case 'last30':
    case 'custom': {
      const end = addDays(period.start, -1);
      return {
        id: 'prev',
        label: `the previous ${len} day${len === 1 ? '' : 's'}`,
        start: addDays(end, -(len - 1)),
        end,
      };
    }
    default:
      return null;
  }
}

/** { delta, pct } — pct is null when the previous total is zero. */
export function compareTotals(current, previous) {
  const delta = current - previous;
  return { delta, pct: previous ? (delta / Math.abs(previous)) * 100 : null };
}

// ---------------------------------------------------------------------------
// Series for charts

/** One entry per calendar day in [start, min(end, today)], zero days included. */
export function dailySeries(sales, start, end, today) {
  const hi = minKey(end, today);
  if (hi < start) return [];
  const map = new Map();
  for (const s of sales) {
    const d = dayKey(s.ts);
    if (d < start || d > hi) continue;
    let e = map.get(d);
    if (!e) map.set(d, (e = { total: 0, count: 0 }));
    e.total += s.profit;
    e.count++;
  }
  const out = [];
  for (let d = start; d <= hi; d = addDays(d, 1)) {
    const e = map.get(d);
    out.push({ key: d, day: d, total: e ? e.total : 0, count: e ? e.count : 0 });
  }
  return out;
}

/** Weeks overlapping [start, min(end, today)], oldest first. */
export function weeklySeries(sales, start, end, { today, weekStart = 1 }) {
  const hi = minKey(end, today);
  if (hi < start) return [];
  const map = new Map();
  for (let w = weekStartOf(start, weekStart); w <= hi; w = addDays(w, 7)) {
    map.set(w, { key: w, start: w, end: addDays(w, 6), total: 0, count: 0 });
  }
  for (const s of sales) {
    const d = dayKey(s.ts);
    if (d < start || d > hi) continue;
    const e = map.get(weekStartOf(d, weekStart));
    e.total += s.profit;
    e.count++;
  }
  return [...map.values()];
}

/** Calendar months overlapping [start, min(end, today)], oldest first. */
export function monthlySeries(sales, start, end, { today }) {
  const hi = minKey(end, today);
  if (hi < start) return [];
  const map = new Map();
  for (let m = monthStartOf(start); m <= hi; m = addMonths(m, 1)) {
    map.set(monthKey(m), { key: monthKey(m), start: m, end: monthEndOf(m), total: 0, count: 0 });
  }
  for (const s of sales) {
    const d = dayKey(s.ts);
    if (d < start || d > hi) continue;
    const e = map.get(monthKey(d));
    e.total += s.profit;
    e.count++;
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Platform tags

/**
 * Profit and count per tag, best first. Sales without a tag are "Untagged".
 * `share` is the slice of all positive profit (0 for tags with a net loss).
 */
export function byTag(sales) {
  const map = new Map();
  for (const s of sales) {
    const tag = s.tag ? s.tag : null;
    let e = map.get(tag);
    if (!e) map.set(tag, (e = { tag, label: tag ?? 'Untagged', total: 0, count: 0, share: 0 }));
    e.total += s.profit;
    e.count++;
  }
  const list = [...map.values()].sort((a, b) => b.total - a.total || b.count - a.count || (a.label < b.label ? -1 : 1));
  const positive = list.reduce((t, e) => t + Math.max(0, e.total), 0);
  for (const e of list) e.share = positive && e.total > 0 ? e.total / positive : 0;
  return list;
}

// ---------------------------------------------------------------------------
// Projection

/**
 * Expected profit for a 30-day month.
 *  * Average daily profit is measured over the last 30 days (or since the first
 *    sale if that is shorter), counting today, and zero-sale days.
 *  * Floor / ceiling are your lowest / highest COMPLETE weeks (Mon–Sun or
 *    whatever week start is set; weeks that started before your first sale are
 *    skipped) scaled to 30 days.
 *  * `enough` is false until there are `minDays` days of data (first sale → today).
 */
export function projection(sales, { today, weekStart = 1, horizon = 30, minDays = 14, window = 30 }) {
  const first = firstDay(sales);
  if (!first || first > today) {
    return { hasData: false, enough: false, dataDays: 0, horizon, minDays };
  }
  const dataDays = diffDays(first, today) + 1;
  const windowDays = Math.min(window, dataDays);
  const wStart = addDays(today, -(windowDays - 1));
  const { total: windowTotal } = rangeTotals(sales, wStart, today);
  const avgDaily = windowTotal / windowDays;
  const projected = Math.round(avgDaily * horizon);

  const weeks = weeklyTotals(sales, first, today, weekStart);
  let floor = null;
  let ceiling = null;
  let lowestWeek = null;
  let highestWeek = null;
  if (weeks.length) {
    lowestWeek = weeks.reduce((a, b) => (b.total < a.total ? b : a));
    highestWeek = weeks.reduce((a, b) => (b.total > a.total ? b : a));
    floor = Math.min(projected, Math.round((lowestWeek.total * horizon) / 7));
    ceiling = Math.max(projected, Math.round((highestWeek.total * horizon) / 7));
  }
  return {
    hasData: true,
    enough: dataDays >= minDays,
    dataDays,
    minDays,
    horizon,
    windowDays,
    avgDaily,
    projected,
    floor,
    ceiling,
    lowestWeek,
    highestWeek,
    weeksUsed: weeks.length,
  };
}

/** Complete weeks that start on/after `first` and end on/before `today`. */
function weeklyTotals(sales, first, today, weekStart) {
  let w = weekStartOf(first, weekStart);
  if (w < first) w = addDays(w, 7);
  const weeks = [];
  while (addDays(w, 6) <= today) {
    weeks.push({ start: w, end: addDays(w, 6), total: 0 });
    w = addDays(w, 7);
  }
  if (!weeks.length) return weeks;
  const index = new Map(weeks.map((x) => [x.start, x]));
  for (const s of sales) {
    const e = index.get(weekStartOf(dayKey(s.ts), weekStart));
    if (e) e.total += s.profit;
  }
  return weeks;
}
