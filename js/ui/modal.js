// Bottom sheets and centred dialogs. Each open modal takes one browser-history
// entry so the phone's Back button closes it instead of leaving the app.

import { h } from './dom.js';
import { icon } from './icons.js';

const stack = [];
const pendingPops = [];
let host = null;

function getHost() {
  if (!host) {
    host = h('div.modal-host');
    document.body.append(host);
  }
  return host;
}

window.addEventListener('popstate', () => {
  if (pendingPops.length) {
    pendingPops.shift()();
    return;
  }
  const top = stack[stack.length - 1];
  if (top) closeModal(top, { fromPop: true });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) closeModal(stack[stack.length - 1]);
});

function popHistory() {
  return new Promise((resolve) => {
    pendingPops.push(resolve);
    history.back();
    setTimeout(() => {
      const i = pendingPops.indexOf(resolve);
      if (i !== -1) {
        pendingPops.splice(i, 1);
        resolve();
      }
    }, 500);
  });
}

/**
 * kind: 'sheet' (slides up from the bottom) | 'dialog' (centred).
 * Returns the modal handle: { el, close(), closed }.
 */
export function openModal(content, { kind = 'sheet', onClose, label = '', dismissible = true } = {}) {
  const panel = h(`div.${kind}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, content);
  const backdrop = h('div.backdrop');
  const layer = h(`div.modal.modal-${kind}`, backdrop, panel);
  const modal = { el: panel, layer, closed: false, onClose, dismissible };
  modal.close = () => closeModal(modal);
  backdrop.addEventListener('click', () => modal.dismissible && modal.close());
  stack.push(modal);
  history.pushState({ plModal: stack.length }, '');
  getHost().append(layer);
  document.body.classList.add('modal-open');
  trackKeyboard();
  requestAnimationFrame(() => layer.classList.add('in'));
  return modal;
}

/** Closes a modal. Resolves once browser history is back in step (safe to navigate afterwards). */
export function closeModal(modal, { fromPop = false } = {}) {
  if (modal.closed) return Promise.resolve();
  modal.closed = true;
  const i = stack.indexOf(modal);
  if (i !== -1) stack.splice(i, 1);
  modal.layer.classList.remove('in');
  modal.layer.classList.add('out');
  setTimeout(() => modal.layer.remove(), 220);
  if (!stack.length) document.body.classList.remove('modal-open');
  modal.onClose?.();
  return fromPop ? Promise.resolve() : popHistory();
}

export function closeAllModals() {
  return Promise.all([...stack].map((m) => closeModal(m)));
}

export const hasOpenModal = () => stack.length > 0;

// Keep sheets above the on-screen keyboard (iOS doesn't resize the layout viewport).
let tracking = false;
function trackKeyboard() {
  const vv = window.visualViewport;
  if (tracking || !vv) return;
  tracking = true;
  const update = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', covered + 'px');
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

/** Standard sheet header with a title and a close button. */
export function sheetHeader(title, modalRef) {
  return h(
    'header.sheet-head',
    h('div.sheet-grab'),
    h('h2.sheet-title', title),
    h('button.icon-btn.sheet-close', { type: 'button', 'aria-label': 'Close', onclick: () => modalRef().close() }, icon('x')),
  );
}

/**
 * Centred confirmation dialog.
 *  requireText: user must type this exact word to enable the confirm button.
 *  extra: { label, run } secondary action (e.g. "Download a backup first").
 * Resolves true when confirmed, false when cancelled.
 */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, requireText = null, extra = null }) {
  return new Promise((resolve) => {
    let modal;
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      modal.close();
      resolve(value);
    };
    const confirmBtn = h('button.btn.btn-block', { type: 'button', class: danger ? 'btn-danger' : 'btn-primary', onclick: () => finish(true) }, confirmLabel);
    const body = [h('h2.dialog-title', title), h('p.dialog-text', ...(Array.isArray(message) ? message : [message]))];
    if (requireText) {
      confirmBtn.disabled = true;
      const input = h('input.input', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'characters',
        spellcheck: 'false',
        'aria-label': `Type ${requireText} to confirm`,
        placeholder: requireText,
        oninput: () => {
          confirmBtn.disabled = input.value.trim().toUpperCase() !== requireText.toUpperCase();
        },
      });
      body.push(h('label.field', h('span.field-label', `Type ${requireText} to confirm`), input));
    }
    let extraNote = null;
    if (extra) {
      extraNote = h('p.dialog-note', { 'aria-live': 'polite' });
      body.push(
        h('button.btn.btn-secondary.btn-block', {
          type: 'button',
          onclick: async (e) => {
            await extra.run();
            e.currentTarget.disabled = true;
            extraNote.textContent = extra.doneText || 'Done.';
          },
        }, icon('download', 20), extra.label),
        extraNote,
      );
    }
    body.push(
      h('div.dialog-actions', confirmBtn, h('button.btn.btn-ghost.btn-block', { type: 'button', onclick: () => finish(false) }, cancelLabel)),
    );
    modal = openModal(h('div.dialog-body', ...body), { kind: 'dialog', label: title, onClose: () => finish(false) });
  });
}
