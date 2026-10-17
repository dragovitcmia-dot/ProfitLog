// History: sales grouped by day, week and month, with drill-down.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { moneyEl, saleRow, emptyState, segmented, screenHead, statTile } from '../ui/components.js';
import { openSaleForm } from '../ui/saleform.js';
import { navigate } from '../ui/router.js';
import { formatMoney } from '../core/money.js';
import { store } from '../data/store.js';
import { groupByDay, groupByWeek, groupByMonth, firstDay } from '../core/stats.js';
import { todayKey, addDays, fmtDay, fmtRange, fmtMonthLabel, minKey } from '../core/dates.js';

const PAGE = 30;
let dayLimit = PAGE;
const weekOpen = new Map(); // remembers which weeks are expanded in a month

export function renderHistory(root, { rest }) {
  const [mode = 'day', param] = rest;
  const today = todayKey();
  const ws = store.settings.weekStart;
  const ctx = { today, weekStart: ws, first: firstDay(store.sales) };

  const detail = param && (mode === 'week' || mode === 'month');
  if (!detail) {
    root.append(
      screenHead('History', {
        right: h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => openSaleForm({ focusDate: true, returnHome: false }) }, icon('calendar', 18), 'Past sale'),
      }),
      segmented(
        [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }],
        mode,
        (v) => navigate(v === 'day' ? 'history' : `history/${v}`, { replace: true }),
        { label: 'Group sales by', cls: 'seg-sticky' },
      ),
    );
  }

  if (!store.sales.length) {
    root.append(emptyState({
      title: 'No sales yet',
      text: 'Your history will be grouped by day, week and month as you log sales.',
      actionLabel: 'Log sale',
      onAction: () => openSaleForm(),
    }));
    return;
  }

  if (mode === 'week') return param ? weekDetail(root, param, ctx) : weekList(root, ctx);
  if (mode === 'month') return param ? monthDetail(root, param, ctx) : monthList(root, ctx);
  return dayList(root, ctx);
}

// ---------------------------------------------------------------------------

function dayList(root, ctx) {
  const groups = groupByDay(store.sales);
  const shown = groups.slice(0, dayLimit);
  const wrap = h('div.stack');
  for (const g of shown) wrap.append(dayGroup(g, ctx.today));
  root.append(wrap);
  if (groups.length > shown.length) {
    const more = h('button.btn.btn-secondary.btn-block', {
      type: 'button',
      onclick: () => {
        dayLimit += PAGE;
        const next = groups.slice(shown.length, dayLimit);
        for (const g of next) wrap.append(dayGroup(g, ctx.today));
        if (dayLimit >= groups.length) more.remove();
        else more.textContent = `Show older days (${groups.length - dayLimit} more)`;
      },
    }, `Show older days (${groups.length - shown.length} more)`);
    root.append(more);
    // load automatically when scrolled near the end
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && more.isConnected) more.click();
        if (!more.isConnected) io.disconnect();
      }, { rootMargin: '600px' });
      io.observe(more);
    }
  }
}

function dayGroup(g, today) {
  return h(
    'section.day-group',
    h(
      'header.day-head',
      h('div.day-head-main', h('h3', fmtDay(g.day, today)), h('span.muted', `${g.count} sale${g.count === 1 ? '' : 's'}`)),
      moneyEl(g.total, { sign: true, cls: 'money-sm' }),
      addDayButton(g.day),
    ),
    h('div.list.card', ...g.sales.map((s) => saleRow(s, { onOpen: (x) => openSaleForm({ sale: x }) }))),
  );
}

function emptyDay(day, today) {
  return h(
    'section.day-group.day-empty',
    h('header.day-head', h('div.day-head-main', h('h3', fmtDay(day, today)), h('span.muted', 'No sales')), addDayButton(day)),
  );
}

function addDayButton(day) {
  return h('button.icon-btn.add-day', {
    type: 'button',
    'aria-label': `Add a sale on ${fmtDay(day)}`,
    onclick: () => openSaleForm({ day, returnHome: false }),
  }, icon('plus', 20));
}

/** Every day of a bucket up to today: days with sales, and empty days with a "+" to fill forgotten ones. */
function daysOfBucket(bucket, today) {
  const byDay = new Map(bucket.dayGroups.map((g) => [g.day, g]));
  const out = [];
  for (let d = minKey(bucket.end, today); d >= bucket.start; d = addDays(d, -1)) {
    out.push(byDay.has(d) ? dayGroup(byDay.get(d), today) : emptyDay(d, today));
  }
  return out;
}

// ---- weeks ----

function periodCard({ title, badge, total, lines, onClick }) {
  return h(
    'button.card.period-card',
    { type: 'button', onclick: onClick },
    h('div.period-top', h('div', h('h3', title), badge && h('span.tag-now', badge)), icon('right', 20)),
    moneyEl(total, { sign: true, cls: 'money-lg' }),
    h('div.period-lines', ...lines.map((l) => h('span', l))),
  );
}

const sales = (n) => `${n} sale${n === 1 ? '' : 's'}`;
const perDay = (b) => `${formatMoney(b.avgPerDay)} / day`;

function weekList(root, ctx) {
  const weeks = groupByWeek(store.sales, ctx);
  root.append(
    h('div.stack', ...weeks.map((w) =>
      periodCard({
        title: fmtRange(w.start, w.end, ctx.today),
        badge: w.start <= ctx.today && ctx.today <= w.end ? 'This week' : null,
        total: w.total,
        lines: [sales(w.count), `avg ${perDay(w)}`],
        onClick: () => navigate(`history/week/${w.start}`),
      }),
    )),
  );
}

function backHeader(title, subtitle, toHash) {
  return h(
    'header.screen-head.detail-head',
    h('button.icon-btn.back', { type: 'button', 'aria-label': 'Back', onclick: () => navigate(toHash, { replace: true }) }, icon('left')),
    h('div', h('h1.title.title-sm', title), subtitle && h('p.subtitle', subtitle)),
  );
}

function weekDetail(root, start, ctx) {
  const week = groupByWeek(store.sales, ctx).find((w) => w.start === start);
  root.append(backHeader(week ? fmtRange(week.start, week.end, ctx.today) : 'Week', 'Week summary', 'history/week'));
  if (!week) {
    root.append(emptyState({ title: 'Nothing here', text: 'There are no sales in that week.' }));
    return;
  }
  root.append(
    h('div.card.summary', summaryTiles([
      ['Profit', moneyEl(week.total, { sign: true, cls: 'money-md' })],
      ['Sales', String(week.count)],
      ['Avg / day', moneyEl(week.avgPerDay, { cls: 'money-md', tone: false })],
    ])),
    h('div.stack', ...daysOfBucket(week, ctx.today)),
  );
}

// ---- months ----

function monthList(root, ctx) {
  const months = groupByMonth(store.sales, ctx);
  root.append(
    h('div.stack', ...months.map((m) =>
      periodCard({
        title: fmtMonthLabel(m.key),
        badge: m.key === ctx.today.slice(0, 7) ? 'This month' : null,
        total: m.total,
        lines: [sales(m.count), `avg ${perDay(m)}`, `${formatMoney(m.avgPerSale)} / sale`],
        onClick: () => navigate(`history/month/${m.key}`),
      }),
    )),
  );
}

function monthDetail(root, key, ctx) {
  const month = groupByMonth(store.sales, ctx).find((m) => m.key === key);
  root.append(backHeader(month ? fmtMonthLabel(month.key) : 'Month', 'Month summary', 'history/month'));
  if (!month) {
    root.append(emptyState({ title: 'Nothing here', text: 'There are no sales in that month.' }));
    return;
  }
  root.append(
    h('div.card.summary', summaryTiles([
      ['Profit', moneyEl(month.total, { sign: true, cls: 'money-md' })],
      ['Sales', String(month.count)],
      ['Avg / day', moneyEl(month.avgPerDay, { cls: 'money-md', tone: false })],
      ['Avg / sale', moneyEl(month.avgPerSale, { cls: 'money-md', tone: false })],
    ])),
  );
  const weeks = h('div.stack');
  month.weeks.forEach((w, i) => {
    const id = `${key}|${w.start}`;
    const open = weekOpen.has(id) ? weekOpen.get(id) : i === 0;
    const d = h(
      'details.week-acc',
      { open },
      h(
        'summary',
        h('div.acc-main', h('h3', fmtRange(w.start, w.end, ctx.today)), h('span.muted', `${sales(w.count)} · avg ${perDay(w)}`)),
        moneyEl(w.total, { sign: true, cls: 'money-sm' }),
        icon('down', 20, { class: 'icon chev' }),
      ),
      h('div.stack.acc-body', ...daysOfBucket(w, ctx.today)),
    );
    d.addEventListener('toggle', () => weekOpen.set(id, d.open));
    weeks.append(d);
  });
  root.append(h('div.section-title', h('h2', 'Weeks')), weeks);
}

function summaryTiles(items) {
  return items.map(([label, node]) => statTile(label, node));
}
