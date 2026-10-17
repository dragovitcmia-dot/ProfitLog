// Deterministic demo data (about 40 sales over the last ~3 weeks).
// Every demo sale carries `demo: true` so it can be removed cleanly without
// touching real entries.

import { addDays, dayKey, wallToTs, KEY_RE } from './dates.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [min, max] profit in TND per platform
const RANGES = {
  Roblox: [2, 14],
  PlayStation: [4, 25],
  Apple: [3, 18],
  'Free Fire': [1.5, 9],
  Nintendo: [3, 15],
  Steam: [2, 12],
  Valorant: [2.5, 10],
  Xbox: [3, 16],
  Other: [1, 6],
};

const NOTES = ['regular customer', 'via Instagram', 'urgent order', 'bundle', 'new customer', 'refunded part', ''];

export const DEMO_COUNT = 40;
export const DEMO_DAYS = 24;

export function generateDemo({ now = Date.now(), tags = [] } = {}) {
  const rng = mulberry32(20261017);
  const today = dayKey(now);
  const pool = tags.length ? tags : [null];
  const sales = [];
  for (let k = 0; k < DEMO_COUNT; k++) {
    const back = Math.min(DEMO_DAYS - 1, Math.max(0, DEMO_DAYS - 1 - Math.floor((k * DEMO_DAYS) / DEMO_COUNT + rng() * 1.4)));
    const key = addDays(today, -back);
    const [y, m, d] = KEY_RE.exec(key).slice(1).map(Number);
    const minutes = 10 * 60 + Math.floor(rng() * 13.5 * 60);
    let ts = wallToTs(y, m, d, Math.floor(minutes / 60), minutes % 60);
    if (ts > now) ts = now - Math.floor(rng() * 50 + 1) * 60000;
    const tag = pool[Math.floor(rng() * pool.length)];
    const [lo, hi] = RANGES[tag] ?? [1, 12];
    let profit = Math.round(((lo + rng() * (hi - lo)) * 4)) * 250; // quarter-dinar steps
    if (k % 9 === 4) profit += 50 * (1 + Math.floor(rng() * 4)); // a few odd millimes
    if (k === 11) profit = -1500;
    if (k === 27) profit = -4250;
    const note = profit < 0 ? 'loss: wrong price' : NOTES[Math.floor(rng() * NOTES.length)];
    sales.push({
      id: `demo-${String(k + 1).padStart(2, '0')}`,
      ts,
      profit,
      tag: tag ?? null,
      note,
      createdAt: now,
      updatedAt: now,
      demo: true,
    });
  }
  return sales;
}
