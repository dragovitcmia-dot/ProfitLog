// Renders icons/*.svg into the PNG sizes the manifest needs. Optional: the PNGs
// are committed, so you only need this if you change the artwork.
//   npm i -D playwright && node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const { chromium } = await import('playwright');
const dir = join(fileURLToPath(new URL('..', import.meta.url)), 'icons');
const any = readFileSync(join(dir, 'icon.svg'), 'utf8');
const maskable = readFileSync(join(dir, 'icon-maskable.svg'), 'utf8');

const jobs = [
  ['icon-192.png', any, 192, true],
  ['icon-512.png', any, 512, true],
  ['icon-maskable-512.png', maskable, 512, false],
  ['apple-touch-icon.png', maskable, 180, false], // iOS applies its own rounding
  ['favicon-32.png', any, 32, true],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg, size, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  writeFileSync(join(dir, name), await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote', name);
}
await browser.close();
