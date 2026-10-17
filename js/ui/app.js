// App shell: bottom tabs, floating button, routing, theme, update bar.
import { h } from './dom.js';
import { icon } from './icons.js';
import { parseRoute, onRoute, navigate } from './router.js';
import { openSaleForm } from './saleform.js';
import { showToast } from './toast.js';
import { onUpdateReady, updateReady, applyUpdate } from './pwa.js';
import { store } from '../data/store.js';
import { todayKey } from '../core/dates.js';
import { renderHome } from '../views/home.js';
import { renderCalc } from '../views/calc.js';
import { renderHistory } from '../views/history.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderSettings } from '../views/settings.js';

const TABS = [
  { id: 'home', label: 'Home', icon: 'home', render: renderHome },
  { id: 'calc', label: 'Calc', icon: 'calc', render: renderCalc },
  { id: 'history', label: 'History', icon: 'history', render: renderHistory },
  { id: 'dashboard', label: 'Dashboard', icon: 'chart', render: renderDashboard },
  { id: 'settings', label: 'Settings', icon: 'settings', render: renderSettings },
];

let viewEl;
let tabEls;
let lastHash = null;
let lastDay = todayKey();

export function applyTheme(theme = store.settings.theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try {
    localStorage.setItem('pl-theme', theme);
  } catch { /* ignore */ }
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.head.append(h('meta', { name: 'theme-color', content: dark ? '#0c1210' : '#f4f3ee' }));
}

export function render() {
  const route = parseRoute();
  if (route.tab === 'new') {
    navigate('home', { replace: true });
    setTimeout(() => openSaleForm(), 50);
    return;
  }
  const tab = TABS.find((t) => t.id === route.tab) || TABS[0];
  const sameScreen = lastHash === route.hash;
  const scrollY = window.scrollY;
  const next = h('section.view' + (sameScreen ? '' : '.view-enter'), { 'aria-labelledby': 'view-title' });
  tab.render(next, route, render);
  next.querySelector('h1')?.setAttribute('id', 'view-title');
  viewEl.replaceChildren(next);
  tabEls.forEach((el, i) => el.setAttribute('aria-current', TABS[i].id === tab.id ? 'page' : 'false'));
  lastHash = route.hash;
  if (sameScreen) window.scrollTo(0, scrollY);
  else window.scrollTo(0, 0);
}

export function startApp(mountEl) {
  const updateBar = h('div.update-bar', { hidden: true, role: 'status' },
    icon('refresh', 20), h('span', 'A new version is ready.'),
    h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => applyUpdate() }, 'Update'));
  const showUpdate = () => { updateBar.hidden = false; };
  onUpdateReady(showUpdate);
  if (updateReady()) showUpdate();

  viewEl = h('main.main', { id: 'main' });
  tabEls = TABS.map((t) =>
    h('a.tab', { href: `#/${t.id}`, 'aria-current': 'false', onclick: (e) => { e.preventDefault(); navigate(t.id, { replace: true }); } },
      icon(t.icon, 24), h('span', t.label)));
  const fab = h('button.fab', { type: 'button', 'aria-label': 'Log sale', onclick: () => openSaleForm() }, icon('plus', 30));

  mountEl.replaceChildren(updateBar, viewEl, h('nav.tabbar', { 'aria-label': 'Main' }, ...tabEls), fab);

  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => store.settings.theme === 'auto' && applyTheme());

  let lastTheme = store.settings.theme;
  store.subscribe(() => {
    if (store.settings.theme !== lastTheme) {
      lastTheme = store.settings.theme;
      applyTheme();
    }
    render();
  });
  store.onError(() => showToast("Couldn't save to this device's storage. It may be full. Export a backup now.", { kind: 'error', persistent: true, actionLabel: 'OK' }));

  onRoute(() => render());
  // a new day starts at midnight Tunis time, even if the app stays open
  const checkDay = () => {
    const d = todayKey();
    if (d !== lastDay) {
      lastDay = d;
      render();
    }
  };
  setInterval(checkDay, 30000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkDay());
  render();
}
