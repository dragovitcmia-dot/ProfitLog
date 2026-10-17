// Download helpers for backups. Exporting also records the date for the backup reminder.
import { download } from './dom.js';
import { backupToJSON, salesToCSV } from '../core/io.js';
import { todayKey } from '../core/dates.js';
import { store } from '../data/store.js';

export function exportJSON() {
  const text = backupToJSON({ sales: store.sales, settings: store.settings });
  download(`profitlog-backup-${todayKey()}.json`, 'application/json', text);
  store.markExported();
  return store.sales.length;
}

export function exportCSV({ decimal = '.' } = {}) {
  const text = salesToCSV(store.sales, { decimal });
  download(`profitlog-sales-${todayKey()}.csv`, 'text/csv;charset=utf-8', text);
  store.markExported();
  return store.sales.length;
}
