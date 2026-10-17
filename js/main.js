import { store } from './data/store.js';
import { openMemory } from './data/db.js';
import { startApp } from './ui/app.js';
import { registerServiceWorker } from './ui/pwa.js';

async function boot() {
  const mountEl = document.getElementById('app');
  try {
    await store.init();
  } catch (err) {
    console.error('Storage failed to start, continuing in memory', err);
    await store.init(openMemory());
  }
  startApp(mountEl);
  registerServiceWorker();
}

boot();
