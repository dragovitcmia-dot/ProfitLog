// Calc: profit and margin on a card you resell (card price in EUR -> cost in TND -> sell price in TND),
// with a one-tap hand-off into the Log sale sheet. Rates (USDT price, credit price, EUR/USD) live in
// store.settings.calc and are saved silently while typing, so the screen is not rebuilt under the cursor.
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { moneyEl, screenHead, segmented, statTile } from '../ui/components.js';
import { openSaleForm } from '../ui/saleform.js';
import { store } from '../data/store.js';
import { pullLiveRate } from '../data/rates.js';
import { evaluate, fmt, fmtSigned, trimNum, usdPerEur, profitToMillimes } from '../core/calc.js';

// What was typed survives the screen being rebuilt (e.g. after logging a sale).
const typed = { displayedPrice: '', sellPrice: '' };
let pulling = false;
let pullError = '';
let autoPulled = false;
let live = null; // hooks into the mounted screen, so an async pull can update it

const INPUT_KEYS = ['displayedPrice', 'sellPrice'];

function formatPulled(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString();
  }
}

function saveCalc(patch, opts) {
  store.saveSettings({ calc: { ...store.settings.calc, ...patch } }, opts);
}

async function doPull() {
  if (pulling) return;
  pulling = true;
  pullError = '';
  live?.refreshRates();
  try {
    const { rate, source } = await pullLiveRate();
    saveCalc({ eurUsdRate: rate.toFixed(4), rateAt: new Date().toISOString(), rateSource: source, rateManual: false }, { silent: true });
  } catch (reasons) {
    const list = Array.isArray(reasons) ? reasons.join('; ') : String(reasons?.message || reasons);
    pullError = `Couldn’t pull the live rate (${list}). Keeping ${store.settings.calc.eurUsdRate}.`;
  }
  pulling = false;
  live?.refreshRates();
  live?.update();
}

export function renderCalc(root) {
  root.append(screenHead('Calculator', { subtitle: 'Profit and margin on a card' }));

  // ---- inputs ----
  const amountInput = (key, label, unit, placeholder) => {
    const input = h('input.input', {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      placeholder,
      'aria-label': `${label} in ${unit}`,
      value: typed[key],
      oninput: () => {
        typed[key] = input.value;
        update();
      },
      onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), input.blur()),
    });
    return { input, field: h('label.field', h('span.field-label', `${label} · ${unit}`), input) };
  };
  const price = amountInput('displayedPrice', 'Card price', 'EUR', '18.84');
  const sell = amountInput('sellPrice', 'Sell price', 'TND', '80');
  root.append(h('section.card.calc-inputs', h('div.grid-2', price.field, sell.field)));

  // ---- result ----
  const resultEl = h('section.card.calc-result', { 'aria-live': 'polite', 'aria-label': 'Result' });
  root.append(resultEl);

  // ---- rates ----
  const ratesField = (key, label, unit, placeholder) => {
    const input = h('input.input', {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      placeholder,
      'aria-label': `${label}, ${unit}`,
      value: store.settings.calc[key],
      oninput: () => {
        saveCalc(key === 'eurUsdRate' ? { [key]: input.value, rateManual: true } : { [key]: input.value }, { silent: true });
        if (key === 'eurUsdRate') pullError = '';
        refreshRates();
        update();
      },
      onkeydown: (e) => e.key === 'Enter' && (e.preventDefault(), input.blur()),
    });
    return { input, field: h('label.field', h('span.field-label', `${label} · ${unit}`), input) };
  };
  const usdt = ratesField('usdtPrice', 'USDT price', 'TND per 1 USDT', '3.38');
  const credit = ratesField('creditPrice', 'Credit price', 'paid for 100 EUR of balance', '113');
  const rate = ratesField('eurUsdRate', 'EUR/USD rate', '1 EUR in USD', '1.0800');
  const currency = h('div.field', h('span.field-label', 'Credit price currency'));
  currency.append(segmented(
    [{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }],
    store.settings.calc.currency,
    (value) => saveCalc({ currency: value }), // not silent: rebuilds this screen, typed values are kept
    { label: 'Credit price currency' },
  ));
  const pullBtn = h('button.btn.btn-secondary', { type: 'button', onclick: () => doPull() }, icon('refresh', 18), 'Pull live');
  const rateHint = h('p.field-hint');
  const rateStatus = h('p.field-hint', { role: 'status' });
  const rateError = h('p.field-err', { role: 'status' });
  const rateGroup = h('div.rate-group', rate.field, h('div.rate-actions', pullBtn), rateHint, rateStatus, rateError);
  const summary = h('p.muted.small.calc-summary');
  root.append(h('section.card.settings-card.calc-rates',
    h('h2.card-title', 'Rates'),
    usdt.field, credit.field, currency, rateGroup, summary));

  function refreshRates() {
    const c = store.settings.calc;
    const eur = c.currency === 'EUR';
    if (document.activeElement !== rate.input) rate.input.value = c.eurUsdRate;
    rateGroup.classList.toggle('is-unused', !eur);
    rateHint.textContent = eur ? 'Used to turn your EUR credit price into USD.' : 'Not used while the credit price is in USD.';
    const when = c.rateAt ? formatPulled(c.rateAt) : '';
    rateStatus.textContent = pulling
      ? 'Pulling live rate…'
      : c.rateManual
        ? `Manual value${when ? ` · last live pull ${when}` : ''}.`
        : when
          ? `Live rate pulled ${when}${c.rateSource ? ` (${c.rateSource})` : ''}.`
          : 'Not pulled yet. This is the default value.';
    rateError.textContent = pullError;
    pullBtn.disabled = pulling;
    pullBtn.lastChild.nodeValue = pulling ? 'Pulling…' : 'Pull live';
  }

  // ---- compute + render ----
  const fieldFor = { displayedPrice: price.input, sellPrice: sell.input, usdtPrice: usdt.input, creditPrice: credit.input, eurUsdRate: rate.input };

  function update() {
    const c = store.settings.calc;
    const ev = evaluate(typed, c);
    const bad = new Map((ev.ok ? [] : ev.problems).map((p) => [p.key, p.kind]));
    for (const [key, el] of Object.entries(fieldFor)) {
      // empty price boxes are not "wrong" yet, only non-numbers and non-positive values are
      const flagged = bad.has(key) && (bad.get(key) === 'invalid' || !INPUT_KEYS.includes(key));
      if (flagged) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }

    if (!ev.ok) {
      resultEl.replaceChildren(ev.onlyMissingInputs
        ? h('p.calc-hint', 'Enter the card price and your sell price to see your profit.')
        : problemList(ev.problems));
      summary.textContent = '';
      return;
    }
    const { values: v, result: r } = ev;
    const millimes = profitToMillimes(r.profitTND);
    resultEl.replaceChildren(
      h('div.calc-profit', h('span.field-label', 'Profit'), moneyEl(millimes, { unit: true, cls: 'money-xl' })),
      h('div.grid-2',
        statTile('Margin on cost', `${fmt(r.marginOnCost, 1)}%`),
        statTile('Margin on sale', `${fmt(r.marginOnSale, 1)}%`)),
      chain([`${fmt(v.displayedPrice)} EUR`, `${fmt(r.costUSDT)} USDT`, `${fmt(r.costTND)} TND`]),
      h('dl.calc-rows',
        calcRow('Cost', `${fmt(r.costTND)} TND`),
        calcRow('Cost in USDT', `${fmt(r.costUSDT)} USDT`),
        calcRow('Profit in USDT', `${fmtSigned(r.profitUSDT)} USDT`),
        calcRow('Break-even price', `${fmt(r.breakEven)} TND`)),
      h('div.section-title', h('h2', 'Suggested sell price'), h('span.muted.small', 'margin on cost')),
      h('ul.calc-suggest', ...r.suggested.map((s) =>
        h('li', h('span.pct', `${s.margin}%`), h('span', h('span.price', `${fmt(s.price)} TND`), h('span.gain', `+${fmt(s.profit)}`))))),
      h('button.btn.btn-primary.btn-xl', {
        type: 'button',
        onclick: () => openSaleForm({
          returnHome: false,
          prefill: { profit: millimes, note: `${fmt(v.displayedPrice)} EUR card, sold ${fmt(v.sellPrice)} TND` },
        }),
      }, icon('plus', 22), 'Log this sale'),
    );
    const perEur = usdPerEur(v.creditPrice, v.currency, v.eurUsdRate);
    const credit100 = v.currency === 'EUR'
      ? `${trimNum(v.creditPrice, 4)} EUR (= ${trimNum(v.creditPrice * v.eurUsdRate, 4)} USD at ${trimNum(v.eurUsdRate, 4)})`
      : `${trimNum(v.creditPrice, 4)} USD`;
    summary.textContent = `1 USDT = ${trimNum(v.usdtPrice, 4)} TND · 100 EUR of credit costs ${credit100}. `
      + `1 EUR of platform balance = ${fmt(perEur, 4)} USDT = ${fmt(perEur * v.usdtPrice)} TND.`;
  }

  live = { update, refreshRates };
  refreshRates();
  update();

  // refresh the rate when the Calc tab is first opened, but never overwrite a hand-typed one
  if (!autoPulled && !store.settings.calc.rateManual) {
    autoPulled = true;
    doPull();
  }
}

function problemList(problems) {
  const anyInvalid = problems.some((p) => p.kind === 'invalid');
  return h('div.calc-msg', { class: anyInvalid ? 'is-error' : '' },
    h('p.calc-msg-title', anyInvalid ? 'Check these values:' : 'Can’t calculate yet:'),
    h('ul', ...problems.map((p) => h('li', p.text))));
}

function chain(steps) {
  const p = h('p.calc-chain');
  steps.forEach((step, i) => {
    if (i) p.append(' → ');
    p.append(h('span.step', step)); // each step is nowrap so a narrow screen breaks at the arrows
  });
  return p;
}

const calcRow = (label, value) => h('div', h('dt', label), h('dd', value));
