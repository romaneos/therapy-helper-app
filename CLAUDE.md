# CLAUDE.md

## Project Overview

Therapy Helper PWA - practice management application for psychotherapists.

**Features:**
- Client management with rates and notes
- Session tracking with payment status
- Income and debt statistics
- Google Sheets synchronization
- Offline-first with sync queue
- JSON export/import for backups

**Languages:** Russian UI, English code/comments

## Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), single HTML file, CSS3 (iOS-style)
- **Storage:** LocalStorage for offline-first data
- **Backend:** Google Apps Script for Google Sheets sync
- **Deployment:** GitHub Actions to GitHub Pages

*Note: Tech stack may evolve in the future.*

## Project Structure

```
therapy-helper-app/
├── index.html              # Main PWA (HTML + CSS + JS in one file)
├── google-apps-script.js   # Google Sheets backend
├── .github/workflows/
│   └── deploy.yml          # Auto-deploy on push to main
└── README.md               # Documentation (Russian)
```

## Code Style

- **OOP style:** Use classes with encapsulation
- **Comments:** English only
- **UI strings:** Russian (user-facing text)
- **Naming:** camelCase for variables/functions, PascalCase for classes

## Development

- **Local server:** Not yet configured (use `python3 -m http.server` or `npx http-server` for now)
- **Deploy:** Automatic via GitHub Actions on push to `main`

## Data Privacy

This app handles sensitive client data:
- Client names and contact info
- Session notes and payment details
- Financial records

**Guidelines:**
- Never commit real client data
- Data is stored locally in browser LocalStorage
- Google Sheets sync is optional and uses user's personal account
- No data is sent to third parties

## Google Sheets API

- All operations use GET requests (CORS workaround)
- After modifying `google-apps-script.js`, create a **NEW deployment** in Apps Script
- Sheet structure is auto-initialized on first sync
- Sheets: "Клиенты" (Clients), "Сессии" (Sessions)
