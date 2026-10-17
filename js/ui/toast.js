// One toast at a time, with an optional action (Undo) and a shrinking timer bar.
import { h } from './dom.js';

let host = null;
let current = null;

function getHost() {
  if (!host) {
    host = h('div.toast-host', { 'aria-live': 'polite', role: 'status' });
    document.body.append(host);
  }
  return host;
}

export function dismissToast() {
  if (!current) return;
  const { el, timer } = current;
  clearTimeout(timer);
  el.classList.remove('in');
  setTimeout(() => el.remove(), 220);
  current = null;
}

/**
 * showToast('Added 12.500 TND', { actionLabel: 'Undo', onAction, duration: 6000, kind: 'success'|'error'|'info' })
 */
export function showToast(message, { actionLabel, onAction, duration = 6000, kind = 'success', persistent = false } = {}) {
  dismissToast();
  const el = h(
    `div.toast.toast-${kind}`,
    h('span.toast-msg', message),
    actionLabel &&
      h('button.toast-action', {
        type: 'button',
        onclick: () => {
          dismissToast();
          onAction?.();
        },
      }, actionLabel),
    !persistent && h('span.toast-timer', { style: { animationDuration: duration + 'ms' } }),
  );
  getHost().append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const timer = persistent ? null : setTimeout(dismissToast, duration);
  current = { el, timer };
}
