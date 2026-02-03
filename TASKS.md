# Development Tasks

## Architecture Decisions
- **Module System:** ES Modules (`<script type="module">`)
- **State Management:** Encapsulated within services
- **Code Style:** OOP with classes, English comments

---

## Current Sprint: OOP Refactoring

### Phase 1: Extract Google Sheets Integration
**Status:** Complete
**Priority:** High

Extract all Google Sheets synchronization logic into separate ES modules.

#### Tasks:
- [x] Create directory structure `js/services/`
- [x] Create `js/services/GoogleSheetsService.js`
  - `constructor(scriptUrl, maxUrlLength = 1800)`
  - `async ping()` - check connection, returns boolean
  - `async init()` - initialize spreadsheet
  - `async getData()` - fetch all data from sheets
  - `async saveClient(client)` - save single client
  - `async saveSession(session)` - save single session
  - `async deleteClient(id)` - delete client
  - `async deleteSession(id)` - delete session
  - Private: `#truncateDataForUrl(data)` - handle URL length limits
  - Private: `#buildUrl(action, data)` - construct API URL
- [x] Create `js/services/SyncQueueService.js`
  - `constructor(storageKey = 'therapy_sync_queue')`
  - Encapsulates queue array and deletedIds internally
  - `add(action, data)` - add to queue (deduplicates by id)
  - `removeById(id)` - remove item by data id
  - `clear()` - clear entire queue
  - `getAll()` - get all queued items
  - `get length` - getter for queue size
  - `addDeletedId(type, id)` - track deleted items
  - `isDeleted(type, id)` - check if item was deleted
  - `clearDeletedIds()` - clear deleted tracking
  - Private: `#save()` - persist to localStorage
  - Private: `#load()` - load from localStorage
- [x] Create `js/services/SyncManager.js`
  - `constructor(config)` - config includes scriptUrl, callbacks
  - Encapsulates: isOnline, isSyncing states
  - `async checkConnection()` - ping and update state
  - `async sync()` - full sync cycle
  - `async pushChange(action, data)` - push with queue fallback
  - `mergeData(remoteData, localClients, localSessions)` - merge logic
  - `onConnectionChange(callback)` - register connection listener
  - `onSyncComplete(callback)` - register sync listener
- [x] Create `js/app.js` - main entry point that wires everything
- [x] Update `index.html`:
  - Add `<script type="module" src="js/app.js"></script>`
  - Remove inline sync-related JavaScript
  - Keep UI rendering code for now (Phase 2)
- [ ] Test all sync scenarios:
  - Online sync works
  - Offline queue works
  - Merge conflicts resolved correctly
  - Delete tracking works

#### Files Created:
```
js/
├── app.js                    # Main entry point, exposes globals
└── services/
    ├── GoogleSheetsService.js  # HTTP API calls
    ├── SyncQueueService.js     # Offline queue management
    └── SyncManager.js          # Sync orchestration
```

#### Acceptance Criteria:
- [x] Code organized in ES module classes with clear responsibilities
- [x] No global sync-related variables in index.html
- [x] Services encapsulate their own state
- [x] Connection status UI updates work as before
- [ ] All sync functionality works identically to current implementation (needs testing)

---

### Phase 2: Extract Data Management (Future)
**Status:** Not Started
**Priority:** Medium

- [ ] Create `ClientService` class
- [ ] Create `SessionService` class
- [ ] Create `LocalStorageService` class

---

### Phase 3: Extract UI Components (Future)
**Status:** Not Started
**Priority:** Low

- [ ] Create separate component classes for modals
- [ ] Create renderer classes for lists
- [ ] Extract event handlers

---

## Backlog

- [ ] Set up local development server configuration
- [ ] Add unit tests
- [ ] Consider TypeScript migration
- [ ] Consider build system (Vite/webpack)

---

## Completed

### 2024 - Phase 1: Google Sheets Integration Refactoring
- Created OOP service classes for sync functionality
- Migrated from inline JS to ES modules
- Implemented encapsulated state management
