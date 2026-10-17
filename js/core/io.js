// Import / export: JSON backup, CSV, validation and merge planning. Pure functions.

import { wall, wallToTs, isValidKey, keyOf } from './dates.js';
import { parseMoney, toCsvAmount, MAX_ABS_MILLIMES } from './money.js';

export const APP_ID = 'profitlog';
export const SCHEMA_VERSION = 1;
export const DEFAULT_TAGS = ['Roblox', 'PlayStation', 'Apple', 'Free Fire', 'Nintendo', 'Steam', 'Valorant', 'Xbox', 'Other'];
export const MAX_NOTE = 280;
export const MAX_TAG = 40;

const pad2 = (n) => String(n).padStart(2, '0');

export function newId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Two sales with the same moment, amount, platform and note are the same sale. */
export function signature(s) {
  return `${s.ts}|${s.profit}|${s.tag ?? ''}|${s.note ?? ''}`;
}

/** Normalise one sale; returns { ok, sale } or { ok: false, error }. */
export function validateSale(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not an object' };
  const ts = raw.ts;
  if (!Number.isInteger(ts) || ts < 0 || ts > 4102444800000) return { ok: false, error: 'Invalid date/time' };
  const profit = raw.profit;
  if (!Number.isInteger(profit) || Math.abs(profit) > MAX_ABS_MILLIMES) {
    return { ok: false, error: 'Profit must be a whole number of millimes' };
  }
  const tag = cleanText(raw.tag, MAX_TAG);
  const note = cleanText(raw.note, MAX_NOTE);
  const sale = {
    id: typeof raw.id === 'string' && raw.id && raw.id.length <= 80 ? raw.id : newId(),
    ts,
    profit,
    tag: tag || null,
    note: note || '',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
  if (raw.demo === true) sale.demo = true;
  return { ok: true, sale };
}

function cleanText(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// JSON backup

export function buildBackup({ sales, settings }, now = Date.now()) {
  return {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    currency: 'TND',
    timezone: 'Africa/Tunis',
    note: 'profit is stored in integer millimes (1 TND = 1000 millimes); ts is epoch milliseconds.',
    settings: {
      tags: settings.tags,
      weekStart: settings.weekStart,
      theme: settings.theme,
    },
    sales: sales.map((s) => {
      const o = { id: s.id, ts: s.ts, profit: s.profit, tag: s.tag ?? null, note: s.note ?? '', createdAt: s.createdAt, updatedAt: s.updatedAt };
      if (s.demo) o.demo = true;
      return o;
    }),
  };
}

export function backupToJSON(data, now) {
  return JSON.stringify(buildBackup(data, now), null, 2);
}

/**
 * Parse and validate a JSON backup.
 * Returns { ok: false, error } or { ok: true, sales, rejected, settings }.
 */
export function parseBackup(text, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(stripBom(text));
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  let rows;
  let settings = null;
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object' && data.app === APP_ID && Array.isArray(data.sales)) {
    if (data.schema > SCHEMA_VERSION) {
      return { ok: false, error: 'This backup was made by a newer version of the app. Update the app and try again.' };
    }
    rows = data.sales;
    settings = cleanSettings(data.settings);
  } else {
    return { ok: false, error: 'This does not look like a ProfitLog backup.' };
  }
  const sales = [];
  const rejected = [];
  rows.forEach((raw, i) => {
    const r = validateSale(raw, now);
    if (r.ok) sales.push(r.sale);
    else rejected.push({ row: i + 1, error: r.error });
  });
  return { ok: true, sales, rejected, settings };
}

function cleanSettings(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  if (Array.isArray(s.tags)) {
    out.tags = [...new Set(s.tags.map((t) => cleanText(t, MAX_TAG)).filter(Boolean))].slice(0, 60);
  }
  if (Number.isInteger(s.weekStart) && s.weekStart >= 0 && s.weekStart <= 6) out.weekStart = s.weekStart;
  if (['auto', 'light', 'dark'].includes(s.theme)) out.theme = s.theme;
  return out;
}

const stripBom = (t) => String(t).replace(/^﻿/, '');

// ---------------------------------------------------------------------------
// CSV

export const CSV_HEADER = ['date', 'time', 'profit_tnd', 'platform', 'note', 'id'];

/**
 * CSV that opens correctly in Excel and Google Sheets: UTF-8 with BOM, CRLF line ends.
 * decimal '.' → comma-delimited (English locales, Google Sheets);
 * decimal ',' → semicolon-delimited (French/Arabic-locale Excel, as in Tunisia).
 */
export function salesToCSV(sales, { decimal = '.' } = {}) {
  const delim = decimal === ',' ? ';' : ',';
  const lines = [CSV_HEADER.join(delim)];
  const sorted = [...sales].sort((a, b) => a.ts - b.ts);
  for (const s of sorted) {
    const w = wall(s.ts);
    lines.push(
      [
        csvCell(keyOf(w.y, w.m, w.d), delim),
        csvCell(`${pad2(w.h)}:${pad2(w.mi)}`, delim),
        csvCell(toCsvAmount(s.profit, decimal), delim),
        csvCell(s.tag ?? '', delim, true),
        csvCell(s.note ?? '', delim, true),
        csvCell(s.id, delim),
      ].join(delim),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function csvCell(value, delim, isText = false) {
  let v = String(value ?? '');
  // Stop spreadsheets from executing a note like "=HYPERLINK(...)".
  if (isText && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return v.includes('"') || v.includes(delim) || /[\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** RFC 4180 parser (quotes, doubled quotes, newlines inside quotes). */
export function parseCSVRows(text, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const s = stripBom(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === '') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function detectDelimiter(text) {
  const head = stripBom(text).split(/\r?\n/, 1)[0] || '';
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t']) {
    const n = head.split(d).length - 1;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

const norm = (h) => String(h).toLowerCase().replace(/^﻿/, '').replace(/[^a-z0-9]/g, '');
const ALIASES = {
  date: ['date', 'day', 'datetime', 'datetimetn', 'timestamp', 'when'],
  time: ['time', 'heure', 'hour'],
  profit: ['profit', 'profittnd', 'profitdt', 'tnd', 'amount', 'montant', 'gain', 'benefice'],
  millimes: ['profitmillimes', 'millimes'],
  tag: ['platform', 'plateforme', 'tag', 'category', 'categorie'],
  note: ['note', 'notes', 'comment', 'comments', 'description'],
  id: ['id', 'uuid'],
};

/**
 * Parse a CSV into sales. Returns { ok, sales, rejected, delimiter } or { ok: false, error }.
 * Understands our own export plus the common variations: DD/MM/YYYY dates,
 * a single combined date-time column, decimal commas, ';' or tab delimiters.
 */
export function parseCSVSales(text, now = Date.now()) {
  const delimiter = detectDelimiter(text);
  const rows = parseCSVRows(text, delimiter);
  if (rows.length < 1) return { ok: false, error: 'The CSV file is empty.' };
  const header = rows[0].map(norm);
  const col = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i !== -1) col[field] = i;
  }
  if (col.date === undefined || (col.profit === undefined && col.millimes === undefined)) {
    return {
      ok: false,
      error: 'The CSV needs at least a "date" column and a "profit_tnd" (or "profit") column in its first row.',
    };
  }
  const sales = [];
  const rejected = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (f) => (col[f] === undefined ? '' : (cells[col[f]] ?? '').trim());
    const when = parseWhen(get('date'), get('time'));
    if (!when.ok) {
      rejected.push({ row: r + 1, error: when.error });
      continue;
    }
    let profit;
    if (col.profit !== undefined && get('profit') !== '') {
      const p = parseMoney(get('profit'));
      if (!p.ok) {
        rejected.push({ row: r + 1, error: `Profit "${get('profit')}": ${p.error}` });
        continue;
      }
      profit = p.value;
    } else if (col.millimes !== undefined && /^-?\d+$/.test(get('millimes'))) {
      profit = Number(get('millimes'));
    } else {
      rejected.push({ row: r + 1, error: 'Missing profit' });
      continue;
    }
    const v = validateSale(
      { id: get('id') || undefined, ts: when.ts, profit, tag: get('tag'), note: unquoteFormula(get('note')) },
      now,
    );
    if (v.ok) sales.push(v.sale);
    else rejected.push({ row: r + 1, error: v.error });
  }
  return { ok: true, sales, rejected, delimiter };
}

const unquoteFormula = (v) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v);

function parseWhen(dateStr, timeStr) {
  let ds = dateStr.trim();
  let ts = timeStr.trim();
  const combined = /^(\S+)[T\s]+(\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(ds);
  if (combined) {
    ds = combined[1];
    if (!ts) ts = combined[2];
  }
  let y, m, d;
  let r;
  if ((r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(ds))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(ds))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return { ok: false, error: `Date "${dateStr}" is not YYYY-MM-DD or DD/MM/YYYY` };
  if (!isValidKey(keyOf(y, m, d))) return { ok: false, error: `Date "${dateStr}" does not exist` };
  let h = 12;
  let mi = 0;
  if (ts) {
    const t = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(ts);
    if (!t || +t[1] > 23 || +t[2] > 59) return { ok: false, error: `Time "${timeStr}" is not HH:MM` };
    h = +t[1];
    mi = +t[2];
  }
  return { ok: true, ts: wallToTs(y, m, d, h, mi) };
}

// ---------------------------------------------------------------------------
// Detect + plan

/** Parse a file's text as JSON or CSV based on its name / content. */
export function parseImportFile(name, text, now = Date.now()) {
  const looksJson = /\.json$/i.test(name) || /^\s*[[{]/.test(stripBom(text));
  const r = looksJson ? parseBackup(text, now) : parseCSVSales(text, now);
  return { ...r, format: looksJson ? 'json' : 'csv' };
}

/**
 * Decide what an import would do, without doing it.
 *  merge:   add sales that aren't already here (same id, or same moment+amount+platform+note)
 *  replace: swap everything for the file's sales
 */
export function planImport(existing, incoming, mode) {
  const ids = new Set();
  const sigs = new Set();
  if (mode === 'merge') {
    for (const s of existing) {
      ids.add(s.id);
      sigs.add(signature(s));
    }
  }
  const add = [];
  const duplicates = [];
  for (const s of incoming) {
    const sig = signature(s);
    if (ids.has(s.id) || sigs.has(sig)) {
      duplicates.push(s);
      continue;
    }
    ids.add(s.id);
    sigs.add(sig);
    add.push(s);
  }
  return {
    mode,
    add,
    duplicates,
    removeCount: mode === 'replace' ? existing.length : 0,
  };
}
