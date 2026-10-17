// Import: read a file, show a preview with validation, let the person choose
// merge or replace, and only then touch their data.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openModal, sheetHeader, confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { moneyEl } from '../ui/components.js';
import { exportJSON } from '../ui/exporters.js';
import { store } from '../data/store.js';
import { parseImportFile, planImport } from '../core/io.js';
import { totalProfit } from '../core/stats.js';
import { dayKey, fmtDayFull, todayKey } from '../core/dates.js';

export async function startImport(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    showToast('Could not read that file.', { kind: 'error' });
    return;
  }
  const parsed = parseImportFile(file.name, text);
  if (!parsed.ok) {
    showProblem(file.name, parsed.error);
    return;
  }
  showPreview(file.name, parsed);
}

function showProblem(name, message) {
  let modal;
  modal = openModal(
    h('div.sheet-inner', sheetHeader('Can’t import this file', () => modal),
      h('div.sheet-body', h('p.muted', name), h('p', message), h('p.muted.small', 'Nothing was changed.')),
      h('footer.sheet-foot', h('button.btn.btn-primary.btn-xl', { type: 'button', onclick: () => modal.close() }, 'OK'))),
    { kind: 'sheet', label: 'Import problem' },
  );
}

function showPreview(name, parsed) {
  const incoming = parsed.sales;
  let mode = 'merge';
  let modal;
  const today = todayKey();

  const days = incoming.map((s) => dayKey(s.ts)).sort();
  const known = new Set(store.settings.tags);
  const newTags = [...new Set([...incoming.map((s) => s.tag).filter(Boolean), ...(parsed.settings?.tags ?? [])])].filter((t) => !known.has(t));

  const summary = h(
    'div.card.import-summary',
    h('p.muted.small', `${name} · ${parsed.format.toUpperCase()}`),
    h('div.stat-grid',
      h('div.stat', h('span.stat-label', 'Valid sales'), h('div.stat-value', String(incoming.length))),
      h('div.stat', h('span.stat-label', 'Total profit'), h('div.stat-value', moneyEl(totalProfit(incoming), { sign: true, cls: 'money-sm' }))),
      h('div.stat', h('span.stat-label', 'From'), h('div.stat-value', days.length ? fmtDayFull(days[0], today) : '—')),
      h('div.stat', h('span.stat-label', 'To'), h('div.stat-value', days.length ? fmtDayFull(days[days.length - 1], today) : '—')),
    ),
    newTags.length > 0 && h('p.small', icon('tag', 16), ` New platforms will be added to your chips: ${newTags.join(', ')}`),
  );

  const problems = parsed.rejected.length
    ? h('details.card.problems', h('summary', icon('alert', 18), `${parsed.rejected.length} row${parsed.rejected.length === 1 ? '' : 's'} will be skipped`),
        h('ul', ...parsed.rejected.slice(0, 12).map((r) => h('li', `Row ${r.row}: ${r.error}`)),
          parsed.rejected.length > 12 && h('li', `…and ${parsed.rejected.length - 12} more`)))
    : null;

  const planText = h('p.plan', { 'aria-live': 'polite' });
  const importBtn = h('button.btn.btn-primary.btn-xl', { type: 'button', onclick: () => run() }, 'Import');

  const choice = (value, title, desc) =>
    h('label.radio-card', h('input', { type: 'radio', name: 'mode', value, checked: value === mode, onchange: () => { mode = value; refresh(); } }),
      h('div', h('strong', title), h('span.muted.small', desc)));

  function refresh() {
    const plan = planImport(store.sales, incoming, mode);
    if (mode === 'merge') {
      planText.replaceChildren(
        h('strong', `${plan.add.length} new sale${plan.add.length === 1 ? '' : 's'} will be added`),
        plan.duplicates.length ? ` · ${plan.duplicates.length} already here (skipped)` : '',
        h('br'), `Your ${store.sales.length} current sale${store.sales.length === 1 ? '' : 's'} stay untouched.`,
      );
      importBtn.disabled = plan.add.length === 0;
      importBtn.textContent = plan.add.length ? `Add ${plan.add.length} sale${plan.add.length === 1 ? '' : 's'}` : 'Nothing new to add';
    } else {
      planText.replaceChildren(
        h('strong.danger-text', `Your ${store.sales.length} current sale${store.sales.length === 1 ? '' : 's'} will be deleted`),
        ` and replaced by the ${plan.add.length} from this file.`,
      );
      importBtn.disabled = false;
      importBtn.textContent = 'Replace everything';
    }
    importBtn.classList.toggle('btn-danger', mode === 'replace');
    importBtn.classList.toggle('btn-primary', mode === 'merge');
  }

  async function run() {
    const plan = planImport(store.sales, incoming, mode);
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'Replace all your sales?',
        message: `This deletes your ${store.sales.length} current sale${store.sales.length === 1 ? '' : 's'} and uses the ${plan.add.length} from the file instead. You will be able to undo for a few seconds, but a backup is safer.`,
        confirmLabel: 'Replace',
        danger: true,
        extra: store.sales.length ? { label: 'Download a backup first', run: () => exportJSON(), doneText: 'Backup downloaded.' } : null,
      });
      if (!ok) return;
    }
    const previous = store.sales;
    await modal.close();
    store.applyImport(plan, parsed.settings);
    const added = plan.add.map((s) => s.id);
    showToast(`Imported ${plan.add.length} sale${plan.add.length === 1 ? '' : 's'}`, {
      actionLabel: 'Undo',
      duration: 9000,
      onAction: () => {
        if (mode === 'replace') {
          store.deleteAllSales();
          store.restoreSales(previous);
        } else {
          for (const id of added) store.deleteSale(id);
        }
      },
    });
  }

  const body = h(
    'div.sheet-body',
    summary,
    problems,
    h('div.radio-group', { role: 'radiogroup', 'aria-label': 'How to import' },
      choice('merge', 'Merge', 'Add new sales, skip ones you already have. Safe.'),
      choice('replace', 'Replace', 'Delete what is here and use only this file.')),
    planText,
  );
  modal = openModal(
    h('div.sheet-inner', sheetHeader('Import preview', () => modal), body,
      h('footer.sheet-foot', importBtn, h('button.btn.btn-ghost.btn-xl', { type: 'button', onclick: () => modal.close() }, 'Cancel'))),
    { kind: 'sheet', label: 'Import preview' },
  );
  refresh();
}
