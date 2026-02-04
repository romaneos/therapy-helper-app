import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SyncQueueService } from '../SyncQueueService.js';

describe('SyncQueueService', () => {
  let service;
  let mockLocalStorage;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      store: {},
      getItem: jest.fn((key) => mockLocalStorage.store[key] || null),
      setItem: jest.fn((key, value) => {
        mockLocalStorage.store[key] = value;
      }),
      removeItem: jest.fn((key) => {
        delete mockLocalStorage.store[key];
      }),
      clear: jest.fn(() => {
        mockLocalStorage.store = {};
      })
    };

    global.localStorage = mockLocalStorage;

    service = new SyncQueueService('test_queue', 'test_deleted');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Constructor & Properties
  // ============================================

  describe('constructor and properties', () => {
    test('creates empty queue on fresh start', () => {
      expect(service.length).toBe(0);
      expect(service.isEmpty).toBe(true);
    });

    test('loads existing queue from localStorage', () => {
      const existingQueue = [
        { action: 'saveClient', data: { id: 'c1', name: 'Test' }, timestamp: '2024-01-01' }
      ];
      mockLocalStorage.store['existing_queue'] = JSON.stringify(existingQueue);

      const loadedService = new SyncQueueService('existing_queue', 'existing_deleted');

      expect(loadedService.length).toBe(1);
      expect(loadedService.isEmpty).toBe(false);
    });

    test('loads existing deleted IDs from localStorage', () => {
      const existingDeleted = { clients: ['c1', 'c2'], sessions: ['s1'] };
      mockLocalStorage.store['existing_deleted'] = JSON.stringify(existingDeleted);

      const loadedService = new SyncQueueService('existing_queue', 'existing_deleted');

      expect(loadedService.isDeleted('clients', 'c1')).toBe(true);
      expect(loadedService.isDeleted('clients', 'c2')).toBe(true);
      expect(loadedService.isDeleted('sessions', 's1')).toBe(true);
      expect(loadedService.isDeleted('sessions', 's2')).toBe(false);
    });

    test('handles corrupted localStorage data gracefully', () => {
      mockLocalStorage.store['corrupted_queue'] = 'not valid json';

      const loadedService = new SyncQueueService('corrupted_queue', 'corrupted_deleted');

      expect(loadedService.length).toBe(0);
      expect(loadedService.isEmpty).toBe(true);
    });

    test('uses default storage keys when not provided', () => {
      const defaultService = new SyncQueueService();

      defaultService.add('saveClient', { id: 'c1', name: 'Test' });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'therapy_sync_queue',
        expect.any(String)
      );
    });
  });

  // ============================================
  // add()
  // ============================================

  describe('add()', () => {
    test('adds item to queue', () => {
      service.add('saveClient', { id: 'c1', name: 'Test Client' });

      expect(service.length).toBe(1);
      expect(service.isEmpty).toBe(false);
    });

    test('adds timestamp to queue item', () => {
      service.add('saveClient', { id: 'c1', name: 'Test' });

      const items = service.getAll();
      expect(items[0].timestamp).toBeDefined();
    });

    test('deduplicates items with same ID', () => {
      service.add('saveClient', { id: 'c1', name: 'Version 1' });
      service.add('saveClient', { id: 'c1', name: 'Version 2' });
      service.add('saveClient', { id: 'c1', name: 'Version 3' });

      expect(service.length).toBe(1);

      const items = service.getAll();
      expect(items[0].data.name).toBe('Version 3');
    });

    test('keeps items with different IDs', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });
      service.add('saveSession', { id: 's1', clientId: 'c1' });

      expect(service.length).toBe(3);
    });

    test('persists queue to localStorage', () => {
      service.add('saveClient', { id: 'c1', name: 'Test' });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test_queue',
        expect.any(String)
      );

      const savedQueue = JSON.parse(mockLocalStorage.store['test_queue']);
      expect(savedQueue).toHaveLength(1);
      expect(savedQueue[0].action).toBe('saveClient');
    });

    test('handles items without ID', () => {
      service.add('syncAll', { clients: [], sessions: [] });

      expect(service.length).toBe(1);
    });
  });

  // ============================================
  // removeById()
  // ============================================

  describe('removeById()', () => {
    test('removes item by data ID', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });

      service.removeById('c1');

      expect(service.length).toBe(1);
      const items = service.getAll();
      expect(items[0].data.id).toBe('c2');
    });

    test('does nothing if ID not found', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });

      service.removeById('nonexistent');

      expect(service.length).toBe(1);
    });

    test('persists change to localStorage', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      jest.clearAllMocks();

      service.removeById('c1');

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });

  // ============================================
  // removeItems()
  // ============================================

  describe('removeItems()', () => {
    test('removes multiple items at once', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });
      service.add('saveClient', { id: 'c3', name: 'Client 3' });

      const itemsToRemove = [
        { data: { id: 'c1' } },
        { data: { id: 'c3' } }
      ];

      service.removeItems(itemsToRemove);

      expect(service.length).toBe(1);
      const items = service.getAll();
      expect(items[0].data.id).toBe('c2');
    });

    test('handles empty array', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });

      service.removeItems([]);

      expect(service.length).toBe(1);
    });
  });

  // ============================================
  // clear() and clearAll()
  // ============================================

  describe('clear() and clearAll()', () => {
    test('clear() removes all queue items', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });
      service.addDeletedId('clients', 'c3');

      service.clear();

      expect(service.length).toBe(0);
      expect(service.isEmpty).toBe(true);
      // Deleted IDs should remain
      expect(service.isDeleted('clients', 'c3')).toBe(true);
    });

    test('clearAll() removes queue and deleted IDs', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.addDeletedId('clients', 'c2');
      service.addDeletedId('sessions', 's1');

      service.clearAll();

      expect(service.length).toBe(0);
      expect(service.isDeleted('clients', 'c2')).toBe(false);
      expect(service.isDeleted('sessions', 's1')).toBe(false);
    });
  });

  // ============================================
  // getAll()
  // ============================================

  describe('getAll()', () => {
    test('returns copy of queue items', () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });

      const items = service.getAll();
      items.push({ action: 'fake', data: {} });

      expect(service.length).toBe(1);
    });

    test('returns empty array for empty queue', () => {
      const items = service.getAll();

      expect(items).toEqual([]);
    });
  });

  // ============================================
  // Deleted IDs Tracking
  // ============================================

  describe('deleted IDs tracking', () => {
    test('addDeletedId() tracks deleted client', () => {
      service.addDeletedId('clients', 'c1');

      expect(service.isDeleted('clients', 'c1')).toBe(true);
      expect(service.isDeleted('clients', 'c2')).toBe(false);
    });

    test('addDeletedId() tracks deleted session', () => {
      service.addDeletedId('sessions', 's1');

      expect(service.isDeleted('sessions', 's1')).toBe(true);
    });

    test('addDeletedId() does not duplicate IDs', () => {
      service.addDeletedId('clients', 'c1');
      service.addDeletedId('clients', 'c1');
      service.addDeletedId('clients', 'c1');

      const deletedIds = service.getDeletedIds('clients');
      expect(deletedIds).toEqual(['c1']);
    });

    test('getDeletedIds() returns copy of deleted IDs', () => {
      service.addDeletedId('clients', 'c1');

      const deletedIds = service.getDeletedIds('clients');
      deletedIds.push('c2');

      expect(service.isDeleted('clients', 'c2')).toBe(false);
    });

    test('getDeletedIds() returns empty array for unknown type', () => {
      const deletedIds = service.getDeletedIds('unknown');

      expect(deletedIds).toEqual([]);
    });

    test('isDeleted() returns false for unknown type', () => {
      expect(service.isDeleted('unknown', 'x1')).toBe(false);
    });

    test('clearDeletedIds() clears all deleted ID tracking', () => {
      service.addDeletedId('clients', 'c1');
      service.addDeletedId('sessions', 's1');

      service.clearDeletedIds();

      expect(service.isDeleted('clients', 'c1')).toBe(false);
      expect(service.isDeleted('sessions', 's1')).toBe(false);
    });

    test('addDeletedId() creates type array if not exists', () => {
      // Force internal state to not have the type
      service.addDeletedId('newtype', 'x1');

      expect(service.isDeleted('newtype', 'x1')).toBe(true);
    });

    test('persists deleted IDs to localStorage', () => {
      service.addDeletedId('clients', 'c1');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test_deleted',
        expect.any(String)
      );

      const savedDeleted = JSON.parse(mockLocalStorage.store['test_deleted']);
      expect(savedDeleted.clients).toContain('c1');
    });
  });

  // ============================================
  // process()
  // ============================================

  describe('process()', () => {
    test('processes all queue items with handler', async () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });

      const handler = jest.fn().mockResolvedValue(true);

      const result = await service.process(handler);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    test('separates successful and failed items', async () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });
      service.add('saveClient', { id: 'c3', name: 'Client 3' });

      const handler = jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await service.process(handler);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].data.id).toBe('c2');
    });

    test('keeps failed items in queue after processing', async () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });

      const handler = jest.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await service.process(handler);

      expect(service.length).toBe(1);
      const items = service.getAll();
      expect(items[0].data.id).toBe('c2');
    });

    test('handles handler exceptions as failures', async () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      service.add('saveClient', { id: 'c2', name: 'Client 2' });

      const handler = jest.fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await service.process(handler);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });

    test('returns empty result for empty queue', async () => {
      const handler = jest.fn();

      const result = await service.process(handler);

      expect(handler).not.toHaveBeenCalled();
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
    });

    test('persists queue state after processing', async () => {
      service.add('saveClient', { id: 'c1', name: 'Client 1' });
      jest.clearAllMocks();

      await service.process(jest.fn().mockResolvedValue(true));

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test_queue',
        expect.any(String)
      );
    });
  });

  // ============================================
  // localStorage Error Handling
  // ============================================

  describe('localStorage error handling', () => {
    test('handles localStorage.setItem error gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      // Should not throw
      expect(() => {
        service.add('saveClient', { id: 'c1', name: 'Test' });
      }).not.toThrow();
    });

    test('handles localStorage.getItem error gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw, should initialize with empty state
      const errorService = new SyncQueueService('error_queue', 'error_deleted');

      expect(errorService.length).toBe(0);
    });
  });
});
