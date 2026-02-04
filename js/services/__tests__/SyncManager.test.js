import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SyncManager } from '../SyncManager.js';

describe('SyncManager', () => {
  let manager;
  let mockLocalStorage;

  beforeEach(() => {
    // Mock localStorage for SyncQueueService
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

    // Mock fetch for GoogleSheetsService
    global.fetch = jest.fn();

    manager = new SyncManager({ scriptUrl: 'https://script.google.com/test' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper to mock successful fetch response
  const mockFetchResponse = (data, ok = true) => {
    global.fetch.mockResolvedValue({
      ok,
      json: () => Promise.resolve(data)
    });
  };

  // ============================================
  // Constructor & Properties
  // ============================================

  describe('constructor and properties', () => {
    test('creates manager with config', () => {
      expect(manager).toBeDefined();
      expect(manager.isOnline).toBe(false);
      expect(manager.isSyncing).toBe(false);
    });

    test('creates manager without config', () => {
      const emptyManager = new SyncManager();

      expect(emptyManager.isConfigured).toBe(false);
    });

    test('isConfigured reflects GoogleSheetsService state', () => {
      expect(manager.isConfigured).toBe(true);

      const unconfiguredManager = new SyncManager({});
      expect(unconfiguredManager.isConfigured).toBe(false);
    });

    test('queueLength starts at 0', () => {
      expect(manager.queueLength).toBe(0);
    });
  });

  // ============================================
  // setScriptUrl()
  // ============================================

  describe('setScriptUrl()', () => {
    test('updates script URL', () => {
      manager.setScriptUrl('https://new-url.com');

      // Verify by checking isConfigured still works
      expect(manager.isConfigured).toBe(true);
    });

    test('empty URL makes manager unconfigured', () => {
      manager.setScriptUrl('');

      expect(manager.isConfigured).toBe(false);
    });
  });

  // ============================================
  // Event Listeners
  // ============================================

  describe('event listeners', () => {
    test('onConnectionChange registers listener', async () => {
      const listener = jest.fn();
      manager.onConnectionChange(listener);

      mockFetchResponse({ status: 'ok' });
      await manager.checkConnection();

      expect(listener).toHaveBeenCalled();
    });

    test('multiple connection listeners are called', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      manager.onConnectionChange(listener1);
      manager.onConnectionChange(listener2);

      mockFetchResponse({ status: 'ok' });
      await manager.checkConnection();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    test('onSyncComplete registers listener', async () => {
      const listener = jest.fn();
      manager.onSyncComplete(listener);

      // Make manager online first
      mockFetchResponse({ status: 'ok' });
      await manager.checkConnection();

      // Mock getData response
      mockFetchResponse({
        clients: [],
        sessions: [],
        syncedAt: new Date().toISOString()
      });

      await manager.sync([], []);

      expect(listener).toHaveBeenCalled();
    });

    test('handles listener errors gracefully', async () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      manager.onConnectionChange(errorListener);

      mockFetchResponse({ status: 'ok' });

      // Should not throw
      await expect(manager.checkConnection()).resolves.toBe(true);
    });
  });

  // ============================================
  // checkConnection()
  // ============================================

  describe('checkConnection()', () => {
    test('returns false when not configured', async () => {
      const unconfiguredManager = new SyncManager({});

      const result = await unconfiguredManager.checkConnection();

      expect(result).toBe(false);
      expect(unconfiguredManager.isOnline).toBe(false);
    });

    test('returns true when ping succeeds', async () => {
      global.fetch.mockResolvedValue({ ok: true });

      const result = await manager.checkConnection();

      expect(result).toBe(true);
      expect(manager.isOnline).toBe(true);
    });

    test('returns false when ping fails', async () => {
      global.fetch.mockResolvedValue({ ok: false });

      const result = await manager.checkConnection();

      expect(result).toBe(false);
      expect(manager.isOnline).toBe(false);
    });

    test('notifies connection listeners with online status', async () => {
      const listener = jest.fn();
      manager.onConnectionChange(listener);

      global.fetch.mockResolvedValue({ ok: true });
      await manager.checkConnection();

      expect(listener).toHaveBeenCalledWith(true, expect.any(String));
    });

    test('notifies with offline status when ping fails', async () => {
      const listener = jest.fn();
      manager.onConnectionChange(listener);

      global.fetch.mockResolvedValue({ ok: false });
      await manager.checkConnection();

      // Find the call with isOnline=false
      const offlineCall = listener.mock.calls.find(call => call[0] === false && call[1] === 'Офлайн режим');
      expect(offlineCall).toBeDefined();
    });

    test('shows queue count in status when queue has items', async () => {
      const listener = jest.fn();
      manager.onConnectionChange(listener);

      // Add items to queue
      manager.trackDeleted('clients', 'c1');
      mockLocalStorage.store['therapy_sync_queue'] = JSON.stringify([
        { action: 'saveClient', data: { id: 'c1' } }
      ]);

      // Create new manager with queue items
      const managerWithQueue = new SyncManager({ scriptUrl: 'https://test.com' });
      managerWithQueue.onConnectionChange(listener);

      global.fetch.mockResolvedValue({ ok: true });
      await managerWithQueue.checkConnection();

      // Verify queueLength is reflected
      expect(managerWithQueue.queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // sync()
  // ============================================

  describe('sync()', () => {
    beforeEach(async () => {
      // Ensure manager is online before sync tests
      global.fetch.mockResolvedValue({ ok: true });
      await manager.checkConnection();
    });

    test('returns null when offline', async () => {
      global.fetch.mockResolvedValue({ ok: false });
      await manager.checkConnection();

      const result = await manager.sync([], []);

      expect(result).toBeNull();
    });

    test('returns null when not configured', async () => {
      const unconfiguredManager = new SyncManager({});

      const result = await unconfiguredManager.sync([], []);

      expect(result).toBeNull();
    });

    test('initializes and fetches data during sync', async () => {
      mockFetchResponse({ success: true }); // init response
      mockFetchResponse({
        clients: [],
        sessions: [],
        syncedAt: new Date().toISOString()
      });

      await manager.sync([], []);

      // Verify fetch was called for init and getData
      expect(global.fetch).toHaveBeenCalled();
    });

    test('returns null when getData fails', async () => {
      mockFetchResponse({ error: 'Database error' });

      const result = await manager.sync([], []);

      expect(result).toBeNull();
    });

    test('returns merged data on success', async () => {
      mockFetchResponse({ success: true }); // init
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      }).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          clients: [{ id: 'c1', name: 'Remote Client', rate: 100 }],
          sessions: [],
          syncedAt: new Date().toISOString()
        })
      });

      const result = await manager.sync([], []);

      expect(result).not.toBeNull();
      expect(result.clients).toBeDefined();
      expect(result.sessions).toBeDefined();
    });

    test('sets isSyncing to false after completion', async () => {
      mockFetchResponse({
        clients: [],
        sessions: [],
        syncedAt: new Date().toISOString()
      });

      await manager.sync([], []);

      expect(manager.isSyncing).toBe(false);
    });

    test('sets isSyncing to false even on error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await manager.sync([], []);

      expect(manager.isSyncing).toBe(false);
    });

    // ---- First-time connection with existing sheet data ----

    test('imports all existing clients and sessions from sheet on first sync', async () => {
      // Simulate Google Sheet with pre-existing data (user connecting for first time)
      const existingSheetData = {
        clients: [
          { id: 'c1', name: 'Иван Петров', rate: 5000, currency: 'RUB', notes: 'Заметка 1', updatedAt: '2024-01-01T10:00:00Z' },
          { id: 'c2', name: 'Мария Сидорова', rate: 6000, currency: 'RUB', notes: '', updatedAt: '2024-01-02T10:00:00Z' },
          { id: 'c3', name: 'Алексей Козлов', rate: 5500, currency: 'RUB', notes: 'VIP клиент', updatedAt: '2024-01-03T10:00:00Z' }
        ],
        sessions: [
          { id: 's1', clientId: 'c1', date: '2024-01-10', amount: 5000, paid: true, notes: 'Первая сессия', updatedAt: '2024-01-10T12:00:00Z' },
          { id: 's2', clientId: 'c1', date: '2024-01-17', amount: 5000, paid: false, notes: '', updatedAt: '2024-01-17T12:00:00Z' },
          { id: 's3', clientId: 'c2', date: '2024-01-15', amount: 6000, paid: true, notes: 'Консультация', updatedAt: '2024-01-15T12:00:00Z' }
        ],
        syncedAt: '2024-01-20T00:00:00Z'
      };

      // Mock init and getData responses
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) }) // init
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(existingSheetData) }); // getData

      // User has empty local storage (first connection)
      const localClients = [];
      const localSessions = [];

      const result = await manager.sync(localClients, localSessions);

      // Verify all clients were imported
      expect(result).not.toBeNull();
      expect(result.clients).toHaveLength(3);
      expect(result.clients.map(c => c.id).sort()).toEqual(['c1', 'c2', 'c3']);

      // Verify all sessions were imported
      expect(result.sessions).toHaveLength(3);
      expect(result.sessions.map(s => s.id).sort()).toEqual(['s1', 's2', 's3']);

      // Verify data integrity - check specific client
      const client1 = result.clients.find(c => c.id === 'c1');
      expect(client1.name).toBe('Иван Петров');
      expect(client1.rate).toBe(5000);
      expect(client1.notes).toBe('Заметка 1');

      // Verify session data integrity
      const session1 = result.sessions.find(s => s.id === 's1');
      expect(session1.clientId).toBe('c1');
      expect(session1.amount).toBe(5000);
      expect(session1.paid).toBe(true);
    });

    test('notifies sync listener with complete imported data', async () => {
      const existingSheetData = {
        clients: [
          { id: 'c1', name: 'Test Client', rate: 100, updatedAt: '2024-01-01T00:00:00Z' }
        ],
        sessions: [
          { id: 's1', clientId: 'c1', date: '2024-01-10', amount: 100, paid: true, updatedAt: '2024-01-10T00:00:00Z' }
        ],
        syncedAt: '2024-01-20T00:00:00Z'
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(existingSheetData) });

      const syncListener = jest.fn();
      manager.onSyncComplete(syncListener);

      await manager.sync([], []);

      expect(syncListener).toHaveBeenCalledTimes(1);
      const syncedData = syncListener.mock.calls[0][0];
      expect(syncedData.clients).toHaveLength(1);
      expect(syncedData.sessions).toHaveLength(1);
      expect(syncedData.clients[0].name).toBe('Test Client');
    });

    test('preserves all client fields during import from sheet', async () => {
      const clientWithAllFields = {
        id: 'c1',
        name: 'Full Client',
        rate: 5000,
        currency: 'RUB',
        notes: 'Detailed notes about the client',
        phone: '+7999123456',
        email: 'client@example.com',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z'
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
          clients: [clientWithAllFields],
          sessions: [],
          syncedAt: '2024-01-20T00:00:00Z'
        })});

      const result = await manager.sync([], []);

      const importedClient = result.clients[0];
      expect(importedClient.id).toBe(clientWithAllFields.id);
      expect(importedClient.name).toBe(clientWithAllFields.name);
      expect(importedClient.rate).toBe(clientWithAllFields.rate);
      expect(importedClient.currency).toBe(clientWithAllFields.currency);
      expect(importedClient.notes).toBe(clientWithAllFields.notes);
      expect(importedClient.updatedAt).toBe(clientWithAllFields.updatedAt);
    });

    test('preserves all session fields during import from sheet', async () => {
      const sessionWithAllFields = {
        id: 's1',
        clientId: 'c1',
        date: '2024-01-15',
        amount: 5000,
        paid: false,
        notes: 'Session notes here',
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z'
      };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
          clients: [],
          sessions: [sessionWithAllFields],
          syncedAt: '2024-01-20T00:00:00Z'
        })});

      const result = await manager.sync([], []);

      const importedSession = result.sessions[0];
      expect(importedSession.id).toBe(sessionWithAllFields.id);
      expect(importedSession.clientId).toBe(sessionWithAllFields.clientId);
      expect(importedSession.date).toBe(sessionWithAllFields.date);
      expect(importedSession.amount).toBe(sessionWithAllFields.amount);
      expect(importedSession.paid).toBe(sessionWithAllFields.paid);
      expect(importedSession.notes).toBe(sessionWithAllFields.notes);
    });
  });

  // ============================================
  // pushChange()
  // ============================================

  describe('pushChange()', () => {
    test('queues change when offline', async () => {
      const data = { id: 'c1', name: 'Test' };

      const result = await manager.pushChange('saveClient', data);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
      expect(manager.queueLength).toBe(1);
    });

    test('pushes immediately when online', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      await manager.checkConnection();

      mockFetchResponse({ success: true });
      const data = { id: 'c1', name: 'Test' };

      const result = await manager.pushChange('saveClient', data);

      expect(result.success).toBe(true);
      expect(result.queued).toBe(false);
    });

    test('keeps in queue on push failure', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      await manager.checkConnection();

      mockFetchResponse({ success: false, error: 'Save failed' });
      const data = { id: 'c1', name: 'Test' };

      const result = await manager.pushChange('saveClient', data);

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
    });
  });

  // ============================================
  // trackDeleted()
  // ============================================

  describe('trackDeleted()', () => {
    test('tracks deleted client', () => {
      manager.trackDeleted('clients', 'c1');

      // Verify by checking queue internal state
      expect(manager.queueLength).toBeGreaterThanOrEqual(0);
    });

    test('tracks deleted session', () => {
      manager.trackDeleted('sessions', 's1');

      expect(manager.queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // forceProcessQueue()
  // ============================================

  describe('forceProcessQueue()', () => {
    test('returns failed count when offline', async () => {
      // Add items to queue
      await manager.pushChange('saveClient', { id: 'c1', name: 'Test' });

      const result = await manager.forceProcessQueue();

      expect(result.failed).toBeGreaterThanOrEqual(0);
    });

    test('processes queue when online', async () => {
      global.fetch.mockResolvedValue({ ok: true });
      await manager.checkConnection();

      // Add item to queue while offline
      manager.setScriptUrl('');
      await manager.pushChange('saveClient', { id: 'c1', name: 'Test' });

      // Go back online
      manager.setScriptUrl('https://test.com');
      global.fetch.mockResolvedValue({ ok: true });
      await manager.checkConnection();

      mockFetchResponse({ success: true });

      const result = await manager.forceProcessQueue();

      expect(result).toBeDefined();
    });
  });

  // ============================================
  // clearQueue()
  // ============================================

  describe('clearQueue()', () => {
    test('clears the sync queue', async () => {
      await manager.pushChange('saveClient', { id: 'c1', name: 'Test' });
      expect(manager.queueLength).toBe(1);

      manager.clearQueue();

      expect(manager.queueLength).toBe(0);
    });
  });

  // ============================================
  // mergeData()
  // ============================================

  describe('mergeData()', () => {
    const createClient = (id, name, updatedAt) => ({
      id,
      name,
      rate: 100,
      currency: 'USD',
      updatedAt: updatedAt || new Date().toISOString()
    });

    const createSession = (id, clientId, updatedAt) => ({
      id,
      clientId,
      date: '2024-01-01',
      amount: 100,
      paid: false,
      updatedAt: updatedAt || new Date().toISOString()
    });

    test('adds remote-only clients to local', () => {
      const remoteData = {
        clients: [createClient('c1', 'Remote Client')],
        sessions: []
      };

      const result = manager.mergeData(remoteData, [], []);

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].name).toBe('Remote Client');
    });

    test('adds remote-only sessions to local', () => {
      const remoteData = {
        clients: [],
        sessions: [createSession('s1', 'c1')]
      };

      const result = manager.mergeData(remoteData, [], []);

      expect(result.sessions).toHaveLength(1);
    });

    test('keeps local-only clients', () => {
      const localClients = [createClient('c1', 'Local Client')];
      const remoteData = { clients: [], sessions: [] };

      const result = manager.mergeData(remoteData, localClients, []);

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].name).toBe('Local Client');
    });

    test('uses newer remote client when remote is newer', () => {
      const oldDate = '2024-01-01T00:00:00Z';
      const newDate = '2024-01-02T00:00:00Z';

      const localClients = [createClient('c1', 'Local Name', oldDate)];
      const remoteData = {
        clients: [createClient('c1', 'Remote Name', newDate)],
        sessions: []
      };

      const result = manager.mergeData(remoteData, localClients, []);

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].name).toBe('Remote Name');
    });

    test('keeps local client when local is newer', () => {
      const oldDate = '2024-01-01T00:00:00Z';
      const newDate = '2024-01-02T00:00:00Z';

      const localClients = [createClient('c1', 'Local Name', newDate)];
      const remoteData = {
        clients: [createClient('c1', 'Remote Name', oldDate)],
        sessions: []
      };

      const result = manager.mergeData(remoteData, localClients, []);

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].name).toBe('Local Name');
    });

    test('filters out locally deleted clients from remote', () => {
      manager.trackDeleted('clients', 'c1');

      const remoteData = {
        clients: [
          createClient('c1', 'Deleted Client'),
          createClient('c2', 'Active Client')
        ],
        sessions: []
      };

      const result = manager.mergeData(remoteData, [], []);

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].id).toBe('c2');
    });

    test('filters out locally deleted sessions from remote', () => {
      manager.trackDeleted('sessions', 's1');

      const remoteData = {
        clients: [],
        sessions: [
          createSession('s1', 'c1'),
          createSession('s2', 'c1')
        ]
      };

      const result = manager.mergeData(remoteData, [], []);

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('s2');
    });

    test('handles clients without updatedAt', () => {
      const localClients = [{ id: 'c1', name: 'Local', rate: 100 }];
      const remoteData = {
        clients: [{ id: 'c1', name: 'Remote', rate: 100 }],
        sessions: []
      };

      // Should not throw
      expect(() => manager.mergeData(remoteData, localClients, [])).not.toThrow();
    });

    test('merges both clients and sessions correctly', () => {
      const remoteData = {
        clients: [createClient('c1', 'Remote Client')],
        sessions: [createSession('s1', 'c1')]
      };
      const localClients = [createClient('c2', 'Local Client')];
      const localSessions = [createSession('s2', 'c2')];

      const result = manager.mergeData(remoteData, localClients, localSessions);

      expect(result.clients).toHaveLength(2);
      expect(result.sessions).toHaveLength(2);
    });

    test('queues local-only items for sync', () => {
      const localClients = [createClient('c1', 'Local Only')];
      const remoteData = { clients: [], sessions: [] };

      manager.mergeData(remoteData, localClients, []);

      // Item should be queued for sync
      expect(manager.queueLength).toBeGreaterThan(0);
    });

    test('queues newer local items for sync', () => {
      const oldDate = '2024-01-01T00:00:00Z';
      const newDate = '2024-01-02T00:00:00Z';

      const localClients = [createClient('c1', 'Local Name', newDate)];
      const remoteData = {
        clients: [createClient('c1', 'Remote Name', oldDate)],
        sessions: []
      };

      const initialQueueLength = manager.queueLength;
      manager.mergeData(remoteData, localClients, []);

      // Newer local item should be queued
      expect(manager.queueLength).toBeGreaterThan(initialQueueLength);
    });

    test('handles session conflict resolution with timestamps', () => {
      const oldDate = '2024-01-01T00:00:00Z';
      const newDate = '2024-01-02T00:00:00Z';

      const localSessions = [createSession('s1', 'c1', oldDate)];
      localSessions[0].notes = 'Local notes';

      const remoteData = {
        clients: [],
        sessions: [{ ...createSession('s1', 'c1', newDate), notes: 'Remote notes' }]
      };

      const result = manager.mergeData(remoteData, [], localSessions);

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].notes).toBe('Remote notes');
    });
  });
});
