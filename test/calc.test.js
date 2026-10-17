import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber, compute, evaluate, profitToMillimes, fmt, fmtSigned, trimNum, cleanCalc, DEFAULT_CALC,
} from '../js/core/calc.js';
import { pullLiveRate } from '../js/data/rates.js';
import { buildBackup, parseBackup, backupToJSON } from '../js/core/io.js';
import { defaultSettings } from '../js/data/store.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('parseNumber accepts the usual ways of typing a decimal', () => {
  const ok = [['18.84', 18.84], ['18,84', 18.84], [' 3 ', 3], ['1 234,5', 1234.5], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['.5', 0.5], ['5.', 5], ['٣٫٣٨', 3.38]];
  for (const [input, want] of ok) {
    const r = parseNumber(input);
    assert.equal(r.state, 'ok', input);
    near(r.value, want, 1e-9);
  }
  for (const bad of ['abc', '1e3', '1.2.3', '-5', '12a', '--']) assert.equal(parseNumber(bad).state, 'invalid', bad);
  for (const empty of ['', '   ', null, undefined]) assert.equal(parseNumber(empty).state, 'empty');
});

test('compute: cost chain and profit (USD credit price)', () => {
  const r = compute({ displayedPrice: 18.84, sellPrice: 80, usdtPrice: 3.38, creditPrice: 113, currency: 'USD', eurUsdRate: 1 });
  near(r.costUSDT, 21.2892, 1e-9);
  near(r.costTND, 71.957496);
  near(r.profitTND, 8.042504);
  near(r.marginOnCost, (8.042504 / 71.957496) * 100);
  near(r.marginOnSale, (8.042504 / 80) * 100);
  near(r.profitUSDT, 8.042504 / 3.38);
  assert.deepEqual(r.suggested.map((s) => s.margin), [10, 15, 20]);
  near(r.suggested[0].price, 71.957496 * 1.1);
  near(r.suggested[2].profit, 71.957496 * 0.2);
});

test('compute: a EUR credit price goes through the EUR/USD rate', () => {
  const r = compute({ displayedPrice: 10, sellPrice: 45, usdtPrice: 3.38, creditPrice: 100, currency: 'EUR', eurUsdRate: 1.13 });
  near(r.usdPer100Credit, 113, 1e-9);
});

test('profit is logged as integer millimes (rounded, never fractional)', () => {
  assert.equal(profitToMillimes(8.042504), 8043);
  assert.equal(profitToMillimes(-3.2504), -3250);
  assert.equal(profitToMillimes(0), 0);
  assert.equal(profitToMillimes(-0.0001), 0); // no "-0"
  assert.ok(Object.is(profitToMillimes(-0.0001), 0));
});

test('formatting never shows -0.00 and signs positives', () => {
  assert.equal(fmt(-0.001), '0.00');
  assert.equal(fmt(Infinity), '-');
  assert.equal(fmtSigned(8.042), '+8.04');
  assert.equal(fmtSigned(-8.042), '-8.04');
  assert.equal(fmtSigned(0.001), '0.00');
  assert.equal(trimNum(3.38, 4), '3.38');
  assert.equal(trimNum(113, 4), '113');
});

test('evaluate: waits quietly for both prices, then flags real problems', () => {
  const calc = { ...DEFAULT_CALC };
  let ev = evaluate({ displayedPrice: '', sellPrice: '' }, calc);
  assert.equal(ev.ok, false);
  assert.equal(ev.onlyMissingInputs, true);

  ev = evaluate({ displayedPrice: '18.84', sellPrice: '' }, calc);
  assert.equal(ev.onlyMissingInputs, true);
  assert.deepEqual(ev.problems.map((p) => p.key), ['sellPrice']);

  ev = evaluate({ displayedPrice: 'abc', sellPrice: '80' }, calc);
  assert.equal(ev.onlyMissingInputs, false);
  assert.equal(ev.problems[0].kind, 'invalid');

  ev = evaluate({ displayedPrice: '0', sellPrice: '80' }, calc);
  assert.match(ev.problems[0].text, /greater than 0/);

  ev = evaluate({ displayedPrice: '18.84', sellPrice: '80' }, { ...calc, usdtPrice: '' });
  assert.equal(ev.onlyMissingInputs, false, 'a missing rate is not "still typing"');

  ev = evaluate({ displayedPrice: '18.84', sellPrice: '80' }, calc);
  assert.equal(ev.ok, true);
  near(ev.result.profitTND, 80 - 18.84 * 1.13 * 3.38);
});

test('evaluate: the EUR/USD rate only matters when the credit price is in EUR', () => {
  const usd = evaluate({ displayedPrice: '10', sellPrice: '50' }, { ...DEFAULT_CALC, currency: 'USD', eurUsdRate: 'junk' });
  assert.equal(usd.ok, true);
  const eur = evaluate({ displayedPrice: '10', sellPrice: '50' }, { ...DEFAULT_CALC, currency: 'EUR', eurUsdRate: 'junk' });
  assert.equal(eur.ok, false);
  assert.equal(eur.problems[0].key, 'eurUsdRate');
});

test('cleanCalc repairs stored settings', () => {
  assert.deepEqual(cleanCalc(undefined), DEFAULT_CALC);
  assert.deepEqual(cleanCalc('nope'), DEFAULT_CALC);
  const c = cleanCalc({ usdtPrice: '3.5', currency: 'GBP', rateManual: 'yes', creditPrice: 12, eurUsdRate: '1.1' });
  assert.equal(c.usdtPrice, '3.5');
  assert.equal(c.currency, 'USD');
  assert.equal(c.rateManual, false);
  assert.equal(c.creditPrice, DEFAULT_CALC.creditPrice);
  assert.equal(c.eurUsdRate, '1.1');
});

test('calculator rates travel in a JSON backup', () => {
  const calc = { ...DEFAULT_CALC, usdtPrice: '3.41', currency: 'EUR', eurUsdRate: '1.1650', rateManual: true };
  const settings = { ...defaultSettings(), calc };
  const back = parseBackup(backupToJSON({ sales: [], settings }));
  assert.equal(back.ok, true);
  assert.deepEqual(back.settings.calc, calc);
  // older backups without `calc` still import
  const old = buildBackup({ sales: [], settings });
  delete old.settings.calc;
  assert.equal(parseBackup(JSON.stringify(old)).settings.calc, undefined);
});

const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('pullLiveRate uses the first source that answers', async () => {
  const urls = [];
  const fetchImpl = async (url) => (urls.push(url), jsonRes({ rates: { USD: 1.1634 } }));
  assert.deepEqual(await pullLiveRate({ fetchImpl }), { rate: 1.1634, source: 'frankfurter.dev' });
  assert.equal(urls.length, 1);
});

test('pullLiveRate falls back to the second source', async () => {
  const fetchImpl = async (url) => (url.includes('frankfurter') ? jsonRes({}, false, 503) : jsonRes({ rates: { USD: 1.17 } }));
  assert.deepEqual(await pullLiveRate({ fetchImpl }), { rate: 1.17, source: 'open.er-api.com' });
});

test('pullLiveRate rejects with one reason per failed source', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('frankfurter')) throw new Error('offline');
    return jsonRes({ rates: { USD: 'x' } });
  };
  await assert.rejects(pullLiveRate({ fetchImpl }), (reasons) => {
    assert.deepEqual(reasons, ['frankfurter.dev: offline', 'open.er-api.com: unexpected response']);
    return true;
  });
});

test('pullLiveRate times out a hanging source', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(pullLiveRate({ fetchImpl, timeoutMs: 20 }), (reasons) => reasons.every((r) => r.endsWith('timed out')) && reasons.length === 2);
});
