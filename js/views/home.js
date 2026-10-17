// Home: today's profit, week and month cards, and today's sales.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { moneyEl, countUp, saleRow, emptyState, banner, screenHead } from '../ui/components.js';
import { openSaleForm } from '../ui/saleform.js';
import { exportJSON } from '../ui/exporters.js';
import { showToast } from '../ui/toast.js';
import { navigate } from '../ui/router.js';
import { store } from '../data/store.js';
import { todayKey, weekStartOf, monthStartOf, fmtDayLong, addDays, dayKey } from '../core/dates.js';
import { rangeTotals } from '../core/stats.js';

let lastShown = { day: null, value: 0 };

export function renderHome(root) {
  const today = todayKey();
  const ws = store.settings.weekStart;
  const sales = store.sales;
  const t = rangeTotals(sales, today, today);
  const wk = rangeTotals(sales, weekStartOf(today, ws), addDays(weekStartOf(today, ws), 6));
  const mo = rangeTotals(sales, monthStartOf(today), today);
  const todays = sales.filter((s) => dayKey(s.ts) === today);

  root.append(screenHead('ProfitLog', { subtitle: fmtDayLong(today) }));

  if (store.kind !== 'indexeddb') {
    root.append(banner({
      kind: 'warn',
      iconName: 'alert',
      title: store.kind === 'localstorage' ? 'Using basic storage' : 'Storage is not available',
      text: store.kind === 'localstorage'
        ? 'Your browser blocked the main database, so sales are kept in simpler storage. Export backups regularly.'
        : 'Sales will be lost when you close the app. Open it in a normal (non-private) browser window.',
    }));
  }

  if (store.backupDue()) {
    root.append(banner({
      kind: 'info',
      iconName: 'shield',
      title: 'Time for a backup',
      text: store.settings.lastExportAt ? 'It has been more than 7 days since your last export.' : "You haven't exported a backup yet.",
      actions: [
        { label: 'Export backup', primary: true, onClick: () => { const n = exportJSON(); showToast(`Backup saved (${n} sales)`, { kind: 'success' }); } },
        { label: 'Later', onClick: () => store.saveSettings({ backupSnoozedUntil: Date.now() + 86400000 }) },
      ],
    }));
  }

  // hero
  const heroValue = moneyEl(t.total, { cls: 'money-xl', tone: false });
  const hero = h(
    'section.hero',
    h('div.hero-top', h('span.hero-label', 'Today’s profit'), h('span.hero-unit', 'TND')),
    heroValue,
    h('p.hero-sub', t.count === 0 ? 'No sales yet today' : `${t.count} sale${t.count === 1 ? '' : 's'} today`),
    h('button.btn.btn-hero', { type: 'button', onclick: () => openSaleForm() }, icon('plus', 26), 'Log sale'),
  );
  root.append(hero);
  const from = lastShown.day === today ? lastShown.value : t.total;
  countUp(heroValue, from, t.total);
  lastShown = { day: today, value: t.total };

  root.append(
    h(
      'div.grid-2',
      miniCard('This week', wk, 'week'),
      miniCard('This month', mo, 'month'),
    ),
  );

  root.append(h('div.section-title', h('h2', 'Today\u2019s sales'), todays.length > 0 && h('span.muted', `${todays.length}`)));
  if (!todays.length) {
    root.append(
      store.sales.length === 0
        ? emptyState({
            title: 'Log your first sale',
            text: 'Tap Log sale, type the profit and you’re done. Everything stays on this phone.',
            actionLabel: 'Log sale',
            onAction: () => openSaleForm(),
            secondaryLabel: 'Try with demo data',
            onSecondary: () => { store.loadDemo(); showToast('Demo data loaded. Remove it any time in Settings.', { kind: 'info' }); },
          })
        : emptyState({ title: 'Nothing logged today', text: 'Your next sale will show up here.' }),
    );
  } else {
    root.append(h('div.list.card', ...todays.map((s) => saleRow(s, { onOpen: (x) => openSaleForm({ sale: x }) }))));
  }
}

function miniCard(label, totals, mode) {
  return h(
    'button.card.mini',
    { type: 'button', onclick: () => navigate(`history/${mode}`), 'aria-label': `${label}: open ${mode} history` },
    h('span.mini-label', label),
    moneyEl(totals.total, { cls: 'money-md' }),
    h('span.mini-sub', `${totals.count} sale${totals.count === 1 ? '' : 's'}`),
  );
}
