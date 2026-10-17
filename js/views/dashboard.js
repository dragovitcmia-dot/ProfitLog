// Dashboard: period stats, comparison, charts, platform split and projection.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { moneyEl, pctPill, saleRow, emptyState, screenHead, statTile, tagBadge, tagColor, segmented, banner, sectionTitle } from '../ui/components.js';
import { barChart, donutChart } from '../ui/charts.js';
import { openSaleForm } from '../ui/saleform.js';
import { navigate } from '../ui/router.js';
import { store } from '../data/store.js';
import {
  PERIODS, resolvePeriod, filterByDays, summarize, previousPeriod, compareTotals, dailySeries, weeklySeries,
  monthlySeries, byTag, projection, firstDay, totalProfit, groupByDay,
} from '../core/stats.js';
import {
  todayKey, dayKey, fmtDay, fmtDayFull, fmtRange, fmtMonthLabel, fmtMonthShort3, fmtWeekday, fmtDayShort, addDays, KEY_RE,
} from '../core/dates.js';
import { formatMoney } from '../core/money.js';

const LS_KEY = 'pl-dashboard';
const view = loadView();
let chartKind = 'daily';
let selectedBar = null;

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY));
    if (v && PERIODS.some((p) => p.id === v.period)) return v;
  } catch { /* ignore */ }
  return { period: 'month', custom: null };
}

function saveView() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(view)); } catch { /* ignore */ }
}

export function renderDashboard(root, _route, rerender) {
  const today = todayKey();
  const weekStart = store.settings.weekStart;
  const all = store.sales;
  const first = firstDay(all);
  if (view.period === 'custom' && !view.custom) view.custom = { start: addDays(today, -6), end: today };
  const period = resolvePeriod(view.period, { today, weekStart, first, custom: view.custom });
  const inPeriod = filterByDays(all, period.start, period.end);
  const sum = summarize(inPeriod, period, { today, first });

  root.append(screenHead('Dashboard', { subtitle: periodSubtitle(period, today) }));
  root.append(periodPicker(rerender));
  if (view.period === 'custom') root.append(customRange(rerender));

  if (!all.length) {
    root.append(emptyState({
      title: 'Nothing to analyse yet',
      text: 'Log a few sales and your totals, charts and projection appear here.',
      actionLabel: 'Log sale',
      onAction: () => openSaleForm(),
      secondaryLabel: 'Load demo data',
      onSecondary: () => store.loadDemo(),
    }));
    return;
  }

  // ---- summary ----
  root.append(
    h(
      'section.card.summary-hero',
      h('span.stat-label', `Total profit · ${period.label.toLowerCase()}`),
      moneyEl(sum.total, { sign: true, unit: true, cls: 'money-lg' }),
      h(
        'div.stat-grid',
        statTile('Sales', String(sum.count)),
        statTile('Avg / sale', moneyEl(sum.avgPerSale, { cls: 'money-sm', tone: false })),
        statTile('Avg / day', moneyEl(sum.avgPerDay, { cls: 'money-sm', tone: false }), sum.days ? `over ${sum.days} day${sum.days === 1 ? '' : 's'}` : null),
        statTile('Active days', String(sum.activeDays)),
      ),
      h(
        'div.best-worst',
        dayTile('Best day', sum.best, 'up', today),
        dayTile('Worst day', sum.worst, 'downtrend', today),
      ),
    ),
  );

  // ---- comparison ----
  const prev = previousPeriod(period, { today, weekStart });
  if (prev) root.append(comparisonCard(period, prev, sum, all, { today, first }));

  // ---- charts ----
  root.append(chartsCard(inPeriod, period, { today, weekStart }, rerender));

  // ---- platforms ----
  root.append(platformCard(inPeriod));

  // ---- projection ----
  root.append(projectionCard(all, { today, weekStart }));
}

function periodSubtitle(period, today) {
  if (period.id === 'all') return 'Everything you have logged';
  if (period.start === period.end) return fmtDayFull(period.start, today);
  return fmtRange(period.start, period.end > today ? today : period.end, today);
}

function periodPicker(rerender) {
  const row = h(
    'div.period-scroll',
    { role: 'radiogroup', 'aria-label': 'Period' },
    ...PERIODS.map((p) =>
      h('button.chip', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(view.period === p.id),
        'aria-pressed': String(view.period === p.id),
        onclick: () => {
          view.period = p.id;
          selectedBar = null;
          saveView();
          rerender();
        },
      }, p.label),
    ),
  );
  // keep the chosen period visible when the row is wider than the screen
  requestAnimationFrame(() => row.querySelector('[aria-checked="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  return row;
}

function customRange(rerender) {
  const today = todayKey();
  const mk = (which) =>
    h('input.input', {
      type: 'date',
      value: view.custom[which],
      max: today,
      'aria-label': which === 'start' ? 'From date' : 'To date',
      onchange: (e) => {
        if (!KEY_RE.test(e.target.value)) return;
        view.custom = { ...view.custom, [which]: e.target.value };
        selectedBar = null;
        saveView();
        rerender();
      },
    });
  return h('div.card.custom-range', h('label.field', h('span.field-label', 'From'), mk('start')), h('label.field', h('span.field-label', 'To'), mk('end')));
}

function dayTile(label, d, iconName, today) {
  return h(
    'div.day-tile',
    h('span.stat-label', icon(iconName, 16), label),
    d ? moneyEl(d.total, { sign: true, cls: 'money-sm' }) : h('span.muted', '—'),
    d && h('span.stat-sub', fmtDay(d.day, today)),
  );
}

// ---------------------------------------------------------------------------

function comparisonCard(period, prev, sum, all, { today, first }) {
  const prevSales = filterByDays(all, prev.start, prev.end);
  const prevTotal = totalProfit(prevSales);
  const cmp = compareTotals(sum.total, prevTotal);
  const countDelta = sum.count - prevSales.length;
  const noBaseline = prevSales.length === 0;
  return h(
    'section.card.compare',
    sectionTitle(`vs ${prev.label}`, pctPill(cmp.pct)),
    h(
      'div.compare-grid',
      h('div', h('span.stat-label', 'Now'), moneyEl(sum.total, { sign: true, cls: 'money-md' })),
      h('div', h('span.stat-label', 'Before'), moneyEl(prevTotal, { sign: true, cls: 'money-md' })),
      h('div', h('span.stat-label', 'Change'), moneyEl(cmp.delta, { sign: true, cls: 'money-md' })),
    ),
    h('p.muted.small',
      noBaseline
        ? `No sales logged in ${prev.label} (${fmtRange(prev.start, prev.end, today)}), so there is nothing to compare with yet.`
        : `${fmtRange(prev.start, prev.end, today)} · ${prevSales.length} sale${prevSales.length === 1 ? '' : 's'} → ${sum.count} now (${countDelta > 0 ? '+' : countDelta < 0 ? '−' : ''}${Math.abs(countDelta)})`),
  );
}

// ---------------------------------------------------------------------------

function chartsCard(inPeriod, period, { today, weekStart }, rerender) {
  const card = h('section.card.charts');
  const body = h('div.chart-body');
  const detail = h('div.chart-detail');

  const bars = chartBars(inPeriod, period, { today, weekStart });
  if (selectedBar && !bars.some((b) => b.key === selectedBar)) selectedBar = null;

  function show() {
    body.replaceChildren(
      barChart(bars, {
        selectedKey: selectedBar,
        ariaLabel: `${chartKind} profit chart`,
        onSelect: (b) => {
          selectedBar = selectedBar === b.key ? null : b.key;
          show();
        },
      }),
    );
    renderDetail();
  }

  function renderDetail() {
    detail.replaceChildren();
    const b = bars.find((x) => x.key === selectedBar);
    if (!b) {
      detail.append(h('p.muted.small.center', bars.length ? 'Tap a bar for details' : 'No data in this period'));
      return;
    }
    detail.append(
      h('div.bar-detail-head', h('div', h('strong', b.title), h('span.muted.small', ` · ${b.extra}`)), moneyEl(b.value, { sign: true, cls: 'money-sm' })),
    );
    if (chartKind === 'daily') {
      const g = groupByDay(inPeriod.filter((s) => b.match(s)))[0];
      detail.append(
        g
          ? h('div.list', ...g.sales.map((s) => saleRow(s, { onOpen: (x) => openSaleForm({ sale: x }) })))
          : h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => openSaleForm({ day: b.key, returnHome: false }) }, icon('plus', 18), 'Add a sale on this day'),
      );
    } else {
      detail.append(h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => navigate(`history/${chartKind === 'weekly' ? 'week' : 'month'}/${b.key}`) }, 'See days in History', icon('right', 18)));
    }
  }

  card.append(
    sectionTitle('Profit over time'),
    segmented(
      [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }],
      chartKind,
      (v) => {
        chartKind = v;
        selectedBar = null;
        rerender();
      },
      { label: 'Chart granularity' },
    ),
    body,
    detail,
  );
  show();
  return card;
}

function chartBars(inPeriod, period, { today, weekStart }) {
  if (chartKind === 'weekly') {
    return weeklySeries(inPeriod, period.start, period.end, { today, weekStart }).map((w) => ({
      key: w.key,
      label: fmtDayShort(w.start).split(' ')[0],
      sublabel: fmtMonthShort3(w.start),
      title: `Week of ${fmtDayShort(w.start)}`,
      value: w.total,
      extra: `${w.count} sale${w.count === 1 ? '' : 's'}`,
    }));
  }
  if (chartKind === 'monthly') {
    return monthlySeries(inPeriod, period.start, period.end, { today }).map((m) => ({
      key: m.key,
      label: fmtMonthShort3(m.start),
      sublabel: m.key.slice(0, 4),
      title: fmtMonthLabel(m.key),
      value: m.total,
      extra: `${m.count} sale${m.count === 1 ? '' : 's'}`,
    }));
  }
  return dailySeries(inPeriod, period.start, period.end, today).map((d) => ({
    key: d.key,
    label: String(Number(d.key.slice(8))),
    sublabel: d.key.endsWith('-01') ? fmtMonthShort3(d.key) : fmtWeekday(d.key).slice(0, 2),
    title: fmtDayFull(d.key, today),
    value: d.total,
    extra: `${d.count} sale${d.count === 1 ? '' : 's'}`,
    match: (s) => dayKey(s.ts) === d.key,
  }));
}

// ---------------------------------------------------------------------------

function platformCard(inPeriod) {
  const tags = byTag(inPeriod);
  const card = h('section.card.platforms', sectionTitle('By platform'));
  if (!tags.length) {
    card.append(h('p.muted', 'No sales in this period.'));
    return card;
  }
  const slices = tags.filter((t) => t.total > 0).map((t) => ({ label: t.label, value: t.total, color: tagColor(t.tag) }));
  const total = totalProfit(inPeriod);
  if (slices.length) {
    card.append(
      h('div.donut-row', donutChart(slices, {
        center: h('div.donut-label', h('span.stat-label', 'Total'), moneyEl(total, { cls: 'money-sm', tone: false })),
      })),
    );
  }
  const maxAbs = Math.max(...tags.map((t) => Math.abs(t.total)), 1);
  card.append(
    h('div.plat-list', ...tags.map((t) =>
      h(
        'div.plat-row',
        tagBadge(t.tag, 36),
        h(
          'div.plat-main',
          h('div.plat-top', h('strong', t.label), moneyEl(t.total, { sign: true, cls: 'money-sm' })),
          h('div.plat-bar', h('span', { class: t.total < 0 ? 'neg' : '', style: { width: Math.max(2, (Math.abs(t.total) / maxAbs) * 100) + '%', '--c': tagColor(t.tag) } })),
          h('span.muted.small', `${t.count} sale${t.count === 1 ? '' : 's'}${t.share ? ` · ${(t.share * 100).toFixed(t.share < 0.1 ? 1 : 0)}% of profit` : ''}`),
        ),
      ),
    )),
  );
  if (tags.some((t) => t.total < 0)) card.append(h('p.muted.small', 'Platforms with a net loss are left out of the donut.'));
  return card;
}

// ---------------------------------------------------------------------------

function projectionCard(all, { today, weekStart }) {
  const p = projection(all, { today, weekStart });
  const card = h('section.card.projection', sectionTitle('30-day projection'));
  if (!p.hasData) {
    card.append(h('p.muted', 'Log some sales to see what a typical month could look like.'));
    return card;
  }
  if (!p.enough) {
    card.append(banner({
      kind: 'warn',
      iconName: 'alert',
      title: `Only ${p.dataDays} day${p.dataDays === 1 ? '' : 's'} of data`,
      text: `This is a rough guess. It becomes more reliable after ${p.minDays} days of use.`,
    }));
  }
  card.append(
    h('span.stat-label', 'Expected profit in a 30-day month'),
    moneyEl(p.projected, { sign: true, unit: true, cls: 'money-lg' }),
    h('p.muted.small', `Based on ${formatMoney(p.avgDaily)} TND per day, averaged over the last ${p.windowDays} day${p.windowDays === 1 ? '' : 's'}.`),
  );
  if (p.floor !== null) {
    const lo = p.floor;
    const hi = p.ceiling;
    const pos = hi === lo ? 50 : ((p.projected - lo) / (hi - lo)) * 100;
    card.append(
      h(
        'div.range',
        h('div.range-track', h('span.range-dot', { style: { left: `${Math.min(97, Math.max(3, pos))}%` } })),
        h(
          'div.range-labels',
          h('div', h('span.stat-label', 'Floor'), moneyEl(lo, { sign: true, cls: 'money-sm' })),
          h('div.right', h('span.stat-label', 'Ceiling'), moneyEl(hi, { sign: true, cls: 'money-sm' })),
        ),
      ),
      h('p.muted.small',
        `Floor: your lowest full week (${fmtRange(p.lowestWeek.start, p.lowestWeek.end, today)}, ${formatMoney(p.lowestWeek.total)} TND) repeated for 30 days. ` +
        `Ceiling: your best full week (${fmtRange(p.highestWeek.start, p.highestWeek.end, today)}, ${formatMoney(p.highestWeek.total)} TND).`),
    );
  } else {
    card.append(h('p.muted.small', 'Floor and ceiling appear once you have a complete week of data.'));
  }
  return card;
}
