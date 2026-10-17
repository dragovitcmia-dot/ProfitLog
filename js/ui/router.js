// Hash router: '#/home', '#/history/week/2026-10-12', '#/dashboard', '#/settings'.
// Tab switches replace the history entry; drilling into a detail pushes one so
// the phone's Back button behaves.

export function parseRoute(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [tab = 'home', ...rest] = parts;
  return { tab, rest, hash: '#/' + parts.join('/') };
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : '#/' + path.replace(/^\//, '');
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) location.replace(target);
  else location.hash = target;
}

export function onRoute(cb) {
  window.addEventListener('hashchange', () => cb(parseRoute()));
}
