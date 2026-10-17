// Rewrites the VERSION and PRECACHE list in sw.js so every app file is cached
// and a changed app is detected as a new version (which triggers the update prompt).
//   node scripts/stamp.mjs          write
//   node scripts/stamp.mjs --check  exit 1 if sw.js is out of date
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const files = [
  'index.html',
  'manifest.webmanifest',
  ...['css', 'js', 'icons'].flatMap((d) => walk(join(root, d)).map((f) => relative(root, f).split('\\').join('/'))),
].sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 10);

const list = ['./', ...files.map((f) => `./${f}`)].map((f) => `  '${f}',`).join('\n');
const swPath = join(root, 'sw.js');
const current = readFileSync(swPath, 'utf8');
const next = current
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/\/\* PRECACHE:START \*\/[\s\S]*?\/\* PRECACHE:END \*\//, `/* PRECACHE:START */\nconst PRECACHE = [\n${list}\n];\n/* PRECACHE:END */`);

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('sw.js is out of date. Run: npm run stamp');
    process.exit(1);
  }
  console.log('sw.js is up to date (version ' + version + ')');
} else {
  writeFileSync(swPath, next);
  console.log(`Stamped sw.js: version ${version}, ${files.length + 1} cached files`);
}
