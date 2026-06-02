# 農機業務管理 PRO — CLAUDE.md

## What this project is

A Japanese-language PWA (Progressive Web App) for agricultural machinery dealers. It manages customer records, repair jobs, demo events, parts orders, product sales, estimates, and machine registration — all stored locally in `localStorage` with optional cloud sync via Google Apps Script (GAS).

The app also has an automated self-healing CI pipeline that uses Claude to detect and patch regressions on every push to `main`.

---

## Repository layout

```
nouki-kanri/
├── index.html          # Entire application (HTML + CSS + JS, ~2000 lines)
├── index-2.html        # Secondary/experimental version of the app
├── sw.js               # Service Worker (network-first caching strategy)
├── manifest.json       # PWA manifest
├── icon-*.png          # App icons (192, 512, maskable)
│
│   ── Automated test/fix pipeline (Node.js) ──
├── test.js             # Main test runner (Puppeteer orchestrator)
├── scanner.js          # Static analysis of JS/HTML files
├── analyzer.js         # Categorises errors from scanner + runtime logs
├── ai-engine.js        # Calls Claude API (Haiku) to generate fix patches
├── patcher.js          # Applies AI-generated patches to index.html
├── visual-checker.js   # Takes screenshots and asks Claude to review UI
├── diff.js             # Produces unified diffs of patched files
│
├── package.json        # Node deps: puppeteer, glob, diff, http-server
├── .gitignore          # Excludes logs/, node_modules/, package-lock.json
└── .github/workflows/
    ├── test.yml        # CI: runs on push to main (5-phase pipeline)
    └── setup.yml       # Manual workflow to regenerate all tool files
```

---

## Application architecture

### Single-file frontend (`index.html`)

The entire app lives in one HTML file — no build step, no framework, no bundler.

- **CSS**: Inline `<style>` block with CSS custom properties for light/dark theme switching.
- **HTML**: Static shell; all dynamic content is injected by JavaScript via `innerHTML`.
- **JS**: One large `<script>` block at the end of `<body>`.

**Entry point sequence:**
1. Splash screen shown on load.
2. `loadDB()` reads `localStorage['agri_db']` (JSON).
3. `loadDB()` also reads `agri_api_key` and `agri_gas_url` from localStorage.
4. `renderAll()` populates the current tab's content area (`#content_main`).
5. Cloud sync triggers 3 seconds after any `saveDB()` call.

### Data model (`DB` object)

```js
DB = {
  settings:  [{ id, targetSales, currentSales }],
  customers: [{ id, name, phone, address, memo }],
  repairs:   [{ id, customerName, machineName, model, serial, issue,
                status, date, parts, laborCost, memo, photos }],
  demos:     [{ id, customerName, machineName, model, status, date, memo }],
  parts:     [{ id, customerName, partName, partNo, qty, price,
                status, orderDate, memo }],
  products:  [{ id, customerName, machineName, model, serial,
                price, status, date, memo }],
  quotes:    [{ id, estNo, estDate, expDate, delivDate, delivPlace,
                payMethod, toName, subject, items, note }],
  memos:     [{ id, text, createdAt }],
  machines:  [{ id, customerName, machineName, model, serial,
                brand, year, hours, memo }],
  lastModified: "<ISO string>"
}
```

All writes go through `saveDB()`, which:
1. Bumps `DB.lastModified` by at least 1 second to ensure monotonic ordering.
2. Writes to `localStorage['agri_db']`.
3. Writes an hourly emergency backup (`agri_backup_YYYY-MM-DD_HH`).
4. Schedules a cloud sync after 3 seconds.

### Tab system

```js
const TABS = ['ホーム','顧客','修理','実演','部品','製品','見積書','機械'];
```

Each tab renders by calling its render function (e.g. `renderRepairs()`, `renderCustomers()`). The quote editor is a separate panel (`#content_quote_editor`) that slides over `#content_main`.

### Cloud sync (GAS)

- **GET** the GAS URL → returns current cloud DB JSON.
- Compare `lastModified` timestamps; pull if cloud is newer, push if local is newer.
- Conflict resolution: if cloud has no data but local does, keep local.
- `forcePullFromCloud()` bypasses timestamp comparison and always overwrites local.

### AI features (Claude API, browser-side)

The `apiKey` is stored in `localStorage['agri_api_key']` and sent directly to `api.anthropic.com` from the browser. Features:
- **AI一括入力 (Smart bulk input)**: Text or voice → Claude parses and creates/updates records + optional estimate.
- **銘板スキャン (Nameplate scan)**: Camera photo → Claude OCR → fills machine name/model/serial.
- **稼働時間スキャン (Meter scan)**: Camera photo → Claude reads hours meter.
- **AI故障診断 (Fault diagnosis)**: Camera photo → Claude diagnoses issue.
- **伝票OCR (Invoice OCR)**: Camera/PDF → Claude reads parts list.
- **見積書スキャン (Quote scan)**: Photo/PDF of competitor quote → Claude creates new estimate.

### PWA / Service Worker

`sw.js` uses a **network-first** strategy: always tries network, falls back to cache. Cache name is `nouki-pwa-v1`. The SW is registered in `index.html` (look for `navigator.serviceWorker.register`).

---

## Automated CI pipeline

### `test.yml` — triggers on `push` to `main`

**Phase 1 — Static analysis** (`scanner.js`):
- Parses all `.js` files and inline `<script>` blocks in `.html` files.
- Detects: syntax errors (`new Function(code)`), dangerous patterns (`eval`, `document.write`, `innerHTML=`), missing npm deps, unhandled promises, `await` outside `async`.

**Phase 2 — Runtime test** (`puppeteer`):
- Launches headless Chromium, navigates to `http://localhost:3000` (started by `http-server`).
- Checks for missing DOM IDs: `['toName','subject','estDate','itemTable','preview']`.
- Checks for missing global functions: `['openQuoteEditor','calcTotal','buildEstHTML']`.
- Collects console errors and page errors.

**Phase 2.5 — UI analysis** (`visual-checker.js`):
- Takes full-page and viewport screenshots.
- If `ANTHROPIC_API_KEY` is set, sends viewport screenshot to Claude Haiku (vision) for UI review.
- Returns issues as `{ type, severity, description, suggestion }`.

**Phase 3 — Analysis** (`analyzer.js`):
- Combines runtime logs and static scan results into a typed error list.
- Severity: `low` (0-1 types), `medium` (2-3), `high` (4+).

**Phase 4 — AI fix generation** (`ai-engine.js`):
- Sends all collected errors + git diff + UI analysis to Claude Haiku.
- Receives structured JSON: `{ summary, severity, fixes: [{ type, target, description, code, oldCode }] }`.
- Fix types: `add_function`, `add_stub`, `fix_dom`, `fix_import`, `fix_syntax`.

**Phase 5 — Patch application** (`patcher.js`):
- Applies each fix to the target file (usually `index.html`).
- If `fix_syntax`: replaces `oldCode` with `code`.
- If `add_function`/`add_stub`: inserts before last `</script>`.
- If `fix_dom`: inserts before `</body>`.
- If `fix_import`: prepends to file.

**After test**: `peter-evans/create-pull-request@v6` creates a PR with the patched file if any changes were made. Logs are uploaded as the `debug-logs` artifact.

### `setup.yml` — manual workflow

Re-generates all Node.js tool files from inline here-docs. Run this if the tool files get out of sync with the workflow definition.

---

## Development workflow

### Running the app locally

```bash
npx http-server . -p 3000
# Open http://localhost:3000
```

No build step needed. Edit `index.html` directly and refresh.

### Running the test pipeline locally

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npx http-server . -p 3000 --silent &
npm test
# Results in logs/
```

### Secrets required for full CI

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API for UI analysis and fix generation |
| `GITHUB_TOKEN` | Auto-created; used by `create-pull-request` action |

GAS URL is user-configured at runtime (not a CI secret).

---

## Key conventions

### JavaScript style in `index.html`

- Minified, semicolon-separated, minimal whitespace — this is intentional.
- All functions are global (attached to `window` implicitly). No modules.
- IDs in HTML use camelCase (`estDate`, `toName`, `modalBody`).
- Status values for each entity type are enumerated in `STATUS_COLORS` at the top of the script block.
- Japanese UI strings are inline in the HTML/JS. Do not translate them to English.

### Modifying the app

- The only file that affects the running app is `index.html` (or `index-2.html` for the secondary version).
- When adding a new tab or data type, add it to `TABS`, `DB`, `renderAll()`, and the appropriate render function.
- `saveDB()` must be called after every data mutation; it handles backups and sync scheduling.
- Never bypass `saveDB()` by writing to `localStorage` directly.

### Modifying the test pipeline

- Changes to `test.yml`'s inline here-docs should be mirrored in the corresponding `.js` files (or run `setup.yml` to regenerate them).
- The DOM IDs and function names checked in Phase 2 must match what actually exists in `index.html`.
- When adding new required DOM elements or global functions to `index.html`, update the arrays in `test.js`:
  ```js
  logs.domMissing = await page.evaluate(() =>
    ['toName','subject','estDate','itemTable','preview'].filter(id => !document.getElementById(id))
  );
  logs.functionMissing = await page.evaluate(() =>
    ['openQuoteEditor','calcTotal','buildEstHTML'].filter(f => typeof window[f] !== 'function')
  );
  ```

### Claude API usage in `ai-engine.js` and `visual-checker.js`

- Model: `claude-haiku-4-5-20251001` (fast, low-cost for automated CI).
- Prompts are in Japanese and must return JSON only — no markdown wrappers.
- The response parser tries `\`\`\`json...\`\`\`` block first, then bare `{...}` match.

---

## What to watch out for

- **`innerHTML` usage**: The static scanner flags all `innerHTML =` assignments as `DANGEROUS_CODE`. This is by design — the app uses innerHTML heavily for rendering. Do not remove these; they are intentional.
- **`lastModified` monotonicity**: `saveDB()` ensures `lastModified` always advances. If you manually set `DB.lastModified`, do not set it to a past time or cloud sync conflict resolution will behave incorrectly.
- **Font placeholder**: `index.html` line ~87 has `src:url(REPLACE_ME)` for Pinyon Script font. This is intentional — the base64 font data is meant to be filled in by the user. Do not remove it.
- **`logs/` directory**: Generated at test time. Never commit its contents (it is gitignored).
- **PWA cache**: If testing changes to `sw.js`, clear the browser's service worker cache or use a new `CACHE_NAME` version string.
