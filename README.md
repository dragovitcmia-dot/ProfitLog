# ProfitLog

A tiny, offline-first **profit log** for people who sell digital products (gift cards, in-game currency) in **Tunisian dinars (TND)**. You work out the profit of each sale yourself; the app just records it, groups it, and shows you where you stand.

- **Profit calculator built in**: the **Calc** tab works out profit and margin on a gift card you resell (USDT → EUR card → TND), then logs the sale in one tap.
- **Installable PWA**: "Add to Home Screen" on Android or iPhone, runs full-screen like an app.
- **Offline-first, no backend, no account.** Everything is stored on your device (IndexedDB, with a localStorage → memory fallback). The only network call is the optional live EUR/USD rate in Calc.
- **No build step, no dependencies.** Plain HTML, CSS and ES modules. Any static host works.
- Money is stored as **integer millimes** (1 TND = 1000 millimes) and only rounded for display. Dates and times are **Africa/Tunis**.

> Logging a sale takes about 3 seconds: **Log sale → type the profit → Add.**
> Don't know the profit yet? **Calc → card price + sell price → Log this sale.**

---

## Calc tab (card profit calculator)

```
usdPer100Credit = creditPrice (USD)  |  creditPrice × eurUsdRate (EUR)
costUSDT   = cardPrice × usdPer100Credit / 100
costTND    = costUSDT × usdtPrice
profitTND  = sellPrice − costTND
marginOnCost = profit / costTND × 100      marginOnSale = profit / sellPrice × 100
suggested  = costTND × 1.10 / 1.15 / 1.20
```

- Results update as you type. `.` and `,` both work as the decimal mark (also `1 234,5`, `1,234.56`, Arabic-Indic digits).
- **Log this sale** opens the normal Log sale sheet with the profit (rounded to whole millimes) and a note like "18.84 EUR card, sold 80.00 TND" filled in. A loss pre-selects the minus sign.
- **Rates** (USDT price, credit price, its currency, EUR/USD) are saved on the device and included in JSON backups.
- The EUR/USD rate is pulled when you first open Calc each session and with **Pull live** (frankfurter.dev, falling back to open.er-api.com). A rate you typed yourself is never overwritten by the automatic pull. Offline, the last saved rate is used.

---

## Run it locally

You need Node 20+ (only for the tiny dev server and the tests; the app itself needs no Node).

```bash
git clone <your repo url> profitlog && cd profitlog
npm start            # serves http://localhost:8080  (node scripts/serve.mjs [port])
npm test             # runs the automated tests (no install needed)
```

No Node? Any static server works, e.g. `python3 -m http.server 8080`, then open `http://localhost:8080`.

> **Use `localhost` (or HTTPS).** Browsers only allow service workers, and therefore offline mode and installation, on `http://localhost` or `https://…`. Opening `index.html` straight from disk, or via a plain-`http` LAN address such as `http://192.168.1.20:8080`, will show the app but without offline support or install.

---

## Deploy for free

The app is just static files. Pick **one** of the two options.

### Option A: GitHub Pages (recommended)

1. Create a GitHub repository and push this project to it (default branch `main`).
2. In the repository go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**). The included workflow `.github/workflows/pages.yml` runs the tests, stamps a fresh cache version into the service worker, and publishes.
4. Your app is live at `https://<your-username>.github.io/<repo-name>/`. Open that URL on your phone.

*Prefer no Actions?* Use **Source: Deploy from a branch → `main` / `/ (root)`**. Run `npm run stamp` and commit before pushing if you changed any app file (see "Updating the app" below).

### Option B: Netlify

*Drag and drop (no account setup beyond signing up):*
1. Go to <https://app.netlify.com/drop> and drag the whole project folder onto the page.
2. Netlify gives you an `https://<random-name>.netlify.app` URL. You can rename it in **Site settings**.

*Or connect the repository:* **Add new site → Import from Git**. `netlify.toml` already contains the build command and publish directory; just click Deploy.

---

## Install on your phone

Open your deployed `https://…` URL **once while online** (this downloads the app for offline use), then:

**Android (Chrome)**
1. Tap the **⋮** menu → **Install app** (or **Add to Home screen**). A prompt may also appear automatically; Settings → *Install on your phone* has an **Install app** button.
2. Launch **ProfitLog** from your home screen.

**iPhone / iPad (Safari)**
1. Tap the **Share** button → **Add to Home Screen** → **Add**.
2. Launch **ProfitLog** from your home screen. (It must be Safari. Other iOS browsers can't install web apps.)

After installing, turn on airplane mode and open it: it still works. A long-press on the Android icon offers a **Log sale** shortcut.

> **Important:** the installed app and the same site opened in the browser keep *separate* data on iOS. Pick one way of using it and stay with it. Move data between them with Export → Import.

---

## Backups: please read

There is no server. **Your data lives only in this browser on this device.** If browser data is cleared (clearing site data/history, uninstalling the browser, a "storage cleaner" app, or the phone reclaiming space), **everything is permanently lost.**

- **Settings → Export everything (JSON)** writes a full backup (all sales + platforms, theme and week-start settings). Store it somewhere safe: cloud drive, email to yourself, your computer.
- **Settings → Export sales (CSV)** is for Excel/Google Sheets. Choose the *CSV style*: `12.500` (comma-separated, for Google Sheets / English Excel) or `12,500` with semicolons (for Excel set to French/Arabic locale, as is common in Tunisia). Files include a UTF-8 BOM so accents and Arabic text open correctly.
- **Restore**: Settings → *Import from JSON or CSV*. You always get a **preview** (valid rows, skipped rows with reasons, date range, total). Then choose:
  - **Merge** (default, safe): adds sales you don't already have; same id or same date+amount+platform+note counts as "already have". Nothing existing is changed.
  - **Replace**: deletes your current sales and uses the file's. Requires an extra confirmation, offers a backup download first, and can be undone for a few seconds.
- A reminder banner appears if you haven't exported in **more than 7 days**.
- **Persistent storage** (Settings → *Keep my data safe*) asks the browser not to evict your data automatically. It helps against low-space cleanups but **cannot** protect against you clearing site data. Installing the app to the Home Screen also makes browsers more willing to grant it. It's not a substitute for backups.

CSV import understands our own export as well as common variants: `DD/MM/YYYY` or `YYYY-MM-DD` dates, a combined date-time column, decimal commas, `;`/tab delimiters, and a `profit_millimes` column.

---

## What's in the app

| Screen | What you get |
|---|---|
| **Home** | Today's profit (large) and sale count, this week / this month cards, today's sales (tap to edit), big **Log sale** button. |
| **Log sale** (button on every screen) | One required field: profit, numeric keypad opens automatically, up to 3 decimals, a **−** toggle for losses (phone number pads often have no minus key; typing `-` also works). Date/time are automatic (Tunis) and editable. Collapsed extras: platform chips + note. **Add** returns Home with a toast and **Undo**; **Add & log another** keeps the sheet open. |
| **History** | Day / Week / Month switcher. Days show subtotals; weeks show profit, sales, avg/day; months show profit, sales, avg/day, avg/sale. Tap a week → its days; tap a month → its weeks → days. Tap any sale to edit/delete (with confirm + Undo). **Past sale** and per-day **+** buttons add forgotten entries. |
| **Dashboard** | Periods: today, yesterday, this week, this month, last 7, last 30, all time, custom. Total, count, average per sale/day, best/worst day. Daily/weekly/monthly bar charts (tap a bar: that day's sales). Per-platform list + donut. Comparison with the previous period (% change). 30-day projection with floor/ceiling. |
| **Settings** | Export/Import, persistent storage, theme (auto/light/dark), week start day, platform chips (add/rename/remove), install help, demo data (load / cleanly remove), danger zone (type-to-confirm, with backup offered first). |

### How the numbers are defined

These are the decisions I made where the brief left room:

- **Average per day** = total ÷ *calendar days elapsed* in the period, counting days with no sales. Days before your **first ever sale** and days in the future are not counted, so a brand-new log, or the current half-finished week, isn't unfairly diluted.
- **Average per sale** = total ÷ number of sales.
- **Best / worst day** only consider days that have at least one sale (otherwise "worst day" would always be an empty day). Ties go to the earliest day. A losing day can be the worst day.
- **Comparison is like-for-like**: "this month vs last month" compares the days so far this month with the *same number of days* of last month (month-to-date vs month-to-date); the same for this week. Rolling periods (last 7/30 days) and custom ranges compare against the window of equal length right before. "All time" has nothing to compare with. If the previous total is 0 the badge says "new" instead of a % ; for a negative baseline the % uses its absolute value.
- **Projection (30-day month)**: average daily profit over the **last 30 days** (or since your first sale, if shorter), including zero days, × 30. **Floor / ceiling** = your lowest / highest **complete** week (weeks that started before your first sale are skipped; empty weeks count as 0) scaled to 30 days (×30/7), clamped so floor ≤ projection ≤ ceiling. A warning shows when there are **fewer than 14 days** of data (first sale → today). The projection ignores the dashboard period selector on purpose.
- **Weeks** start on Monday by default (changeable). A week that straddles two months is split between them in the month view; each part's days are counted for its own month.
- Weeks and months with no sales are still listed between your first sale and today, so gaps are visible. Days with no sales are omitted from the Day view (but shown, with a **+** button, inside a week or month).
- The Log sale form won't accept a date later than today.
- **Editing a demo sale** turns it into a real one, so "Remove demo data" never deletes something you touched.

---

## Updating the app

The service worker caches the whole app. To make installed copies notice a new version, `sw.js` carries a version string and file list that **`npm run stamp`** regenerates from the file contents.

- With the GitHub Actions workflow or `netlify.toml` build command this happens **automatically on every deploy**.
- If you deploy by dragging a folder or publishing from a branch, run `npm run stamp` first and commit/deploy the changed `sw.js`. (`npm run check` verifies it's current; a test also fails if a file is missing from the cache list.)

When a new version is available, a green bar appears at the top of the app: **"A new version is ready · Update"**. Nothing reloads under you until you tap it.

---

## Project layout

```
index.html, manifest.webmanifest, sw.js
css/theme.css            design tokens (light + dark)
css/app.css              components
js/core/                 pure logic, no DOM, fully unit-tested
  stats.js               ALL the statistics: totals, averages, best/worst, grouping, periods, comparison, projection
  dates.js               Africa/Tunis calendar maths, day keys, labels
  money.js               millimes parsing/formatting
  calc.js                card profit calculator maths + validation
  io.js                  JSON/CSV export, import, validation, merge planning
  demo.js                deterministic demo data
js/data/db.js            IndexedDB → localStorage → memory adapters
js/data/store.js         app state + persistence queue
js/data/rates.js         live EUR/USD rate (the only network call)
js/ui/, js/views/        DOM helpers, sheets, charts, screens
test/                    node:test suites
scripts/                 serve.mjs (dev server), stamp.mjs (SW version), make-icons.mjs (optional)
icons/                   SVG sources + PNGs (any + maskable)
```

### Tests

`npm test` runs ~85 tests with Node's built-in runner covering: totals and exact millime sums, averages, best/worst day, grouping by day/week/month (incl. custom week start and month-boundary weeks), period filtering, previous-period comparison, the projection (floor/ceiling, 14-day warning), time-zone handling, the calculator maths and live-rate fallback, money parsing/formatting, JSON and CSV import/export **round trips**, merge/replace planning, and that the service worker caches every app file.

---

## Limitations

- Data can't sync between devices. Use Export/Import to move it.
- iOS may clear a website's data after weeks of non-use if it isn't installed to the Home Screen; installing it avoids that.
- The fallback storage modes (localStorage / memory) exist only so the app still opens in locked-down browsers; a warning banner is shown. There is no automatic migration from them to IndexedDB.
- Charts and the UI are in English; amounts use a `.` decimal point.
- The Content-Security-Policy in `index.html` allows connections to `api.frankfurter.dev` and `open.er-api.com` only (for the live rate). If you host the app elsewhere, keep those two hosts in `connect-src`.
