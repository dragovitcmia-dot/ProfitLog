// Hand-drawn SVG charts (no library, works offline, themed via CSS variables).
import { h, svg } from './dom.js';
import { formatMoney } from '../core/money.js';

const SLOT = 48; // px per bar: a full thumb-sized tap target
const H = 210;
const PAD = { top: 16, bottom: 34, side: 10 };

/**
 * bars: [{ key, label, sublabel?, value, extra? }]
 * Scrolls horizontally when there are many bars; starts scrolled to the newest.
 */
export function barChart(bars, { selectedKey = null, onSelect, ariaLabel = 'Bar chart' } = {}) {
  const wrap = h('div.chart-scroll');
  if (!bars.length) return wrap;
  const width = Math.max(bars.length * SLOT + PAD.side * 2, 280);
  const vals = bars.map((b) => b.value);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + ((max - v) / span) * plotH;
  const zero = y(0);

  const el = svg('svg', { viewBox: `0 0 ${width} ${H}`, width, height: H, role: 'img', 'aria-label': ariaLabel, class: selectedKey ? 'chart has-sel' : 'chart' });
  // grid: top value line + zero line
  el.append(svg('line', { x1: 0, x2: width, y1: zero, y2: zero, class: 'chart-zero' }));
  if (max > 0) el.append(svg('line', { x1: 0, x2: width, y1: y(max), y2: y(max), class: 'chart-grid' }));
  if (min < 0) el.append(svg('line', { x1: 0, x2: width, y1: y(min), y2: y(min), class: 'chart-grid' }));

  const every = bars.length > 14 ? (bars.length > 40 ? 3 : 2) : 1;
  bars.forEach((b, i) => {
    const x = PAD.side + i * SLOT;
    const bw = Math.min(26, SLOT - 12);
    const bx = x + (SLOT - bw) / 2;
    const top = b.value >= 0 ? y(b.value) : zero;
    const bh = Math.max(b.value === 0 ? 2 : 3, Math.abs(y(b.value) - zero));
    const selected = b.key === selectedKey;
    const g = svg('g', { class: `bar-g${selected ? ' sel' : ''}`, tabindex: '0', role: 'button', 'aria-label': `${b.label}: ${formatMoney(b.value, { sign: true })} TND, ${b.extra ?? ''}` });
    g.append(svg('rect', { x, y: 0, width: SLOT, height: H - PAD.bottom + 8, class: 'bar-hit' }));
    g.append(
      svg('rect', {
        x: bx,
        y: top,
        width: bw,
        height: bh,
        rx: 6,
        class: `bar ${b.value < 0 ? 'neg' : b.value === 0 ? 'zero' : 'pos'}`,
        style: { animationDelay: Math.min(i * 12, 360) + 'ms' },
      }),
    );
    if (i % every === 0) {
      g.append(svg('text', { x: x + SLOT / 2, y: H - 17, 'text-anchor': 'middle', class: 'chart-label' }, b.label));
      if (b.sublabel) g.append(svg('text', { x: x + SLOT / 2, y: H - 4, 'text-anchor': 'middle', class: 'chart-sublabel' }, b.sublabel));
    }
    const pick = () => onSelect?.(b);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
    el.append(g);
  });
  wrap.append(el);
  requestAnimationFrame(() => {
    // keep the selected bar in view, otherwise show the newest bars
    const idx = selectedKey ? bars.findIndex((b) => b.key === selectedKey) : bars.length - 1;
    wrap.scrollLeft = Math.max(0, PAD.side + idx * SLOT - wrap.clientWidth / 2 + SLOT / 2);
  });
  return wrap;
}

/** slices: [{ label, value (>0), color }]; center: node shown in the hole. */
export function donutChart(slices, { size = 168, thickness = 22, center } = {}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((t, s) => t + s.value, 0);
  const el = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Profit share by platform', class: 'donut' });
  el.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: 'donut-track', 'stroke-width': thickness, fill: 'none' }));
  let offset = 0;
  const gap = slices.length > 1 ? Math.min(3, c / 80) : 0;
  slices.forEach((s, i) => {
    const len = (s.value / total) * c;
    el.append(
      svg('circle', {
        cx: size / 2,
        cy: size / 2,
        r,
        fill: 'none',
        stroke: s.color,
        'stroke-width': thickness,
        'stroke-linecap': 'butt',
        'stroke-dasharray': `${Math.max(0, len - gap)} ${c}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        class: 'donut-slice',
        style: { animationDelay: i * 60 + 'ms' },
      }),
    );
    offset += len;
  });
  const box = h('div.donut-wrap', { style: { width: size + 'px', height: size + 'px' } }, el);
  if (center) box.append(h('div.donut-center', center));
  return box;
}
