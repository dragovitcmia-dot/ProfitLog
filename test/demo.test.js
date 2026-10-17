import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo } from '../js/core/demo.js';
import { DEFAULT_TAGS, validateSale } from '../js/core/io.js';
import { dayKey, addDays } from '../js/core/dates.js';
import { projection, groupByDay } from '../js/core/stats.js';

const NOW = Date.UTC(2026, 9, 17, 14, 0);

test('demo data: about 40 valid sales, all flagged, none in the future', () => {
  const d = generateDemo({ now: NOW, tags: DEFAULT_TAGS });
  assert.equal(d.length, 40);
  assert.ok(d.every((s) => s.demo === true));
  assert.ok(d.every((s) => validateSale(s).ok));
  assert.ok(d.every((s) => s.ts <= NOW));
  assert.equal(new Set(d.map((s) => s.id)).size, 40);
  assert.ok(d.some((s) => s.profit < 0));
  const today = dayKey(NOW);
  assert.ok(d.every((s) => dayKey(s.ts) >= addDays(today, -23)));
});

test('demo data is deterministic and gives a meaningful projection', () => {
  const a = generateDemo({ now: NOW, tags: DEFAULT_TAGS });
  const b = generateDemo({ now: NOW, tags: DEFAULT_TAGS });
  assert.deepEqual(a, b);
  const p = projection(a, { today: dayKey(NOW) });
  assert.equal(p.enough, true);
  assert.ok(groupByDay(a).length > 10);
});
