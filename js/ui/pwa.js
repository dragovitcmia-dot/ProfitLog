// Service worker registration, the "update ready" prompt and the install prompt.

let waitingWorker = null;
const updateListeners = new Set();
let installEvent = null;
const installListeners = new Set();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  // boot is async, so the page may already be loaded by the time we get here
  const whenLoaded = (fn) => (document.readyState === 'complete' ? fn() : window.addEventListener('load', fn));
  whenLoaded(async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const announce = (worker) => {
        waitingWorker = worker;
        updateListeners.forEach((fn) => fn());
      };
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) announce(nw);
        });
      });
      // check for a new version whenever the app comes back to the foreground
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });
  // Reload when an update takes over, but not on the very first install (nothing to swap).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

export const updateReady = () => !!waitingWorker;
export const onUpdateReady = (fn) => (updateListeners.add(fn), () => updateListeners.delete(fn));
export const applyUpdate = () => waitingWorker?.postMessage({ type: 'SKIP_WAITING' });

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installListeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  installListeners.forEach((fn) => fn());
});

export const canPromptInstall = () => !!installEvent;
export const onInstallChange = (fn) => (installListeners.add(fn), () => installListeners.delete(fn));
export async function promptInstall() {
  if (!installEvent) return null;
  installEvent.prompt();
  const choice = await installEvent.userChoice;
  installEvent = null;
  installListeners.forEach((fn) => fn());
  return choice.outcome;
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
