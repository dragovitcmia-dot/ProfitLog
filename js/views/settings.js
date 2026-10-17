// Settings: backups, import/export, preferences, platforms, install, demo data, danger zone.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { screenHead, segmented, tagBadge, banner } from '../ui/components.js';
import { openModal, sheetHeader, confirmDialog } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { exportJSON, exportCSV } from '../ui/exporters.js';
import { startImport } from './importflow.js';
import { canPromptInstall, promptInstall, isStandalone, isIOS } from '../ui/pwa.js';
import { store } from '../data/store.js';
import { DEFAULT_TAGS, MAX_TAG } from '../core/io.js';
import { WEEKDAYS } from '../core/dates.js';
import { DEMO_COUNT } from '../core/demo.js';
import { VERSION } from '../version.js';

let csvStyle = 'standard';

export function renderSettings(root, _route, rerender) {
  root.append(screenHead('Settings', { subtitle: 'Everything is stored on this device' }));

  if (store.backupDue()) {
    root.append(banner({
      kind: 'info',
      iconName: 'shield',
      title: 'Time for a backup',
      text: store.settings.lastExportAt ? 'More than 7 days since your last export.' : "You haven't exported a backup yet.",
      actions: [{ label: 'Export backup', primary: true, onClick: () => doExportJSON() }],
    }));
  }

  root.append(
    backupCard(rerender),
    storageCard(),
    preferencesCard(rerender),
    platformsCard(),
    installCard(),
    demoCard(),
    dangerCard(),
    aboutCard(),
  );
}

// ---------------------------------------------------------------------------

const card = (title, ...children) => h('section.card.settings-card', h('h2.card-title', title), ...children);

function row(iconName, title, desc, control) {
  return h('div.srow', icon(iconName, 22), h('div.srow-main', h('strong', title), desc && h('span.muted.small', desc)), control);
}

function lastBackupText() {
  const t = store.settings.lastExportAt;
  if (!t) return 'Never exported';
  const days = Math.floor((Date.now() - t) / 86400000);
  return days <= 0 ? 'Last backup: today' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago`;
}

function doExportJSON() {
  const n = exportJSON();
  showToast(`Backup saved (${n} sale${n === 1 ? '' : 's'})`);
}

function backupCard(rerender) {
  const file = h('input', {
    type: 'file',
    accept: '.json,.csv,application/json,text/csv,text/plain',
    hidden: true,
    onchange: (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) startImport(f);
    },
  });
  return card(
    'Backup & restore',
    h('p.muted.small', lastBackupText()),
    h('div.btn-stack',
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: doExportJSON }, icon('download', 20), 'Export everything (JSON)'),
      h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => {
        const n = exportCSV({ decimal: csvStyle === 'excel-fr' ? ',' : '.' });
        showToast(`Exported ${n} sale${n === 1 ? '' : 's'} to CSV`);
      } }, icon('download', 20), 'Export sales (CSV)'),
    ),
    h('div.field',
      h('span.field-label', 'CSV style'),
      segmented(
        [{ value: 'standard', label: '12.500' }, { value: 'excel-fr', label: '12,500 (; )' }],
        csvStyle,
        (v) => { csvStyle = v; rerender(); },
        { label: 'CSV number style' },
      ),
      h('span.field-hint', csvStyle === 'standard'
        ? 'Comma-separated with a dot decimal: Google Sheets and English Excel.'
        : 'Semicolon-separated with a decimal comma: Excel set to French or Arabic (Tunisia).'),
    ),
    h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => file.click() }, icon('upload', 20), 'Import from JSON or CSV'),
    file,
    h('p.muted.small', 'Imports always show a preview first. Merging never overwrites what you already have.'),
  );
}

function storageCard() {
  const status = h('span.pill.pill-flat', 'Checking…');
  const usage = h('span.muted.small');
  const btn = h('button.btn.btn-secondary.btn-block', { type: 'button', hidden: true }, icon('shield', 20), 'Protect my data');

  async function refresh() {
    if (!navigator.storage?.persisted) {
      status.textContent = 'Not supported';
      return;
    }
    const persisted = await navigator.storage.persisted();
    if (!status.isConnected) return;
    status.textContent = persisted ? 'Protected' : 'Not protected';
    status.className = `pill ${persisted ? 'pill-up' : 'pill-flat'}`;
    btn.hidden = persisted || !navigator.storage.persist;
    try {
      const est = await navigator.storage.estimate();
      usage.textContent = `Using about ${formatBytes(est.usage || 0)} on this device · storage engine: ${engineName()}`;
    } catch { usage.textContent = `Storage engine: ${engineName()}`; }
  }
  btn.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    showToast(ok ? 'Done. The browser will keep your data.' : 'The browser said no. Installing the app to your Home Screen usually helps.', { kind: ok ? 'success' : 'info', duration: 7000 });
    refresh();
  });
  refresh();

  return card(
    'Keep my data safe',
    h('div.srow', icon('database', 22), h('div.srow-main', h('strong', 'Persistent storage'), usage), status),
    btn,
    h('p.explain',
      h('strong', 'Where is my data? '),
      'Only in this browser, on this device. There is no server and no cloud copy. ',
      h('strong', 'If browser data is cleared '),
      '(clearing site data, "clear history", uninstalling the browser, or the phone reclaiming space), ',
      h('strong.danger-text', 'every sale is permanently lost'),
      '. Protected storage asks the browser not to delete it on its own, but it cannot stop you clearing it yourself. ',
      'The only real safety net is a regular backup file.'),
  );
}

function engineName() {
  return { indexeddb: 'IndexedDB', localstorage: 'localStorage (fallback)', memory: 'memory only!' }[store.kind];
}

const formatBytes = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

// ---------------------------------------------------------------------------

function preferencesCard(rerender) {
  const week = h('select.input.select', {
    'aria-label': 'Week starts on',
    onchange: (e) => store.saveSettings({ weekStart: Number(e.target.value) }),
  }, ...[1, 2, 3, 4, 5, 6, 0].map((d) => h('option', { value: d, selected: store.settings.weekStart === d }, WEEKDAYS[d])));
  return card(
    'Preferences',
    h('div.field', h('span.field-label', 'Theme'),
      segmented(
        [{ value: 'auto', label: 'Auto', icon: 'auto' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }],
        store.settings.theme,
        (v) => store.saveSettings({ theme: v }),
        { label: 'Theme' })),
    h('label.field', h('span.field-label', 'Week starts on'), week),
  );
}

function platformsCard() {
  const list = h('div.tag-list');
  const input = h('input.input', {
    type: 'text',
    maxlength: MAX_TAG,
    placeholder: 'New platform name',
    'aria-label': 'New platform name',
    enterkeyhint: 'done',
    onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), add()),
  });

  function add() {
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (!name) return;
    if (store.settings.tags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      showToast(`"${name}" is already in the list`, { kind: 'info' });
      return;
    }
    store.saveSettings({ tags: [...store.settings.tags, name] });
    input.value = '';
  }

  for (const t of store.settings.tags) {
    const used = store.sales.filter((s) => s.tag === t).length;
    list.append(
      h('div.tag-row',
        tagBadge(t, 36),
        h('div.srow-main', h('strong', t), h('span.muted.small', used ? `${used} sale${used === 1 ? '' : 's'}` : 'unused')),
        h('button.icon-btn', { type: 'button', 'aria-label': `Rename ${t}`, onclick: () => renameTag(t) }, icon('edit', 20)),
        h('button.icon-btn', { type: 'button', 'aria-label': `Remove ${t}`, onclick: () => removeTag(t, used) }, icon('x', 20))),
    );
  }

  return card(
    'Platform tags',
    h('p.muted.small', 'These are the chips you can tap when logging a sale. Renaming also updates past sales.'),
    list,
    h('div.add-tag', input, h('button.btn.btn-secondary', { type: 'button', onclick: add }, icon('plus', 20), 'Add')),
    h('button.btn.btn-ghost.btn-block', { type: 'button', onclick: async () => {
      const ok = await confirmDialog({ title: 'Reset platforms?', message: 'The chip list goes back to the 9 defaults. Past sales keep their platform.', confirmLabel: 'Reset' });
      if (ok) store.saveSettings({ tags: [...DEFAULT_TAGS] });
    } }, icon('refresh', 18), 'Reset to defaults'),
  );
}

async function removeTag(tag, used) {
  if (used) {
    const ok = await confirmDialog({
      title: `Remove "${tag}"?`,
      message: `${used} past sale${used === 1 ? ' uses' : 's use'} it and will keep the label. It just won't be a chip any more.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
  }
  store.saveSettings({ tags: store.settings.tags.filter((t) => t !== tag) });
}

function renameTag(tag) {
  let modal;
  const input = h('input.input', { type: 'text', value: tag, maxlength: MAX_TAG, 'aria-label': 'Platform name', enterkeyhint: 'done', onkeydown: (e) => e.key === 'Enter' && save() });
  function save() {
    const name = input.value.replace(/\s+/g, ' ').trim();
    if (!name || name === tag) return modal.close();
    if (store.settings.tags.some((t) => t !== tag && t.toLowerCase() === name.toLowerCase())) {
      showToast(`"${name}" already exists`, { kind: 'info' });
      return;
    }
    store.renameTag(tag, name);
    modal.close();
  }
  modal = openModal(
    h('div.dialog-body', h('h2.dialog-title', 'Rename platform'), h('label.field', h('span.field-label', 'Name'), input),
      h('div.dialog-actions', h('button.btn.btn-primary.btn-block', { type: 'button', onclick: save }, 'Save'), h('button.btn.btn-ghost.btn-block', { type: 'button', onclick: () => modal.close() }, 'Cancel'))),
    { kind: 'dialog', label: 'Rename platform' },
  );
  input.focus();
  input.select();
}

// ---------------------------------------------------------------------------

function installCard() {
  if (isStandalone()) {
    return card('Install', row('phone', 'Installed', 'You are using ProfitLog as an app. It works offline.'));
  }
  const children = [];
  if (canPromptInstall()) {
    children.push(h('button.btn.btn-primary.btn-block', { type: 'button', onclick: async () => {
      const r = await promptInstall();
      if (r === 'accepted') showToast('Installing…', { kind: 'info' });
    } }, icon('phone', 20), 'Install app'));
  }
  children.push(
    h('p.explain', isIOS()
      ? 'On iPhone/iPad (Safari): tap the Share button, then "Add to Home Screen".'
      : 'On Android (Chrome): open the ⋮ menu, then "Install app" or "Add to Home screen".'),
  );
  return card('Install on your phone', ...children);
}

function demoCard() {
  const n = store.demoCount;
  return card(
    'Demo data',
    h('p.muted.small', n
      ? `${n} demo sales are mixed into your log. They are marked internally, so removing them never touches your real entries. Editing a demo sale turns it into a real one.`
      : `Adds about ${DEMO_COUNT} sample sales over the last 3 weeks so you can try the charts and projection.`),
    n
      ? h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => {
          const removed = store.sales.filter((s) => s.demo);
          store.removeDemo();
          showToast(`Removed ${removed.length} demo sales`, { actionLabel: 'Undo', onAction: () => store.restoreSales(removed), kind: 'info' });
        } }, icon('trash', 20), `Remove demo data (${n})`)
      : h('button.btn.btn-secondary.btn-block', { type: 'button', onclick: () => {
          const c = store.loadDemo();
          showToast(`Loaded ${c} demo sales`, { kind: 'info' });
        } }, icon('flask', 20), `Load demo data (${DEMO_COUNT})`),
  );
}

function dangerCard() {
  const backupOffer = { label: 'Download a backup first', run: () => exportJSON(), doneText: 'Backup downloaded.' };
  return card(
    'Danger zone',
    h('button.btn.btn-danger-ghost.btn-block', { type: 'button', onclick: async () => {
      if (!store.sales.length) return showToast('There are no sales to delete.', { kind: 'info' });
      const ok = await confirmDialog({
        title: 'Delete all sales?',
        message: `This removes all ${store.sales.length} sale${store.sales.length === 1 ? '' : 's'}. Your settings and platforms stay.`,
        confirmLabel: 'Delete all sales',
        danger: true,
        requireText: 'DELETE',
        extra: backupOffer,
      });
      if (!ok) return;
      const removed = store.deleteAllSales();
      showToast(`Deleted ${removed.length} sales`, { actionLabel: 'Undo', duration: 10000, kind: 'info', onAction: () => store.restoreSales(removed) });
    } }, icon('trash', 20), 'Delete all sales'),
    h('button.btn.btn-danger.btn-block', { type: 'button', onclick: async () => {
      const ok = await confirmDialog({
        title: 'Delete everything?',
        message: 'This erases all sales AND resets platforms, theme, week start and backup history on this device. It cannot be undone.',
        confirmLabel: 'Delete everything',
        danger: true,
        requireText: 'DELETE',
        extra: backupOffer,
      });
      if (!ok) return;
      await store.deleteEverything();
      try { localStorage.removeItem('pl-dashboard'); localStorage.removeItem('pl-theme'); } catch { /* ignore */ }
      showToast('Everything was deleted.', { kind: 'info' });
    } }, icon('alert', 20), 'Delete everything'),
  );
}

function aboutCard() {
  return card(
    'About',
    h('p.muted.small', `ProfitLog v${VERSION} · amounts in TND (stored as whole millimes) · dates and times in Africa/Tunis.`),
    h('p.muted.small', 'No account, no tracking, no server. Works fully offline.'),
  );
}
