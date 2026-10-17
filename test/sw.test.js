import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('service worker precaches every app file (so it works offline)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const block = /\/\* PRECACHE:START \*\/([\s\S]*?)\/\* PRECACHE:END \*\//.exec(sw);
  assert.ok(block, 'sw.js must contain the PRECACHE markers (run `npm run stamp`)');
  const listed = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
  const actual = [
    'index.html', 'manifest.webmanifest',
    ...['css', 'js', 'icons'].flatMap((d) => walk(join(root, d)).map((f) => relative(root, f).split('\\').join('/'))),
  ].map((p) => './' + p);
  assert.deepEqual([...listed].sort(), actual.sort());
});

test('manifest is installable', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url && m.scope);
  const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose || 'any'}`);
  assert.ok(sizes.includes('192x192:any'));
  assert.ok(sizes.includes('512x512:any'));
  assert.ok(sizes.includes('512x512:maskable'));
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), `${i.src} exists`);
});

test('index.html only references files that exist', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)) {
    assert.ok(existsSync(join(root, m[1])), `${m[1]} exists`);
  }
});
