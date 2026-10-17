// The "Log sale" sheet. One required field (profit); everything else is optional.
// The same sheet edits an existing sale.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openModal, closeModal, sheetHeader, confirmDialog } from './modal.js';
import { showToast } from './toast.js';
import { tagBadge } from './components.js';
import { navigate, parseRoute } from './router.js';
import { store } from '../data/store.js';
import { parseMoney, formatMoney, toInputValue } from '../core/money.js';
import { toDatetimeLocal, fromDatetimeLocal, wallToTs, KEY_RE, todayKey, fmtDayFull, dayKey } from '../core/dates.js';
import { MAX_NOTE } from '../core/io.js';

/** Sanitise what is typed in the amount field: digits, one '.', max 3 decimals. */
export function cleanAmountText(raw) {
  let s = String(raw).replace(',', '.').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 3);
  return s.replace(/^0+(?=\d)/, '').slice(0, 14);
}

/**
 * openSaleForm({ sale })            edit an existing sale
 * openSaleForm({ day: 'YYYY-MM-DD' }) add a sale on a given (past) day
 * openSaleForm({ returnHome: false }) stay on the current screen after adding
 */
export function openSaleForm({ sale = null, day = null, returnHome = true, focusDate = false } = {}) {
  const editing = !!sale;
  let neg = editing ? sale.profit < 0 : false;
  let tag = editing ? sale.tag : null;
  let timeDirty = editing || !!day || focusDate;
  let modal;

  const amount = h('input.amount-input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    autocapitalize: 'off',
    enterkeyhint: 'done',
    placeholder: '0.000',
    'aria-label': 'Profit in TND',
    'aria-describedby': 'amount-err',
    value: editing ? toInputValue(Math.abs(sale.profit)) : '',
    oninput: () => {
      const typedMinus = amount.value.trim().startsWith('-') || amount.value.includes('−');
      if (typedMinus) setNeg(true);
      const cleaned = cleanAmountText(amount.value);
      if (cleaned !== amount.value) amount.value = cleaned;
      setError('');
    },
    onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), submit(false)),
  });

  const signBtn = h('button.sign-btn', {
    type: 'button',
    'aria-label': 'Toggle loss',
    'aria-pressed': String(neg),
    onclick: () => {
      setNeg(!neg);
      amount.focus();
    },
  }, icon('minus', 22));

  const err = h('p.field-err', { id: 'amount-err', role: 'alert', 'aria-live': 'assertive' });
  const amountBox = h('div.amount-box', signBtn, amount, h('span.amount-unit', 'TND'));

  function setNeg(v) {
    neg = v;
    signBtn.setAttribute('aria-pressed', String(neg));
    amountBox.classList.toggle('is-loss', neg);
    signBtn.title = neg ? 'Loss (tap to switch to profit)' : 'Tap if this sale was a loss';
  }
  setNeg(neg);

  function setError(msg) {
    err.textContent = msg;
    amountBox.classList.toggle('has-error', !!msg);
  }

  // ---- date & time ----
  const initialTs = editing ? sale.ts : day ? wallToTs(...KEY_RE.exec(day).slice(1).map(Number), 12, 0) : Date.now();
  const endOfToday = () => {
    const [y, m, d] = KEY_RE.exec(todayKey()).slice(1).map(Number);
    return wallToTs(y, m, d, 23, 59);
  };
  const dt = h('input.input.dt-input', {
    type: 'datetime-local',
    value: toDatetimeLocal(initialTs),
    max: toDatetimeLocal(endOfToday()),
    'aria-label': 'Date and time (Tunis)',
    onchange: () => {
      timeDirty = true;
      refreshDtHint();
    },
  });
  const dtHint = h('span.field-hint');
  function refreshDtHint() {
    const ts = fromDatetimeLocal(dt.value);
    dtHint.textContent = ts ? fmtDayFull(dayKey(ts)) + ' · Tunis time' : 'Pick a valid date';
  }
  refreshDtHint();
  const nowBtn = h('button.chip.chip-sm', {
    type: 'button',
    onclick: () => {
      dt.value = toDatetimeLocal(Date.now());
      timeDirty = false;
      refreshDtHint();
    },
  }, 'Now');

  // ---- extras ----
  const note = h('input.input', {
    type: 'text',
    maxlength: MAX_NOTE,
    placeholder: 'Note (optional), e.g. customer name',
    'aria-label': 'Note',
    value: editing ? sale.note : '',
    enterkeyhint: 'done',
    onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), submit(false)),
  });
  const chipsEl = h('div.chips', { role: 'group', 'aria-label': 'Platform' });
  function renderChips() {
    chipsEl.replaceChildren();
    const tags = [...store.settings.tags];
    if (tag && !tags.includes(tag)) tags.push(tag);
    for (const t of tags) {
      chipsEl.append(
        h('button.chip', {
          type: 'button',
          'aria-pressed': String(tag === t),
          onclick: () => {
            tag = tag === t ? null : t;
            renderChips();
          },
        }, tagBadge(t, 26), t),
      );
    }
  }
  renderChips();

  const hasExtras = editing && (sale.tag || sale.note);
  const extras = h('div.extras', { id: 'extras', hidden: !hasExtras }, chipsEl, note);
  const toggle = h('button.disclosure', {
    type: 'button',
    'aria-expanded': String(!!hasExtras),
    'aria-controls': 'extras',
    onclick: () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      extras.hidden = !open;
    },
  }, icon('tag', 20), h('span', 'Platform & note'), icon('down', 20, { class: 'icon chev' }));

  // ---- actions ----
  const addBtn = h('button.btn.btn-primary.btn-xl', { type: 'button', onclick: () => submit(false) }, editing ? 'Save' : 'Add');
  const anotherBtn = !editing && h('button.btn.btn-secondary.btn-xl', { type: 'button', onclick: () => submit(true) }, 'Add & log another');
  const delBtn = editing && h('button.btn.btn-danger-ghost.btn-xl', { type: 'button', onclick: () => remove() }, icon('trash', 20), 'Delete');

  function readForm() {
    const parsed = parseMoney((neg ? '-' : '') + amount.value);
    if (!parsed.ok) {
      setError(parsed.error === 'Enter an amount' ? 'Enter the profit, e.g. 12.500' : parsed.error);
      amount.focus();
      amountBox.classList.remove('shake');
      void amountBox.offsetWidth;
      amountBox.classList.add('shake');
      return null;
    }
    let ts;
    if (editing || timeDirty) {
      ts = fromDatetimeLocal(dt.value);
      if (ts === null) {
        setError('Pick a valid date and time');
        return null;
      }
      if (ts > endOfToday()) {
        setError("That date is in the future. Pick today or earlier.");
        return null;
      }
    } else ts = Date.now();
    return { profit: parsed.value, ts, tag, note: note.value };
  }

  async function submit(another) {
    const data = readForm();
    if (!data) return;
    if (editing) {
      const { before } = store.updateSale(sale.id, data);
      await modal.close();
      showToast(`Saved ${formatMoney(data.profit, { sign: true })} TND`, { actionLabel: 'Undo', onAction: () => store.restoreSales([before]) });
      return;
    }
    const added = store.addSale(data);
    const msg = `Added ${formatMoney(added.profit, { sign: true })} TND`;
    const undo = { actionLabel: 'Undo', onAction: () => store.deleteSale(added.id) };
    if (another) {
      showToast(msg, undo);
      amount.value = '';
      note.value = '';
      tag = null;
      renderChips();
      setNeg(false);
      timeDirty = false;
      dt.value = toDatetimeLocal(Date.now());
      refreshDtHint();
      setError('');
      amount.focus();
      return;
    }
    await modal.close();
    if (returnHome && parseRoute().tab !== 'home') navigate('home', { replace: true });
    showToast(msg, undo);
  }

  async function remove() {
    const ok = await confirmDialog({
      title: 'Delete this sale?',
      message: `${formatMoney(sale.profit, { sign: true })} TND on ${fmtDayFull(dayKey(sale.ts))}. You can undo right after.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const removed = store.deleteSale(sale.id);
    await modal.close();
    showToast('Sale deleted', { actionLabel: 'Undo', onAction: () => store.restoreSales([removed]), kind: 'info' });
  }

  const title = editing ? 'Edit sale' : day || focusDate ? 'Add a past sale' : 'Log sale';
  const top = h('div.sheet-top', h('label.field', h('span.field-label', 'Profit'), amountBox), err);
  const body = h(
    'div.sheet-body',
    h('div.field', h('div.field-row', h('span.field-label', 'Date & time'), nowBtn), dt, dtHint),
    toggle,
    extras,
  );
  const footer = h('footer.sheet-foot', addBtn, anotherBtn, delBtn);
  const content = h('div.sheet-inner', sheetHeader(title, () => modal), top, body, footer);
  modal = openModal(content, { kind: 'sheet', label: title });

  // Focus synchronously inside the tap handler: mobile browsers only open the
  // numeric keypad for a focus() that happens in a user gesture.
  amount.focus({ preventScroll: true });
  return modal;
}
