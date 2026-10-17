import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, toInputValue, toCsvAmount, pctChange, formatPct, moneyParts } from '../js/core/money.js';

const ok = (s) => {
  const r = parseMoney(s);
  assert.ok(r.ok, `${s} should parse (${r.error})`);
  return r.value;
};

test('parses to integer millimes', () => {
  assert.equal(ok('12'), 12000);
  assert.equal(ok('12.5'), 12500);
  assert.equal(ok('12,5'), 12500);
  assert.equal(ok('0.001'), 1);
  assert.equal(ok('.5'), 500);
  assert.equal(ok('5.'), 5000);
  assert.equal(ok('-3.250'), -3250);
  assert.equal(ok('−3'), -3000); // unicode minus
  assert.equal(ok('+4'), 4000);
  assert.equal(ok('1 234,5'), 1234500);
  assert.equal(ok('1,234.50'), 1234500);
  assert.equal(ok('1.234,50'), 1234500);
  assert.equal(ok('1,234,567'), 1234567000);
  assert.equal(ok('12.5 TND'), 12500);
});

test('avoids floating point errors', () => {
  assert.equal(ok('0.1') + ok('0.2'), 300);
  assert.equal(ok('1.005'), 1005);
  assert.equal(ok('19.999'), 19999);
  assert.equal(ok('-0'), 0);
  assert.ok(Object.is(ok('-0'), 0));
});

test('rejects bad input', () => {
  for (const bad of ['', '   ', 'abc', '1.2345', '--3', '1..2', '-', '.', '1e5', '12.5.5,3', '9999999999']) {
    assert.equal(parseMoney(bad).ok, false, `"${bad}" should be rejected`);
  }
  assert.match(parseMoney('1.2345').error, /3 decimals/);
});

test('formats with 3 decimals and rounds only for display', () => {
  assert.equal(formatMoney(12500), '12.500');
  assert.equal(formatMoney(0), '0.000');
  assert.equal(formatMoney(-3250), '−3.250');
  assert.equal(formatMoney(1234567), '1 234.567');
  assert.equal(formatMoney(12500, { sign: true }), '+12.500');
  assert.equal(formatMoney(12500, { unit: true }), '12.500 TND');
  assert.equal(formatMoney(1234.5), '1.235'); // fractional millimes (an average) are rounded here
  assert.equal(formatMoney(-0.4), '0.000'); // no "-0.000"
  assert.deepEqual(moneyParts(-1500), { neg: true, int: '1', dec: '500' });
});

test('input / csv helpers', () => {
  assert.equal(toInputValue(12500), '12.5');
  assert.equal(toInputValue(12000), '12');
  assert.equal(toInputValue(-250), '-0.25');
  assert.equal(toCsvAmount(12500), '12.500');
  assert.equal(toCsvAmount(-250, ','), '-0,250');
});

test('percent change', () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(50, 100), -50);
  assert.equal(pctChange(10, 0), null);
  assert.equal(pctChange(-50, -100), 50); // loss shrank by half = improvement
  assert.equal(formatPct(12.34), '+12%');
  assert.equal(formatPct(-12.34, 1), '−12.3%');
  assert.equal(formatPct(null), '—');
});
