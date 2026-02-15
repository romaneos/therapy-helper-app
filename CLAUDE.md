# CLAUDE.md

## Project Overview

Therapy Helper PWA - practice management application for psychotherapists. Offline-first single-page app with optional Google Sheets cloud sync.

**Features:**
- Client management (name, session rate, currency, notes)
- Session tracking (date, amount, payment status, notes)
- Income and debt statistics with date filtering (week/month/year/all)
- Multi-currency support (USD, EUR, PLN) with live exchange rates
- Google Sheets bidirectional synchronization with offline queue
- JSON export/import for backups
- PWA: installable, works offline

**Languages:** Russian UI, English code/comments

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), CSS3 (iOS-style design)
- **Architecture:** Single `index.html` with inline CSS + inline `<script>`, plus ES module system (`js/app.js` entry point)
- **Storage:** LocalStorage for offline-first data persistence
- **Backend:** Google Apps Script for Google Sheets sync (all ops via GET requests due to CORS)
- **Deployment:** GitHub Actions auto-deploys to GitHub Pages on push to `main`

## Project Structure

```
therapy-helper-app/
├── index.html                          # Main PWA: HTML + CSS + inline JS (UI, rendering, data ops)
├── js/
│   ├── app.js                          # ES module entry: initializes SyncManager, exposes globals
│   └── services/
│       ├── SyncManager.js              # Orchestrates sync: connection state, merge, push
│       ├── GoogleSheetsService.js      # HTTP layer: API calls to Apps Script backend
│       └── SyncQueueService.js         # Offline queue: dedup, deleted tracking, localStorage persistence
├── google-apps-script.js              # Server-side: deploy to Google Apps Script (not served by app)
├── .github/workflows/deploy.yml       # Auto-deploy on push to main
├── CLAUDE.md                          # This file
└── README.md                          # Documentation (Russian)
```

## Architecture

### Data Flow
1. **Local-first:** All data lives in `localStorage` (`therapy_clients`, `therapy_sessions`)
2. **Sync layer:** `js/app.js` loads as ES module, creates `SyncManager` instance
3. **Global bridge:** Module exposes functions to `window.*` for inline script compatibility:
   - `window.pushToSheets()`, `window.checkConnectionAndSync()`, `window.forceSyncNow()`
   - `window.renderAll()`, `window.saveLocalData()`, `window.showToast()` (exposed by inline script)
4. **Merge strategy:** Timestamp-based (`updatedAt`) conflict resolution. Newer version wins.
5. **Deleted items:** Tracked in `SyncQueueService` to prevent resurrection during merge

### Data Models
- **Client:** `{ id, name, rate, currency, notes, createdAt, updatedAt }`
- **Session:** `{ id, clientId, date, amount, paid, notes, createdAt, updatedAt }`
- IDs generated via `Date.now().toString(36) + Math.random().toString(36).substring(2)`

### Screens (bottom nav)
1. **Clients** (`clientsScreen`) - client cards with session count and debt
2. **Sessions** (`sessionsScreen`, default) - session cards sorted by date desc
3. **Stats** (`statsScreen`) - income/session count/debt stats with per-client debt breakdown
4. **Settings** (`settingsScreen`) - Google Sheets config, export/import, clear data

### Modals (bottom-sheet style)
- Client create/edit modal
- Session create/edit modal (with delete)
- Client detail modal (stats + session history)
- Settings modal (Google Sheets URL)

## Code Style

- **OOP style:** ES6 classes with `#private` fields for services
- **Comments:** English only
- **UI strings:** Russian (all user-facing text)
- **Naming:** camelCase for variables/functions, PascalCase for classes
- **No build step:** Raw ES modules, no bundler
- **XSS protection:** `escapeHtml()` used for all user-generated content in HTML

## Development

- **Local server:** `python3 -m http.server` or `npx http-server` (needed for ES module imports)
- **Deploy:** Automatic via GitHub Actions on push to `main`
- **No tests:** No test framework configured
- **No linter:** No eslint/prettier configured

## Key Implementation Details

### Google Sheets Sync
- All API operations use **GET requests only** (CORS workaround for Apps Script)
- Data passed as URL query params: `?action=saveClient&data={JSON}`
- URL length limited to 1800 chars; notes truncated if URL too long
- After modifying `google-apps-script.js`, must create a **NEW deployment** in Apps Script
- Sheet names: "Клиенты" (Clients), "Сессии" (Sessions)
- Auto-initializes sheet structure on first sync

### Offline Queue
- Changes are always queued first, then pushed if online
- Queue deduplicates by entity ID (latest operation wins)
- Queue and deleted IDs persisted to localStorage (`therapy_sync_queue`, `therapy_deleted_ids`)
- Auto-syncs when browser comes back online (`window.addEventListener('online', ...)`)

### Exchange Rates
- Fetched from `api.exchangerate-api.com` (free, no API key)
- Cached in localStorage (`therapy_exchange_rates`)
- Fallback to cached/hardcoded rates if fetch fails
- Stats screen shows all amounts converted to selected display currency

## Data Privacy

This app handles sensitive client data:
- Client names and contact info
- Session notes and payment details
- Financial records

**Guidelines:**
- Never commit real client data
- Data is stored locally in browser localStorage
- Google Sheets sync is optional and uses user's personal account
- No data is sent to third parties (except exchange rate API and optional Google Sheets)
