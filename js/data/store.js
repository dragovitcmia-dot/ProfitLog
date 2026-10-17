// In-memory state backed by a storage adapter. Views read `store.sales` and
// `store.settings` and re-render when the store emits a change. Writes are
// applied to memory immediately and persisted in order in the background.

import { openStorage } from './db.js';
import { DEFAULT_TAGS, validateSale, newId } from '../core/io.js';
import { generateDemo } from '../core/demo.js';
import { byNewest } from '../core/stats.js';
import { DEFAULT_CALC, cleanCalc } from '../core/calc.js';

export function defaultSettings(now = Date.now()) {
  return {
    tags: [...DEFAULT_TAGS],
    weekStart: 1, // Monday
    theme: 'auto',
    lastExportAt: null,
    firstRunAt: now,
    backupSnoozedUntil: 0,
    calc: { ...DEFAULT_CALC }, // calculator rates (USDT price, credit price, EUR/USD)
  };
}

class Store {
  constructor() {
    this.sales = [];
    this.settings = defaultSettings();
    this.kind = 'memory';
    this.listeners = new Set();
    this.errorHandlers = new Set();
    this.queue = Promise.resolve();
    this.adapter = null;
  }

  async init(adapter) {
    this.adapter = adapter || (await openStorage());
    this.kind = this.adapter.kind;
    const { sales, settings } = await this.adapter.loadAll();
    this.sales = (sales || []).filter((s) => validateSale(s).ok).sort(byNewest);
    this.settings = { ...defaultSettings(), ...(settings || {}) };
    this.settings.calc = cleanCalc(this.settings.calc);
    if (!settings) this.persist(() => this.adapter.saveSettings(this.settings)); // remember first run
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onError(fn) {
    this.errorHandlers.add(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) fn();
  }

  /** Persist in order; report failures (e.g. storage full) without breaking the UI. */
  persist(job) {
    this.queue = this.queue.then(job).catch((err) => {
      console.error('Saving failed', err);
      for (const fn of this.errorHandlers) fn(err);
    });
    return this.queue;
  }

  /** Resolves when everything queued so far is written. */
  flush() {
    return this.queue;
  }

  // ---- sales ----

  getSale(id) {
    return this.sales.find((s) => s.id === id) || null;
  }

  addSale({ profit, ts, tag, note }) {
    const now = Date.now();
    const r = validateSale({ id: newId(), ts, profit, tag, note, createdAt: now, updatedAt: now });
    if (!r.ok) throw new Error(r.error);
    this.insert([r.sale]);
    return r.sale;
  }

  /** Returns { before, after }. Editing a demo sale makes it a real one. */
  updateSale(id, patch) {
    const before = this.getSale(id);
    if (!before) throw new Error('Sale not found');
    const merged = { ...before, ...patch, id, createdAt: before.createdAt, updatedAt: Date.now() };
    delete merged.demo;
    const r = validateSale(merged);
    if (!r.ok) throw new Error(r.error);
    this.sales = this.sales.map((s) => (s.id === id ? r.sale : s)).sort(byNewest);
    this.persist(() => this.adapter.putSales([r.sale]));
    this.emit();
    return { before, after: r.sale };
  }

  /** Put sales back (undo of a delete or edit); replaces any sale with the same id. */
  restoreSales(list) {
    this.insert(list);
  }

  insert(list) {
    const ids = new Set(list.map((s) => s.id));
    this.sales = [...this.sales.filter((s) => !ids.has(s.id)), ...list].sort(byNewest);
    this.persist(() => this.adapter.putSales(list));
    this.emit();
  }

  deleteSale(id) {
    const sale = this.getSale(id);
    if (!sale) return null;
    this.sales = this.sales.filter((s) => s.id !== id);
    this.persist(() => this.adapter.deleteSales([id]));
    this.emit();
    return sale;
  }

  deleteAllSales() {
    const removed = this.sales;
    this.sales = [];
    this.persist(() => this.adapter.clearSales());
    this.emit();
    return removed;
  }

  /** Wipes sales AND settings (tags, theme, week start, calculator rates, backup history). */
  async deleteEverything() {
    this.sales = [];
    this.settings = defaultSettings();
    this.persist(async () => {
      await this.adapter.clearAll();
      await this.adapter.saveSettings(this.settings);
    });
    this.emit();
    await this.flush();
  }

  // ---- demo data ----

  get demoCount() {
    return this.sales.reduce((n, s) => n + (s.demo ? 1 : 0), 0);
  }

  get realCount() {
    return this.sales.length - this.demoCount;
  }

  loadDemo() {
    const demo = generateDemo({ tags: this.settings.tags });
    this.removeDemo({ silent: true });
    this.insert(demo);
    return demo.length;
  }

  removeDemo({ silent = false } = {}) {
    const ids = this.sales.filter((s) => s.demo).map((s) => s.id);
    if (!ids.length) return 0;
    const set = new Set(ids);
    this.sales = this.sales.filter((s) => !set.has(s.id));
    this.persist(() => this.adapter.deleteSales(ids));
    if (!silent) this.emit();
    return ids.length;
  }

  // ---- import ----

  /** Apply a plan from planImport(). `incomingSettings` come from a JSON backup. */
  applyImport(plan, incomingSettings) {
    if (plan.mode === 'replace') {
      this.sales = [];
      this.persist(() => this.adapter.clearSales());
    }
    // Platforms that appear in the file become chips, so nothing is orphaned.
    const nextTags = [...this.settings.tags];
    const wantedTags = [...(incomingSettings?.tags ?? []), ...plan.add.map((s) => s.tag).filter(Boolean)];
    for (const t of wantedTags) if (!nextTags.includes(t)) nextTags.push(t);
    const settingsPatch = { tags: nextTags };
    if (plan.mode === 'replace' && incomingSettings) {
      if (incomingSettings.weekStart !== undefined) settingsPatch.weekStart = incomingSettings.weekStart;
      if (incomingSettings.theme) settingsPatch.theme = incomingSettings.theme;
      if (incomingSettings.calc) settingsPatch.calc = incomingSettings.calc;
    }
    this.insert(plan.add);
    this.saveSettings(settingsPatch);
  }

  // ---- settings ----

  /** `silent` saves without re-rendering (for fields the person is typing into right now). */
  saveSettings(patch, { silent = false } = {}) {
    this.settings = { ...this.settings, ...patch };
    const snapshot = this.settings;
    this.persist(() => this.adapter.saveSettings(snapshot));
    if (!silent) this.emit();
  }

  markExported() {
    this.saveSettings({ lastExportAt: Date.now(), backupSnoozedUntil: 0 });
  }

  /** Rename a platform everywhere, including on past sales. */
  renameTag(from, to) {
    const changed = [];
    this.sales = this.sales.map((s) => {
      if (s.tag !== from) return s;
      const next = { ...s, tag: to, updatedAt: Date.now() };
      changed.push(next);
      return next;
    });
    if (changed.length) this.persist(() => this.adapter.putSales(changed));
    this.saveSettings({ tags: this.settings.tags.map((t) => (t === from ? to : t)) });
  }

  /** True when a backup is due: more than 7 days since the last export (or since first use). */
  backupDue(now = Date.now()) {
    if (this.realCount === 0) return false;
    if (now < (this.settings.backupSnoozedUntil || 0)) return false;
    const ref = this.settings.lastExportAt ?? this.settings.firstRunAt ?? now;
    return now - ref > 7 * 86400000;
  }
}

export const store = new Store();
