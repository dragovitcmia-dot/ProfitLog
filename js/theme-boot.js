// Runs before first paint so the chosen theme never flashes.
try {
  const t = localStorage.getItem('pl-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage blocked: fall back to the system theme */ }
