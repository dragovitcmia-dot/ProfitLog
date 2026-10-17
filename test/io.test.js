import test from 'node:test';
import assert from 'node:assert/strict';
import { sale } from './helpers.js';
import {
  buildBackup, backupToJSON, parseBackup, salesToCSV, parseCSVSales, parseCSVRows, parseImportFile,
  planImport, validateSale, signature, DEFAULT_TAGS,
} from '../js/core/io.js';
import { totalProfit } from '../js/core/stats.js';

const settings = { tags: ['Roblox', 'Steam'], weekStart: 0, theme: 'dark' };
const SALES = [
  sale('2026-10-17', '09:00', 10.5, { tag: 'Roblox', id: 'a1', note: 'plain' }),
  sale('2026-10-16', '23:59', -3.25, { id: 'a2', note: 'with, comma and "quotes"' }),
  sale('2026-10-15', '00:00', 0.001, { tag: 'Steam', id: 'a3', note: 'ünïcødé ✓ تونس' }),
  sale('2026-10-14', '12:30', 1234.5, { id: 'a4', note: '=HYPERLINK("http://x")' }),
  sale('2026-10-13', '12:30', 7, { id: 'a5', note: '-5 refund' }),
].map((s, i) => ({ ...s, createdAt: 1000 + i, updatedAt: 2000 + i }));

test('JSON backup round trip keeps every field and the settings', () => {
  const text = backupToJSON({ sales: SALES, settings }, 1700000000000);
  const back = parseBackup(text);
  assert.equal(back.ok, true);
  assert.deepEqual(back.rejected, []);
  assert.deepEqual(back.sales, SALES.map((s) => ({ ...s })));
  assert.deepEqual(back.settings, settings);
  assert.equal(totalProfit(back.sales), totalProfit(SALES));
  assert.equal(JSON.parse(text).exportedAt, '2023-11-14T22:13:20.000Z');
});

test('backup stores money as integer millimes', () => {
  const b = buildBackup({ sales: SALES, settings });
  assert.ok(b.sales.every((s) => Number.isInteger(s.profit)));
  assert.equal(b.sales[0].profit, 10500);
});

test('demo flag survives a round trip', () => {
  const s = [{ ...SALES[0], demo: true }];
  assert.equal(parseBackup(backupToJSON({ sales: s, settings })).sales[0].demo, true);
});

test('JSON import validates rows and reports the bad ones', () => {
  const text = JSON.stringify({
    app: 'profitlog', schema: 1, sales: [
      { id: 'ok', ts: 1760000000000, profit: 1500 },
      { id: 'float', ts: 1760000000000, profit: 1.5 },
      { id: 'nots', profit: 1500 },
      { id: 'str', ts: '1760000000000', profit: 1500 },
      null,
    ],
  });
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  assert.equal(r.sales.length, 1);
  assert.equal(r.rejected.length, 4);
  assert.equal(r.rejected[0].row, 2);
});

test('JSON import rejects things that are not backups', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('{"hello":1}').ok, false);
  assert.equal(parseBackup('{"app":"profitlog","schema":99,"sales":[]}').ok, false);
  assert.equal(parseBackup('[{"ts":1760000000000,"profit":1000}]').ok, true); // bare array is accepted
});

test('CSV export is Excel-friendly: BOM, CRLF, header, quoting', () => {
  const csv = salesToCSV(SALES);
  assert.ok(csv.startsWith('\uFEFFdate,time,profit_tnd,platform,note,id\r\n'));
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('2026-10-16,23:59,-3.250,,"with, comma and ""quotes""",a2'));
  assert.ok(csv.includes('2026-10-15,00:00,0.001,Steam,ünïcødé ✓ تونس,a3'));
  // spreadsheet formula injection is defused
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`));
  // oldest first
  assert.ok(csv.indexOf('2026-10-13') < csv.indexOf('2026-10-17'));
});

test('CSV round trip (dot decimal)', () => {
  const back = parseCSVSales(salesToCSV(SALES));
  assert.equal(back.ok, true);
  assert.deepEqual(back.rejected, []);
  assertSameSales(back.sales, SALES);
});

test('CSV round trip (comma decimal, semicolon delimiter for French/Arabic Excel)', () => {
  const csv = salesToCSV(SALES, { decimal: ',' });
  assert.ok(csv.startsWith('\uFEFFdate;time;profit_tnd;platform;note;id'));
  assert.ok(csv.includes(';1234,500;'));
  const back = parseCSVSales(csv);
  assert.equal(back.delimiter, ';');
  assertSameSales(back.sales, SALES);
});

function assertSameSales(got, want) {
  const key = (s) => s.id;
  const g = [...got].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const w = [...want].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  assert.equal(g.length, w.length);
  g.forEach((s, i) => {
    assert.equal(s.id, w[i].id);
    assert.equal(s.ts, w[i].ts);
    assert.equal(s.profit, w[i].profit);
    assert.equal(s.tag, w[i].tag);
    assert.equal(s.note, w[i].note);
  });
}

test('CSV import understands other layouts', () => {
  const csv = 'Date;Heure;Profit (TND);Plateforme;Note\r\n17/10/2026;14:30;12,5;Steam;hello\r\n03.10.2026;;-4;;\r\n';
  const r = parseCSVSales(csv);
  assert.equal(r.ok, true);
  assert.equal(r.sales.length, 2);
  assert.equal(r.sales[0].profit, 12500);
  assert.equal(r.sales[0].tag, 'Steam');
  assert.equal(r.sales[1].profit, -4000);
  assert.equal(new Date(r.sales[0].ts).toISOString(), '2026-10-17T13:30:00.000Z');
});

test('CSV import accepts a combined date-time column and millimes', () => {
  const r = parseCSVSales('datetime,profit_millimes\n2026-10-17 14:30,2500\n2026-10-17T09:05:00,-750\n');
  assert.equal(r.ok, true);
  assert.deepEqual(r.sales.map((s) => s.profit), [2500, -750]);
});

test('CSV import validates rows and says why they fail', () => {
  const csv = 'date,time,profit_tnd\n2026-10-17,10:00,5\n2026-02-30,10:00,5\nyesterday,10:00,5\n2026-10-17,25:00,5\n2026-10-17,10:00,abc\n2026-10-17,10:00,1.2345\n2026-10-17,10:00,\n';
  const r = parseCSVSales(csv);
  assert.equal(r.sales.length, 1);
  assert.equal(r.rejected.length, 6);
  assert.deepEqual(r.rejected.map((x) => x.row), [3, 4, 5, 6, 7, 8]);
  assert.match(r.rejected[0].error, /does not exist/);
  assert.match(r.rejected[4].error, /3 decimals/);
});

test('CSV import without the required columns fails clearly', () => {
  const r = parseCSVSales('foo,bar\n1,2\n');
  assert.equal(r.ok, false);
  assert.match(r.error, /date/);
  assert.equal(parseCSVSales('').ok, false);
});

test('CSV parser handles quotes, embedded newlines and BOM', () => {
  const rows = parseCSVRows('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",z', ',');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['line1\nline2', 'z']]);
});

test('parseImportFile picks the format', () => {
  assert.equal(parseImportFile('x.json', backupToJSON({ sales: SALES, settings })).format, 'json');
  assert.equal(parseImportFile('x.csv', salesToCSV(SALES)).format, 'csv');
  assert.equal(parseImportFile('export.txt', backupToJSON({ sales: SALES, settings })).format, 'json'); // by content
});

test('validateSale cleans text and limits', () => {
  const r = validateSale({ ts: 1760000000000, profit: 100, tag: '  Steam ', note: ' a\n b  ' });
  assert.equal(r.sale.tag, 'Steam');
  assert.equal(r.sale.note, 'a b');
  assert.ok(r.sale.id);
  assert.equal(validateSale({ ts: 1760000000000, profit: 100, note: 'x'.repeat(1000) }).sale.note.length, 280);
  assert.equal(validateSale({ ts: 1760000000000, profit: 2 ** 60 }).ok, false);
});

test('merge never overwrites: duplicates by id or by content are skipped', () => {
  const existing = SALES.slice(0, 3);
  const incoming = [
    SALES[0], // same id
    { ...SALES[1], id: 'different-id' }, // same content, different id
    { ...SALES[3] }, // new
    { ...SALES[3], id: 'also-new' }, // duplicate of the one above inside the file
  ];
  const plan = planImport(existing, incoming, 'merge');
  assert.deepEqual(plan.add.map((s) => s.id), ['a4']);
  assert.equal(plan.duplicates.length, 3);
  assert.equal(plan.removeCount, 0);
  // existing sales are untouched
  assert.equal(existing[0].profit, 10500);
});

test('replace plans to remove everything that is there', () => {
  const plan = planImport(SALES.slice(0, 3), SALES.slice(2), 'replace');
  assert.equal(plan.removeCount, 3);
  assert.equal(plan.add.length, 3);
  assert.equal(plan.duplicates.length, 0);
});

test('merge applied to exports gives the same totals as the union', () => {
  const a = SALES.slice(0, 3);
  const b = SALES.slice(1);
  const plan = planImport(a, b, 'merge');
  assert.equal(totalProfit([...a, ...plan.add]), totalProfit(SALES));
});

test('signature identifies a sale by moment, amount, platform and note', () => {
  assert.equal(signature(SALES[0]), signature({ ...SALES[0], id: 'zzz' }));
  assert.notEqual(signature(SALES[0]), signature({ ...SALES[0], profit: 1 }));
});

test('default tags are the nine platforms from the brief', () => {
  assert.deepEqual(DEFAULT_TAGS, ['Roblox', 'PlayStation', 'Apple', 'Free Fire', 'Nintendo', 'Steam', 'Valorant', 'Xbox', 'Other']);
});
