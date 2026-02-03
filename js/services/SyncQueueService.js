/**
 * SyncQueueService - manages offline sync queue and deleted items tracking.
 *
 * This service is responsible for:
 * - Queuing changes when offline
 * - Deduplicating queue items by ID
 * - Tracking deleted items to prevent resurrection during merge
 * - Persisting queue state to localStorage
 */
export class SyncQueueService {
  #queue;
  #deletedIds;
  #storageKeyQueue;
  #storageKeyDeleted;

  /**
   * @param {string} storageKeyQueue - localStorage key for queue
   * @param {string} storageKeyDeleted - localStorage key for deleted IDs
   */
  constructor(
    storageKeyQueue = 'therapy_sync_queue',
    storageKeyDeleted = 'therapy_deleted_ids'
  ) {
    this.#storageKeyQueue = storageKeyQueue;
    this.#storageKeyDeleted = storageKeyDeleted;
    this.#queue = [];
    this.#deletedIds = { clients: [], sessions: [] };
    this.#load();
  }

  /**
   * Get the number of items in the queue
   * @returns {number}
   */
  get length() {
    return this.#queue.length;
  }

  /**
   * Check if queue is empty
   * @returns {boolean}
   */
  get isEmpty() {
    return this.#queue.length === 0;
  }

  /**
   * Add an item to the sync queue.
   * Automatically deduplicates by removing previous items with the same data ID.
   * @param {string} action - Action type (saveClient, saveSession, etc.)
   * @param {Object} data - Data to sync
   */
  add(action, data) {
    const id = data.id;

    // Remove previous operations with the same ID to avoid duplicates
    if (id) {
      this.#queue = this.#queue.filter((item) => {
        const itemId = item.data?.id;
        return itemId !== id;
      });
    }

    this.#queue.push({
      action,
      data,
      timestamp: new Date().toISOString()
    });

    this.#save();
  }

  /**
   * Remove an item from the queue by its data ID
   * @param {string} id - Data ID to remove
   */
  removeById(id) {
    this.#queue = this.#queue.filter((item) => {
      const itemId = item.data?.id;
      return itemId !== id;
    });
    this.#save();
  }

  /**
   * Remove specific items from the queue
   * @param {Array} itemsToRemove - Array of queue items to remove
   */
  removeItems(itemsToRemove) {
    const idsToRemove = new Set(itemsToRemove.map((item) => item.data?.id));
    this.#queue = this.#queue.filter((item) => !idsToRemove.has(item.data?.id));
    this.#save();
  }

  /**
   * Clear the entire queue
   */
  clear() {
    this.#queue = [];
    this.#save();
  }

  /**
   * Clear both queue and deleted IDs tracking
   */
  clearAll() {
    this.#queue = [];
    this.#deletedIds = { clients: [], sessions: [] };
    this.#save();
  }

  /**
   * Get all items in the queue
   * @returns {Array}
   */
  getAll() {
    return [...this.#queue];
  }

  /**
   * Track a deleted item ID to prevent resurrection during merge
   * @param {'clients'|'sessions'} type - Entity type
   * @param {string} id - Entity ID
   */
  addDeletedId(type, id) {
    if (!this.#deletedIds[type]) {
      this.#deletedIds[type] = [];
    }

    if (!this.#deletedIds[type].includes(id)) {
      this.#deletedIds[type].push(id);
      this.#save();
    }
  }

  /**
   * Check if an item was deleted locally
   * @param {'clients'|'sessions'} type - Entity type
   * @param {string} id - Entity ID
   * @returns {boolean}
   */
  isDeleted(type, id) {
    return this.#deletedIds[type]?.includes(id) || false;
  }

  /**
   * Get all deleted IDs for a type
   * @param {'clients'|'sessions'} type - Entity type
   * @returns {Array<string>}
   */
  getDeletedIds(type) {
    return [...(this.#deletedIds[type] || [])];
  }

  /**
   * Clear deleted IDs tracking
   */
  clearDeletedIds() {
    this.#deletedIds = { clients: [], sessions: [] };
    this.#save();
  }

  /**
   * Process queue items with a handler function.
   * Returns arrays of successful and failed items.
   * @param {Function} handler - Async function(item) that returns boolean success
   * @returns {Promise<{successful: Array, failed: Array}>}
   */
  async process(handler) {
    const successful = [];
    const failed = [];

    for (const item of this.#queue) {
      try {
        const success = await handler(item);
        if (success) {
          successful.push(item);
        } else {
          failed.push(item);
        }
      } catch (e) {
        console.error('SyncQueueService: process item failed', e);
        failed.push(item);
      }
    }

    // Update queue to only contain failed items
    this.#queue = failed;
    this.#save();

    return { successful, failed };
  }

  /**
   * Load queue state from localStorage
   */
  #load() {
    try {
      const savedQueue = localStorage.getItem(this.#storageKeyQueue);
      const savedDeleted = localStorage.getItem(this.#storageKeyDeleted);

      this.#queue = savedQueue ? JSON.parse(savedQueue) : [];
      this.#deletedIds = savedDeleted
        ? JSON.parse(savedDeleted)
        : { clients: [], sessions: [] };
    } catch (e) {
      console.error('SyncQueueService: failed to load from localStorage', e);
      this.#queue = [];
      this.#deletedIds = { clients: [], sessions: [] };
    }
  }

  /**
   * Save queue state to localStorage
   */
  #save() {
    try {
      localStorage.setItem(this.#storageKeyQueue, JSON.stringify(this.#queue));
      localStorage.setItem(
        this.#storageKeyDeleted,
        JSON.stringify(this.#deletedIds)
      );
    } catch (e) {
      console.error('SyncQueueService: failed to save to localStorage', e);
    }
  }
}
