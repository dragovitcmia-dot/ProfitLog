// Card profit calculator maths (buy balance with USDT -> pay for the card in EUR -> sell for TND).
// Pure functions, no DOM. Amounts here are plain floats in their own currency; only the
// final profit is turned into integer millimes (profitToMillimes) when it is logged as a sale.

export const SUGGESTED_MARGINS = [10, 15, 20];
const MAX_INPUT = 1e9;

export const DEFAULT_CALC = Object.freeze({
  usdtPrice: '3.38', // TND per 1 USDT
  creditPrice: '113', // paid for 100 EUR of platform balance
  currency: 'USD', // currency of creditPrice: 'USD' | 'EUR'
  eurUsdRate: '1.08', // 1 EUR in USD (only used when currency is 'EUR')
  rateAt: '', // ISO time of the last successful live pull
  rateSource: '',
  rateManual: false, // true once the person typed their own rate
});

/**
 * Accepts "18.84", "18,84", "1 234,5", "1,234.56", Arabic-Indic digits.
 * Returns { state: 'empty' } | { state: 'invalid' } | { state: 'ok', value }.
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return { state: 'empty' };
  let s = String(raw)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/[٬\s  ]/g, ''); // Arabic thousands separator + any spaces
  if (s === '') return { state: 'empty' };

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // both present: the one that comes last is the decimal mark, the other groups thousands
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '.');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { state: 'invalid' };
  const value = parseFloat(s);
  if (!Number.isFinite(value)) return { state: 'invalid' };
  return { state: 'ok', value };
}

export function usdPerEur(creditPrice, currency, eurUsdRate) {
  const usdPer100Credit = currency === 'EUR' ? creditPrice * eurUsdRate : creditPrice;
  return usdPer100Credit / 100;
}

/** i: { displayedPrice, sellPrice, usdtPrice, creditPrice, currency, eurUsdRate } (numbers) */
export function compute(i) {
  const perEur = usdPerEur(i.creditPrice, i.currency, i.eurUsdRate);
  const costUSDT = i.displayedPrice * perEur;
  const costTND = costUSDT * i.usdtPrice;
  const profitTND = i.sellPrice - costTND;
  return {
    usdPer100Credit: perEur * 100,
    usdPerEur: perEur,
    costUSDT,
    costTND,
    profitTND,
    marginOnCost: (profitTND / costTND) * 100,
    marginOnSale: (profitTND / i.sellPrice) * 100,
    profitUSDT: profitTND / i.usdtPrice,
    breakEven: costTND,
    suggested: SUGGESTED_MARGINS.map((margin) => {
      const price = costTND * (1 + margin / 100);
      return { margin, price, profit: price - costTND };
    }),
  };
}

/** Profit in TND (float) -> integer millimes, the unit sales are stored in. */
export function profitToMillimes(profitTND) {
  return Math.round(profitTND * 1000) || 0;
}

// ---- display helpers ----

export function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '-';
  const s = n.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; // never show "-0.00"
}

export function fmtSigned(n, digits = 2) {
  const s = fmt(n, digits);
  return Math.sign(parseFloat(s)) > 0 ? '+' + s : s;
}

/** 3.3800 -> "3.38" */
export function trimNum(n, digits) {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// ---- validation ----

const LABELS = {
  displayedPrice: 'Card price (EUR)',
  sellPrice: 'Sell price (TND)',
  usdtPrice: 'USDT price',
  creditPrice: 'Credit price',
  eurUsdRate: 'EUR/USD rate',
};

function readField(key, raw) {
  const label = LABELS[key];
  const p = parseNumber(raw);
  if (p.state === 'empty') return { problem: { key, kind: 'missing', text: `${label} is missing` } };
  if (p.state === 'invalid') return { problem: { key, kind: 'invalid', text: `${label}: “${String(raw).trim()}” is not a number` } };
  if (!(p.value > 0)) return { problem: { key, kind: 'invalid', text: `${label} must be greater than 0` } };
  if (p.value > MAX_INPUT) return { problem: { key, kind: 'invalid', text: `${label} is too large` } };
  return { value: p.value };
}

/**
 * inputs: { displayedPrice, sellPrice } (strings as typed); calc: the calculator settings.
 * Returns { ok: true, values, result }
 *      or { ok: false, problems: [{ key, kind: 'missing' | 'invalid', text }], onlyMissingInputs }.
 * `onlyMissingInputs` means nothing is wrong yet, the person just hasn't typed both prices.
 */
export function evaluate(inputs, calc) {
  const problems = [];
  const values = { currency: calc.currency === 'EUR' ? 'EUR' : 'USD' };
  const take = (key, raw) => {
    const r = readField(key, raw);
    if (r.problem) problems.push(r.problem);
    else values[key] = r.value;
  };
  take('displayedPrice', inputs.displayedPrice);
  take('sellPrice', inputs.sellPrice);
  take('usdtPrice', calc.usdtPrice);
  take('creditPrice', calc.creditPrice);
  if (values.currency === 'EUR') take('eurUsdRate', calc.eurUsdRate);
  else values.eurUsdRate = 1; // unused for USD

  if (problems.length) {
    const inputKeys = ['displayedPrice', 'sellPrice'];
    const onlyMissingInputs = problems.every((p) => p.kind === 'missing' && inputKeys.includes(p.key));
    return { ok: false, problems, onlyMissingInputs };
  }
  return { ok: true, values, result: compute(values) };
}

/** Coerce stored/imported calculator settings into a complete, valid object. */
export function cleanCalc(raw) {
  const out = { ...DEFAULT_CALC };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['usdtPrice', 'creditPrice', 'eurUsdRate', 'rateAt', 'rateSource']) {
    if (typeof raw[key] === 'string') out[key] = raw[key].slice(0, 40);
  }
  if (raw.currency === 'USD' || raw.currency === 'EUR') out.currency = raw.currency;
  if (typeof raw.rateManual === 'boolean') out.rateManual = raw.rateManual;
  return out;
}
