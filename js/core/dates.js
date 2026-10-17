// Calendar maths in the Africa/Tunis time zone.
//
// A "day key" is a plain 'YYYY-MM-DD' string. Because it sorts lexically it can
// be compared with < and >, and all calendar arithmetic is done on UTC day
// numbers so it never depends on the device's own time zone.

export const TZ = 'Africa/Tunis';

const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Time zone offset (minutes east of UTC), cached per UTC day.

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function rawOffsetMin(ts) {
  const p = {};
  for (const x of partsFmt.formatToParts(ts)) if (x.type !== 'literal') p[x.type] = +x.value;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / 60000);
}

const offsetCache = new Map();

export function offsetMin(ts) {
  const idx = Math.floor(ts / DAY_MS);
  let o = offsetCache.get(idx);
  if (o === undefined) {
    const a = rawOffsetMin(idx * DAY_MS);
    const b = rawOffsetMin(idx * DAY_MS + DAY_MS - 1);
    o = a === b ? a : null; // null: an offset change happens inside this UTC day
    offsetCache.set(idx, o);
  }
  return o === null ? rawOffsetMin(ts) : o;
}

/** Wall-clock fields of an instant, as seen in Tunis. */
export function wall(ts) {
  const d = new Date(ts + offsetMin(ts) * 60000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
  };
}

/** Instant for a Tunis wall-clock time. */
export function wallToTs(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - offsetMin(guess) * 60000;
  return guess - offsetMin(first) * 60000;
}

// ---------------------------------------------------------------------------
// Day keys

export const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function keyOf(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function dayKey(ts) {
  const w = wall(ts);
  return keyOf(w.y, w.m, w.d);
}

export function todayKey(now = Date.now()) {
  return dayKey(now);
}

export function isValidKey(key) {
  const m = KEY_RE.exec(key);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayNum(key) {
  const m = KEY_RE.exec(key);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
}

export function keyFromNum(n) {
  const d = new Date(n * DAY_MS);
  return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(key, n) {
  return keyFromNum(dayNum(key) + n);
}

/** Whole days from a to b (b - a). */
export function diffDays(a, b) {
  return dayNum(b) - dayNum(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function dowOf(key) {
  return (((dayNum(key) + 4) % 7) + 7) % 7;
}

/** First day of the week containing `key`. weekStart: 0 = Sunday … 6 = Saturday. */
export function weekStartOf(key, weekStart = 1) {
  return addDays(key, -((dowOf(key) - weekStart + 7) % 7));
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function monthStartOf(key) {
  return key.slice(0, 7) + '-01';
}

export function monthEndOf(key) {
  const m = KEY_RE.exec(key);
  return keyOf(+m[1], +m[2], daysInMonth(+m[1], +m[2]));
}

/** `monthStart` is any day key inside the month. */
export function addMonths(key, n) {
  const m = KEY_RE.exec(key);
  const idx = +m[1] * 12 + (+m[2] - 1) + n;
  return keyOf(Math.floor(idx / 12), (idx % 12) + 1, 1);
}

export const maxKey = (a, b) => (a >= b ? a : b);
export const minKey = (a, b) => (a <= b ? a : b);

// ---------------------------------------------------------------------------
// <input type="datetime-local"> bridge (values are Tunis wall-clock time)

export function toDatetimeLocal(ts) {
  const w = wall(ts);
  return `${keyOf(w.y, w.m, w.d)}T${pad2(w.h)}:${pad2(w.mi)}`;
}

export function fromDatetimeLocal(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || '');
  if (!m) return null;
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidKey(key) || +m[4] > 23 || +m[5] > 59) return null;
  return wallToTs(+m[1], +m[2], +m[3], +m[4], +m[5]);
}

// ---------------------------------------------------------------------------
// Display

// Names are spelled out here (instead of Intl) so labels are identical on every device.
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (key) => KEY_RE.exec(key).slice(1).map(Number); // [y, m, d]
const dm = (key) => `${parts(key)[2]} ${MONTHS[parts(key)[1] - 1].slice(0, 3)}`;

export function fmtTime(ts) {
  const w = wall(ts);
  return `${pad2(w.h)}:${pad2(w.mi)}`;
}

/** "Today", "Yesterday" or "Sat 17 Oct" (year added when it isn't this year). */
export function fmtDay(key, today = todayKey()) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return fmtDayFull(key, today);
}

export function fmtDayFull(key, today = todayKey()) {
  const year = key.slice(0, 4) !== today.slice(0, 4) ? ' ' + key.slice(0, 4) : '';
  return `${fmtWeekday(key)} ${dm(key)}${year}`;
}

export function fmtDayShort(key) {
  return dm(key);
}

export function fmtDayLong(key) {
  return `${WEEKDAYS[dowOf(key)]} ${dm(key)}`;
}

export function fmtWeekday(key) {
  return DOW[dowOf(key)];
}

// Month labels accept a month key ('2026-10') or any day key inside the month.
const monthName = (key) => MONTHS[Number(key.slice(5, 7)) - 1];

export function fmtMonthLabel(key, withYear = true) {
  const name = monthName(key);
  return withYear ? `${name} ${key.slice(0, 4)}` : name;
}

export function fmtMonthShort3(key) {
  return monthName(key).slice(0, 3);
}

/** "12 – 18 Oct", "28 Sep – 4 Oct", with the year when it isn't this year. */
export function fmtRange(start, end, today = todayKey()) {
  if (start === end) return fmtDayFull(start, today);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const left = sameMonth ? String(parts(start)[2]) : dm(start);
  const showYear = start.slice(0, 4) !== today.slice(0, 4) || end.slice(0, 4) !== today.slice(0, 4);
  return `${left} – ${dm(end)}${showYear ? ' ' + end.slice(0, 4) : ''}`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
