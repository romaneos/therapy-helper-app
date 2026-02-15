import { SyncManager } from './services/SyncManager.js';

/**
 * Main application entry point.
 * Initializes services and exposes necessary functions to global scope
 * for compatibility with existing UI code in index.html.
 */

// Initialize SyncManager with saved script URL
const scriptUrl = localStorage.getItem('scriptUrl') || '';
const syncManager = new SyncManager({ scriptUrl });

// Expose syncManager to global scope for UI code
window.syncManager = syncManager;

/**
 * Update connection UI elements
 * @param {boolean} online - Is online
 * @param {string} text - Status text
 */
function updateConnectionUI(online, text) {
  const dot = document.getElementById('connectionDot');
  const textEl = document.getElementById('connectionText');
  const dotSessions = document.getElementById('connectionDotSessions');
  const textSessions = document.getElementById('connectionTextSessions');

  const className = online ? 'status-dot online' : 'status-dot offline';
  if (dot) dot.className = className;
  if (dotSessions) dotSessions.className = className;
  if (textEl) textEl.textContent = text;
  if (textSessions) textSessions.textContent = text;
}

// Register connection change listener
syncManager.onConnectionChange((online, text) => {
  updateConnectionUI(online, text);

  // Update settings modal status if visible
  const sheetsStatus = document.getElementById('sheetsStatus');
  if (sheetsStatus) {
    sheetsStatus.textContent = online ? 'Подключено ✓' : 'Нет соединения';
  }
});

/**
 * Check connection and perform initial sync.
 * Called from index.html on DOMContentLoaded.
 */
window.checkConnectionAndSync = async function () {
  const isOnline = await syncManager.checkConnection();

  if (isOnline) {
    // Get current local data from global variables (defined in index.html)
    const localClients = window.clients || [];
    const localSessions = window.sessions || [];

    const merged = await syncManager.sync(localClients, localSessions);

    if (merged) {
      // Update global data
      window.clients = merged.clients;
      window.sessions = merged.sessions;

      // Save to localStorage
      if (typeof window.saveLocalData === 'function') {
        window.saveLocalData();
      }

      // Re-render UI
      if (typeof window.renderAll === 'function') {
        window.renderAll();
      }
    }
  }
};

/**
 * Push a change to Google Sheets with queue fallback.
 * Replaces the old pushToSheets function.
 * @param {string} action - Action type
 * @param {Object} data - Data to push
 */
window.pushToSheets = async function (action, data) {
  const result = await syncManager.pushChange(action, data);

  if (result.queued && !result.success) {
    if (syncManager.isOnline) {
      window.showToast?.('Сохранено локально, синхронизируется позже');
    } else {
      window.showToast?.('Офлайн: сохранено локально');
    }
  }

  // Update sync queue UI
  if (typeof window.updateSyncQueueUI === 'function') {
    window.updateSyncQueueUI();
  }
};

/**
 * Track a deleted item to prevent resurrection during sync.
 * @param {'clients'|'sessions'} type
 * @param {string} id
 */
window.trackDeleted = function (type, id) {
  syncManager.trackDeleted(type, id);
};

/**
 * Force sync queue processing.
 * Called from the "Sync Now" button.
 */
window.forceSyncNow = async function () {
  if (!syncManager.isConfigured) {
    window.showToast?.('Сначала настройте Google Sheets');
    return;
  }

  // Check connection first
  const isOnline = await syncManager.checkConnection();

  if (!isOnline) {
    window.showToast?.('Нет соединения');
    return;
  }

  // Get current local data
  const localClients = window.clients || [];
  const localSessions = window.sessions || [];

  // Force process queue
  const queueResult = await syncManager.forceProcessQueue();

  // Perform full sync
  const merged = await syncManager.sync(localClients, localSessions);

  if (merged) {
    window.clients = merged.clients;
    window.sessions = merged.sessions;

    if (typeof window.saveLocalData === 'function') {
      window.saveLocalData();
    }

    if (typeof window.renderAll === 'function') {
      window.renderAll();
    }
  }

  // Update UI
  if (typeof window.updateSyncQueueUI === 'function') {
    window.updateSyncQueueUI();
  }

  if (syncManager.queueLength === 0) {
    window.showToast?.('Синхронизация завершена');
  } else {
    window.showToast?.(`Осталось в очереди: ${syncManager.queueLength}`);
  }
};

/**
 * Get current sync queue length.
 * Used by UI to display queue status.
 * @returns {number}
 */
window.getSyncQueueLength = function () {
  return syncManager.queueLength;
};

/**
 * Update script URL in sync manager.
 * Called when settings are saved.
 * @param {string} url
 */
window.updateSyncScriptUrl = function (url) {
  syncManager.setScriptUrl(url);
};

/**
 * Clear sync queue.
 * @deprecated Use with caution
 */
window.clearSyncQueue = function () {
  syncManager.clearQueue();
};

// Setup online/offline event listeners
window.addEventListener('online', () => {
  console.log('Network online');
  syncManager.checkConnection().then((isOnline) => {
    if (isOnline) {
      // Auto-sync when coming back online
      const localClients = window.clients || [];
      const localSessions = window.sessions || [];
      syncManager.sync(localClients, localSessions).then((merged) => {
        if (merged) {
          window.clients = merged.clients;
          window.sessions = merged.sessions;
          window.saveLocalData?.();
          window.renderAll?.();
        }
      });
    }
  });
});

window.addEventListener('offline', () => {
  console.log('Network offline');
  updateConnectionUI(false, 'Офлайн режим');
});

console.log('App.js loaded - SyncManager initialized');
