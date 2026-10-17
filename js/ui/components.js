// Small reusable UI pieces shared by the views.
import { h, svg } from './dom.js';
import { icon } from './icons.js';
import { moneyParts, formatMoney } from '../core/money.js';
import { fmtTime, fmtDayFull, dayKey } from '../core/dates.js';
import { store } from '../data/store.js';

// ---- platform tags: colored initials, no logos ----

export const TAG_COLORS = ['#0e8f6e', '#e2702a', '#3f6df0', '#cc3f78', '#7b52d8', '#c28a0c', '#1f93b5', '#6b8a1f', '#5f6f68'];
export const UNTAGGED_COLOR = '#8a958f';

export function tagColor(tag) {
  if (!tag) return UNTAGGED_COLOR;
  const i = store.settings.tags.indexOf(tag);
  if (i !== -1) return TAG_COLORS[i % TAG_COLORS.length];
  let hash = 0;
  for (const ch of tag) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

export function initials(tag) {
  if (!tag) return '–';
  const words = tag.trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  const caps = tag.match(/[A-Z]/g);
  if (caps && caps.length >= 2) return caps.slice(0, 2).join('');
  return tag[0].toUpperCase();
}

export function tagBadge(tag, size = 40) {
  return h('span.badge', { style: { '--c': tagColor(tag), '--s': size + 'px' }, 'aria-hidden': 'true' }, initials(tag));
}

// ---- money ----

export function moneyEl(millimes, { sign = false, unit = false, cls = '', tone = true } = {}) {
  const { neg, int, dec } = moneyParts(millimes);
  const r = Math.round(millimes) || 0;
  const el = h(
    `span.money`,
    { class: `${tone ? (r > 0 ? 'pos' : r < 0 ? 'neg' : 'zero') : ''} ${cls}`.trim() },
    (neg ? '−' : sign && r > 0 ? '+' : '') + int,
    h('span.dec', '.' + dec),
    unit && h('span.unit', ' TND'),
  );
  el.dataset.value = String(r);
  return el;
}

/** Rewrite a .money element in place (used by the count-up animation). */
export function setMoney(el, millimes, { sign = false } = {}) {
  const { neg, int, dec } = moneyParts(millimes);
  const r = Math.round(millimes) || 0;
  el.firstChild.nodeValue = (neg ? '−' : sign && r > 0 ? '+' : '') + int;
  el.querySelector('.dec').textContent = '.' + dec;
}

export function countUp(el, from, to, { sign = false, duration = 520 } = {}) {
  if (from === to || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    setMoney(el, from + (to - from) * eased, { sign });
    if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    else setMoney(el, to, { sign });
  };
  requestAnimationFrame(tick);
}

export function pctPill(pct, { digits = 0 } = {}) {
  if (pct === null || pct === undefined) return h('span.pill.pill-flat', 'new');
  const up = pct > 0.05;
  const down = pct < -0.05;
  const text = `${up ? '+' : down ? '−' : ''}${Math.abs(pct).toFixed(digits)}%`;
  return h(`span.pill.${up ? 'pill-up' : down ? 'pill-down' : 'pill-flat'}`, icon(up ? 'up' : down ? 'downtrend' : 'minus', 14), text);
}

// ---- rows ----

export function saleRow(sale, { onOpen, showDate = false, today } = {}) {
  const sub = [showDate ? fmtDayFull(dayKey(sale.ts), today) : null, fmtTime(sale.ts)].filter(Boolean).join(' · ');
  return h(
    'button.row',
    {
      type: 'button',
      onclick: () => onOpen?.(sale),
      'aria-label': `${sale.tag || 'Sale'}, ${formatMoney(sale.profit, { sign: true })} TND at ${fmtTime(sale.ts)}${sale.note ? ', ' + sale.note : ''}. Tap to edit.`,
    },
    tagBadge(sale.tag),
    h('span.row-main', h('span.row-title', sale.tag || 'No platform'), h('span.row-sub', sub, sale.note && h('span.row-note', ' · ' + sale.note))),
    moneyEl(sale.profit, { sign: true, cls: 'row-amount' }),
  );
}

// ---- misc ----

export function segmented(options, value, onChange, { label = '', cls = '' } = {}) {
  const el = h('div.seg', { role: 'radiogroup', 'aria-label': label, class: cls });
  for (const o of options) {
    el.append(
      h('button.seg-btn', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(o.value === value),
        onclick: () => o.value !== value && onChange(o.value),
      }, o.icon && icon(o.icon, 18), o.label),
    );
  }
  return el;
}

export function banner({ kind = 'info', iconName = 'info', title, text, actions = [] }) {
  return h(
    `div.banner.banner-${kind}`,
    { role: kind === 'warn' ? 'alert' : 'status' },
    icon(iconName, 22),
    h('div.banner-body', h('strong', title), text && h('p', text), actions.length > 0 && h('div.banner-actions', ...actions.map((a) =>
      h('button.btn.btn-sm', { type: 'button', class: a.primary ? 'btn-primary' : 'btn-ghost', onclick: a.onClick }, a.label)))),
  );
}

export function emptyState({ title, text, actionLabel, onAction, secondaryLabel, onSecondary }) {
  return h(
    'div.empty',
    emptyArt(),
    h('h3', title),
    h('p', text),
    actionLabel && h('button.btn.btn-primary', { type: 'button', onclick: onAction }, icon('plus', 20), actionLabel),
    secondaryLabel && h('button.btn.btn-ghost', { type: 'button', onclick: onSecondary }, secondaryLabel),
  );
}

function emptyArt() {
  const s = svg('svg', { viewBox: '0 0 120 90', width: 120, height: 90, 'aria-hidden': 'true', class: 'empty-art' });
  s.innerHTML =
    '<rect x="10" y="38" width="16" height="40" rx="5" class="a1"/><rect x="34" y="24" width="16" height="54" rx="5" class="a2"/>' +
    '<rect x="58" y="46" width="16" height="32" rx="5" class="a1"/><rect x="82" y="14" width="16" height="64" rx="5" class="a2"/>' +
    '<circle cx="96" cy="14" r="11" class="a3"/><path d="M96 9v10M92 12.5h6.5a2.5 2.5 0 0 1 0 5H92" class="a4"/>';
  return s;
}

export function screenHead(title, { subtitle, right } = {}) {
  return h('header.screen-head', h('div', h('h1.title', title), subtitle && h('p.subtitle', subtitle)), right);
}

export function sectionTitle(text, right) {
  return h('div.section-title', h('h2', text), right);
}

export function statTile(label, valueNode, sub) {
  return h('div.stat', h('span.stat-label', label), h('div.stat-value', valueNode), sub && h('span.stat-sub', sub));
}
