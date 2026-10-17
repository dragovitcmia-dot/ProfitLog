// Live EUR/USD rate. Tries each source in order. The only network access in the app,
// and only when the person opens the Calc tab or taps "Pull live"
// (the hosts below are allowed in the Content-Security-Policy in index.html).

export const RATE_SOURCES = [
  { name: 'frankfurter.dev', url: 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD' },
  { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/EUR' },
];

async function fetchJson(fetchImpl, url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves { rate, source }; rejects with an array of reasons, one per failed source. */
export async function pullLiveRate({ fetchImpl = globalThis.fetch, sources = RATE_SOURCES, timeoutMs = 8000 } = {}) {
  const reasons = [];
  for (const src of sources) {
    try {
      const data = await fetchJson(fetchImpl, src.url, timeoutMs);
      const rate = Number(data?.rates?.USD);
      if (!(rate > 0) || !Number.isFinite(rate)) throw new Error('unexpected response');
      return { rate, source: src.name };
    } catch (err) {
      reasons.push(`${src.name}: ${err?.name === 'AbortError' ? 'timed out' : err?.message || 'failed'}`);
    }
  }
  throw reasons;
}
