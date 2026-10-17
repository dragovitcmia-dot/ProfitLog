import { wallToTs } from '../js/core/dates.js';

let n = 0;
/** Build a sale at a Tunis wall-clock time. profit is in TND for readability (converted to millimes). */
export function sale(dateStr, timeStr, profitTnd, extra = {}) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = (timeStr || '12:00').split(':').map(Number);
  return {
    id: extra.id ?? `t${++n}`,
    ts: wallToTs(y, m, d, h, mi),
    profit: Math.round(profitTnd * 1000),
    tag: extra.tag ?? null,
    note: extra.note ?? '',
    createdAt: 0,
    updatedAt: 0,
  };
}
