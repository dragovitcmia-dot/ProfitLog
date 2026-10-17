// Money is stored as integer millimes (1 TND = 1000 millimes) and only
// rounded when it is shown. Averages and projections may be fractional
// millimes internally.

export const MILLIMES = 1000;
export const MAX_ABS_MILLIMES = 999999999999; // 999,999,999.999 TND

const GROUP = ' ';
const MINUS = '−';

/**
 * Parse what a person types into integer millimes.
 * Accepts "12", "12.5", "12,5", "-3.250", "+4", "1 234,5", "1,234.50".
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function parseMoney(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('Not a number');
    input = String(input);
  }
  let s = String(input ?? '')
    .replace(/[−‒–—]/g, '-')
    .replace(/[\s  ']/g, '')
    .replace(/(tnd|dt)$/i, '');
  if (s === '') return fail('Enter an amount');

  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return fail('Not a valid number');

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart = s;
  let decPart = '';
  if (lastDot !== -1 && lastComma !== -1) {
    const dec = Math.max(lastDot, lastComma);
    intPart = s.slice(0, dec);
    decPart = s.slice(dec + 1);
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const count = s.split(sep).length - 1;
    if (count === 1) {
      const at = s.indexOf(sep);
      intPart = s.slice(0, at);
      decPart = s.slice(at + 1);
    } // several of the same separator → thousands separators
  }
  if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return fail('Not a valid number');
  intPart = intPart.replace(/[.,]/g, '');
  if (/[.,]/.test(decPart)) return fail('Not a valid number');
  if (intPart === '') intPart = '0';
  if (decPart.length > 3) return fail('At most 3 decimals (millimes)');
  if (intPart.length > 9) return fail('Amount is too large');

  const value = Number(intPart) * MILLIMES + Number(decPart.padEnd(3, '0') || 0);
  if (value > MAX_ABS_MILLIMES) return fail('Amount is too large');
  return { ok: true, value: neg && value !== 0 ? -value : value };
}

function fail(error) {
  return { ok: false, error };
}

/** Split millimes into display pieces. Non-integers are rounded here, and only here. */
export function moneyParts(millimes) {
  const r = Math.round(millimes) || 0;
  const neg = r < 0;
  const abs = Math.abs(r);
  const int = Math.floor(abs / MILLIMES);
  const dec = String(abs % MILLIMES).padStart(3, '0');
  const intStr = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  return { neg, int: intStr, dec };
}

/** "1 234.500", "−12.000". Pass { sign: true } to prefix "+" on positives. */
export function formatMoney(millimes, { sign = false, unit = false } = {}) {
  const { neg, int, dec } = moneyParts(millimes);
  const r = Math.round(millimes) || 0;
  const prefix = neg ? MINUS : sign && r > 0 ? '+' : '';
  return `${prefix}${int}.${dec}${unit ? GROUP + 'TND' : ''}`;
}

/** Value to put back into an input when editing: "12.5", "-3", "0.25". */
export function toInputValue(millimes) {
  const r = Math.round(millimes) || 0;
  const abs = Math.abs(r);
  const int = Math.floor(abs / MILLIMES);
  const dec = String(abs % MILLIMES).padStart(3, '0').replace(/0+$/, '');
  return `${r < 0 ? '-' : ''}${int}${dec ? '.' + dec : ''}`;
}

/** Plain machine format used in CSV: always 3 decimals, '.' or ',' separator. */
export function toCsvAmount(millimes, decimal = '.') {
  const r = Math.round(millimes) || 0;
  const abs = Math.abs(r);
  const s = `${r < 0 ? '-' : ''}${Math.floor(abs / MILLIMES)}.${String(abs % MILLIMES).padStart(3, '0')}`;
  return decimal === ',' ? s.replace('.', ',') : s;
}

/** Percentage change from `prev` to `cur`; null when there is no baseline. */
export function pctChange(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function formatPct(pct, digits = 0) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const v = Math.abs(pct) < 0.05 ? 0 : pct;
  return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}%`;
}
