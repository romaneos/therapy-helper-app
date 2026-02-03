import { GoogleSheetsService } from './GoogleSheetsService.js';
import { SyncQueueService } from './SyncQueueService.js';

/**
 * SyncManager - orchestrates synchronization between local data and Google Sheets.
 *
 * This service is responsible for:
 * - Managing connection state (online/offline)
 * - Coordinating sync operations
 * - Merging remote and local data
 * - Notifying listeners of state changes
 */
export class SyncManager {
  #googleSheets;
  #syncQueue;
  #isOnline;
  #isSyncing;
  #connectionListeners;
  #syncListeners;

  /**
   * @param {Object} config - Configuration object
   * @param {string} config.scriptUrl - Google Apps Script URL
   * @param {number} [config.maxUrlLength] - Max URL length for requests
   */
  constructor(config = {}) {
    this.#googleSheets = new GoogleSheetsService(
      config.scriptUrl || '',
      config.maxUrlLength
    );
    this.#syncQueue = new SyncQueueService();
    this.#isOnline = false;
    this.#isSyncing = false;
    this.#connectionListeners = [];
    this.#syncListeners = [];
  }

  /**
   * Get current online status
   * @returns {boolean}
   */
  get isOnline() {
    return this.#isOnline;
  }

  /**
   * Get current syncing status
   * @returns {boolean}
   */
  get isSyncing() {
    return this.#isSyncing;
  }

  /**
   * Get queue length
   * @returns {number}
   */
  get queueLength() {
    return this.#syncQueue.length;
  }

  /**
   * Check if service is configured
   * @returns {boolean}
   */
  get isConfigured() {
    return this.#googleSheets.isConfigured;
  }

  /**
   * Update script URL
   * @param {string} url
   */
  setScriptUrl(url) {
    this.#googleSheets.scriptUrl = url;
  }

  /**
   * Register a connection state change listener
   * @param {Function} callback - function(isOnline, statusText)
   */
  onConnectionChange(callback) {
    this.#connectionListeners.push(callback);
  }

  /**
   * Register a sync complete listener
   * @param {Function} callback - function(data)
   */
  onSyncComplete(callback) {
    this.#syncListeners.push(callback);
  }

  /**
   * Check connection and update state
   * @returns {Promise<boolean>} - Whether connection is online
   */
  async checkConnection() {
    if (!this.#googleSheets.isConfigured) {
      this.#isOnline = false;
      this.#notifyConnectionChange(false, 'Локальное хранилище');
      return false;
    }

    this.#notifyConnectionChange(false, 'Подключение...');

    const isConnected = await this.#googleSheets.ping();

    if (isConnected) {
      this.#isOnline = true;
      const statusText = this.#getConnectionStatusText();
      this.#notifyConnectionChange(true, statusText);
    } else {
      this.#isOnline = false;
      this.#notifyConnectionChange(false, 'Офлайн режим');
    }

    return this.#isOnline;
  }

  /**
   * Perform full sync cycle: process queue, fetch remote data, merge
   * @param {Array} localClients - Current local clients
   * @param {Array} localSessions - Current local sessions
   * @returns {Promise<{clients: Array, sessions: Array}|null>}
   */
  async sync(localClients, localSessions) {
    if (!this.#isOnline || !this.#googleSheets.isConfigured || this.#isSyncing) {
      return null;
    }

    this.#isSyncing = true;

    try {
      // Process pending queue items first
      await this.#processQueue();

      // Initialize spreadsheet if needed
      await this.#googleSheets.init();

      // Fetch remote data
      const remoteData = await this.#googleSheets.getData();

      if (!remoteData || !remoteData.clients || !remoteData.sessions) {
        console.error('SyncManager: failed to get remote data');
        return null;
      }

      // Merge data
      const merged = this.mergeData(remoteData, localClients, localSessions);

      // Notify listeners
      this.#notifySyncComplete(merged);

      // Update connection status
      this.#notifyConnectionChange(true, this.#getConnectionStatusText());

      return merged;
    } catch (e) {
      console.error('SyncManager: sync failed', e);
      return null;
    } finally {
      this.#isSyncing = false;
    }
  }

  /**
   * Push a single change, with queue fallback if offline
   * @param {string} action - Action type
   * @param {Object} data - Data to push
   * @returns {Promise<{success: boolean, queued: boolean}>}
   */
  async pushChange(action, data) {
    // Always add to queue first
    this.#syncQueue.add(action, data);

    // If online, try to push immediately
    if (this.#isOnline && this.#googleSheets.isConfigured) {
      const success = await this.#executePush(action, data);

      if (success) {
        // Remove from queue on success
        this.#syncQueue.removeById(data.id);
        this.#notifyConnectionChange(true, this.#getConnectionStatusText());
        return { success: true, queued: false };
      } else {
        // Keep in queue, update status
        this.#notifyConnectionChange(true, this.#getConnectionStatusText());
        return { success: false, queued: true };
      }
    }

    return { success: false, queued: true };
  }

  /**
   * Track a deleted item
   * @param {'clients'|'sessions'} type
   * @param {string} id
   */
  trackDeleted(type, id) {
    this.#syncQueue.addDeletedId(type, id);
  }

  /**
   * Force process the sync queue
   * @returns {Promise<{successful: number, failed: number}>}
   */
  async forceProcessQueue() {
    if (!this.#isOnline || this.#isSyncing) {
      return { successful: 0, failed: this.#syncQueue.length };
    }

    const result = await this.#processQueue();
    this.#notifyConnectionChange(true, this.#getConnectionStatusText());
    return result;
  }

  /**
   * Clear the sync queue
   */
  clearQueue() {
    this.#syncQueue.clearAll();
  }

  /**
   * Merge remote data with local data using timestamp-based conflict resolution.
   * Also queues local changes that are newer than remote.
   * @param {Object} remoteData - { clients: Array, sessions: Array }
   * @param {Array} localClients - Local clients
   * @param {Array} localSessions - Local sessions
   * @returns {{clients: Array, sessions: Array}}
   */
  mergeData(remoteData, localClients, localSessions) {
    const localClientMap = new Map(localClients.map((c) => [c.id, c]));
    const localSessionMap = new Map(localSessions.map((s) => [s.id, s]));

    // Filter out items that were deleted locally
    const activeRemoteClients = remoteData.clients.filter(
      (c) => !this.#syncQueue.isDeleted('clients', c.id)
    );
    const activeRemoteSessions = remoteData.sessions.filter(
      (s) => !this.#syncQueue.isDeleted('sessions', s.id)
    );

    // Start with copies of local data
    const mergedClients = [...localClients];
    const mergedSessions = [...localSessions];

    // Merge remote clients
    activeRemoteClients.forEach((remoteClient) => {
      const localClient = localClientMap.get(remoteClient.id);

      if (!localClient) {
        // Remote client doesn't exist locally - add it
        mergedClients.push(remoteClient);
      } else {
        // Compare timestamps, use newer version
        const localTime = new Date(localClient.updatedAt || 0).getTime();
        const remoteTime = new Date(remoteClient.updatedAt || 0).getTime();

        if (remoteTime > localTime) {
          const index = mergedClients.findIndex((c) => c.id === remoteClient.id);
          if (index !== -1) {
            mergedClients[index] = remoteClient;
          }
        }
      }
    });

    // Merge remote sessions
    activeRemoteSessions.forEach((remoteSession) => {
      const localSession = localSessionMap.get(remoteSession.id);

      if (!localSession) {
        // Remote session doesn't exist locally - add it
        mergedSessions.push(remoteSession);
      } else {
        // Compare timestamps, use newer version
        const localTime = new Date(localSession.updatedAt || 0).getTime();
        const remoteTime = new Date(remoteSession.updatedAt || 0).getTime();

        if (remoteTime > localTime) {
          const index = mergedSessions.findIndex(
            (s) => s.id === remoteSession.id
          );
          if (index !== -1) {
            mergedSessions[index] = remoteSession;
          }
        }
      }
    });

    // Queue local items that are newer or don't exist remotely
    localClients.forEach((localClient) => {
      const remoteClient = remoteData.clients.find(
        (c) => c.id === localClient.id
      );

      if (!remoteClient) {
        this.#syncQueue.add('saveClient', localClient);
      } else {
        const localTime = new Date(localClient.updatedAt || 0).getTime();
        const remoteTime = new Date(remoteClient.updatedAt || 0).getTime();

        if (localTime > remoteTime) {
          this.#syncQueue.add('saveClient', localClient);
        }
      }
    });

    localSessions.forEach((localSession) => {
      const remoteSession = remoteData.sessions.find(
        (s) => s.id === localSession.id
      );

      if (!remoteSession) {
        this.#syncQueue.add('saveSession', localSession);
      } else {
        const localTime = new Date(localSession.updatedAt || 0).getTime();
        const remoteTime = new Date(remoteSession.updatedAt || 0).getTime();

        if (localTime > remoteTime) {
          this.#syncQueue.add('saveSession', localSession);
        }
      }
    });

    // Process queue after merge if there are items
    if (!this.#syncQueue.isEmpty && this.#isOnline) {
      setTimeout(() => this.#processQueue(), 100);
    }

    return { clients: mergedClients, sessions: mergedSessions };
  }

  /**
   * Process all items in the sync queue
   * @returns {Promise<{successful: number, failed: number}>}
   */
  async #processQueue() {
    if (this.#syncQueue.isEmpty || !this.#isOnline) {
      return { successful: 0, failed: 0 };
    }

    console.log(`SyncManager: processing ${this.#syncQueue.length} queue items`);

    const result = await this.#syncQueue.process(async (item) => {
      return this.#executePush(item.action, item.data);
    });

    if (result.failed.length > 0) {
      console.log(
        `SyncManager: ${result.failed.length} items failed, will retry later`
      );
    }

    return {
      successful: result.successful.length,
      failed: result.failed.length
    };
  }

  /**
   * Execute a push operation based on action type
   * @param {string} action
   * @param {Object} data
   * @returns {Promise<boolean>}
   */
  async #executePush(action, data) {
    switch (action) {
      case 'saveClient':
        return this.#googleSheets.saveClient(data);
      case 'saveSession':
        return this.#googleSheets.saveSession(data);
      case 'deleteClient':
        return this.#googleSheets.deleteClient(data.id);
      case 'deleteSession':
        return this.#googleSheets.deleteSession(data.id);
      case 'syncAll':
        return this.#googleSheets.syncAll(data);
      default:
        console.error('SyncManager: unknown action', action);
        return false;
    }
  }

  /**
   * Get connection status text
   * @returns {string}
   */
  #getConnectionStatusText() {
    if (!this.#isOnline) {
      return 'Офлайн режим';
    }

    if (this.#syncQueue.length > 0) {
      return `Google Sheets (очередь: ${this.#syncQueue.length})`;
    }

    return 'Google Sheets подключён';
  }

  /**
   * Notify all connection listeners
   * @param {boolean} isOnline
   * @param {string} statusText
   */
  #notifyConnectionChange(isOnline, statusText) {
    this.#connectionListeners.forEach((callback) => {
      try {
        callback(isOnline, statusText);
      } catch (e) {
        console.error('SyncManager: connection listener error', e);
      }
    });
  }

  /**
   * Notify all sync complete listeners
   * @param {Object} data
   */
  #notifySyncComplete(data) {
    this.#syncListeners.forEach((callback) => {
      try {
        callback(data);
      } catch (e) {
        console.error('SyncManager: sync listener error', e);
      }
    });
  }
}
