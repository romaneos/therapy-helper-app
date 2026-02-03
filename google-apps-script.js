/**
 * ============================================
 * GOOGLE APPS SCRIPT ДЛЯ УЧЁТА ТЕРАПИИ
 * ============================================
 * 
 * ИНСТРУКЦИЯ ПО НАСТРОЙКЕ:
 * 
 * 1. Создайте новую Google Таблицу (Google Sheets)
 *    - Перейдите на https://sheets.google.com
 *    - Создайте новую пустую таблицу
 *    - Назовите её, например, "Учёт терапии"
 *    - Листы и заголовки создадутся автоматически!
 * 
 * 2. Откройте редактор скриптов:
 *    - Меню "Расширения" → "Apps Script"
 *    - Удалите весь код по умолчанию
 *    - Вставьте весь код из этого файла
 *    - Сохраните (Ctrl+S)
 * 
 * 3. Разверните веб-приложение:
 *    - Нажмите "Развернуть" → "Новое развёртывание"
 *    - Тип: "Веб-приложение"
 *    - Описание: "Therapy API" (любое)
 *    - Выполнять как: "Я"
 *    - Кто имеет доступ: "Все"
 *    - Нажмите "Развернуть"
 *    - Разрешите доступ (Google покажет предупреждение)
 *    - Скопируйте URL веб-приложения
 * 
 * 4. Вставьте URL в настройках приложения на телефоне
 * 
 * ВАЖНО: После изменения кода нужно создать НОВОЕ развёртывание!
 * 
 * ============================================
 */

// ID вашей таблицы (можно оставить пустым - будет использована активная)
const SPREADSHEET_ID = '';

// Названия листов
const CLIENTS_SHEET_NAME = 'Клиенты';
const SESSIONS_SHEET_NAME = 'Сессии';

// Заголовки для листов (currency добавлен для клиентов)
const CLIENTS_HEADERS = ['id', 'name', 'rate', 'currency', 'notes', 'createdAt', 'updatedAt'];
const SESSIONS_HEADERS = ['id', 'clientId', 'date', 'amount', 'paid', 'notes', 'createdAt', 'updatedAt'];

/**
 * Получение таблицы
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Инициализация таблицы - создание листов и заголовков
 */
function initializeSpreadsheet() {
  const spreadsheet = getSpreadsheet();
  
  // Создаём или получаем лист "Клиенты"
  let clientsSheet = spreadsheet.getSheetByName(CLIENTS_SHEET_NAME);
  if (!clientsSheet) {
    clientsSheet = spreadsheet.insertSheet(CLIENTS_SHEET_NAME);
    clientsSheet.getRange(1, 1, 1, CLIENTS_HEADERS.length).setValues([CLIENTS_HEADERS]);
    clientsSheet.getRange(1, 1, 1, CLIENTS_HEADERS.length).setFontWeight('bold');
    clientsSheet.setFrozenRows(1);
  } else {
    // Проверяем, есть ли заголовки
    const firstRow = clientsSheet.getRange(1, 1, 1, CLIENTS_HEADERS.length).getValues()[0];
    if (!firstRow[0] || firstRow[0] !== 'id') {
      clientsSheet.insertRowBefore(1);
      clientsSheet.getRange(1, 1, 1, CLIENTS_HEADERS.length).setValues([CLIENTS_HEADERS]);
      clientsSheet.getRange(1, 1, 1, CLIENTS_HEADERS.length).setFontWeight('bold');
      clientsSheet.setFrozenRows(1);
    }
  }
  
  // Создаём или получаем лист "Сессии"
  let sessionsSheet = spreadsheet.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sessionsSheet) {
    sessionsSheet = spreadsheet.insertSheet(SESSIONS_SHEET_NAME);
    sessionsSheet.getRange(1, 1, 1, SESSIONS_HEADERS.length).setValues([SESSIONS_HEADERS]);
    sessionsSheet.getRange(1, 1, 1, SESSIONS_HEADERS.length).setFontWeight('bold');
    sessionsSheet.setFrozenRows(1);
  } else {
    // Проверяем, есть ли заголовки
    const firstRow = sessionsSheet.getRange(1, 1, 1, SESSIONS_HEADERS.length).getValues()[0];
    if (!firstRow[0] || firstRow[0] !== 'id') {
      sessionsSheet.insertRowBefore(1);
      sessionsSheet.getRange(1, 1, 1, SESSIONS_HEADERS.length).setValues([SESSIONS_HEADERS]);
      sessionsSheet.getRange(1, 1, 1, SESSIONS_HEADERS.length).setFontWeight('bold');
      sessionsSheet.setFrozenRows(1);
    }
  }
  
  // Удаляем пустой лист по умолчанию (Sheet1/Лист1) если он есть и пустой
  const defaultSheets = ['Sheet1', 'Лист1', 'Лист 1'];
  defaultSheets.forEach(name => {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0) {
      try {
        spreadsheet.deleteSheet(sheet);
      } catch (e) {
        // Игнорируем ошибку если нельзя удалить последний лист
      }
    }
  });
  
  return { success: true, message: 'Таблица инициализирована' };
}

/**
 * Обработка GET-запросов
 * Примечание: POST запросы с JSON вызывают CORS preflight, который Google Apps Script
 * не поддерживает. Поэтому все операции выполняются через GET с параметрами.
 */
function doGet(e) {
  const action = e.parameter.action || 'getData';
  const dataParam = e.parameter.data;
  
  try {
    let result;
    let data = null;
    
    // Парсим данные если переданы
    if (dataParam) {
      try {
        data = JSON.parse(dataParam);
      } catch (parseError) {
        return createJsonResponse({ error: 'Invalid JSON data' });
      }
    }
    
    switch (action) {
      case 'ping':
        result = { status: 'ok', timestamp: new Date().toISOString() };
        break;
      case 'init':
        result = initializeSpreadsheet();
        break;
      case 'getData':
        result = getAllData();
        break;
      case 'getClients':
        result = getClients();
        break;
      case 'getSessions':
        result = getSessions();
        break;
      // Операции записи (раньше были в POST)
      case 'saveClient':
        if (!data) return createJsonResponse({ error: 'No data provided' });
        result = saveClient(data);
        break;
      case 'saveSession':
        if (!data) return createJsonResponse({ error: 'No data provided' });
        result = saveSession(data);
        break;
      case 'deleteClient':
        if (!data || !data.id) return createJsonResponse({ error: 'No client id provided' });
        result = deleteClient(data.id);
        break;
      case 'deleteSession':
        if (!data || !data.id) return createJsonResponse({ error: 'No session id provided' });
        result = deleteSession(data.id);
        break;
      case 'syncAll':
        if (!data) return createJsonResponse({ error: 'No data provided' });
        result = syncAll(data);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
    
    return createJsonResponse(result);
  } catch (error) {
    return createJsonResponse({ error: error.message });
  }
}

/**
 * Обработка POST-запросов (оставлено для обратной совместимости)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;
    
    switch (action) {
      case 'saveClient':
        result = saveClient(data.data);
        break;
      case 'saveSession':
        result = saveSession(data.data);
        break;
      case 'deleteClient':
        result = deleteClient(data.data.id);
        break;
      case 'deleteSession':
        result = deleteSession(data.data.id);
        break;
      case 'syncAll':
        result = syncAll(data.data);
        break;
      default:
        result = { error: 'Unknown action' };
    }
    
    return createJsonResponse(result);
  } catch (error) {
    return createJsonResponse({ error: error.message });
  }
}

/**
 * Создание JSON-ответа с CORS-заголовками
 */
function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Получение всех данных
 */
function getAllData() {
  // Сначала убеждаемся что таблица инициализирована
  initializeSpreadsheet();
  
  return {
    clients: getClients(),
    sessions: getSessions(),
    syncedAt: new Date().toISOString()
  };
}

/**
 * Получение списка клиентов
 */
function getClients() {
  const sheet = getSpreadsheet().getSheetByName(CLIENTS_SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const clients = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // Пропускаем пустые строки
    
    clients.push({
      id: row[0],
      name: row[1],
      rate: Number(row[2]),
      currency: row[3] || 'USD',
      notes: row[4] || '',
      createdAt: row[5],
      updatedAt: row[6]
    });
  }
  
  return clients;
}

/**
 * Получение списка сессий
 */
function getSessions() {
  const sheet = getSpreadsheet().getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const sessions = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    sessions.push({
      id: row[0],
      clientId: row[1],
      date: formatDateForOutput(row[2]),
      amount: Number(row[3]),
      paid: row[4] === true || row[4] === 'TRUE' || row[4] === 'true',
      notes: row[5] || '',
      createdAt: row[6],
      updatedAt: row[7]
    });
  }
  
  return sessions;
}

/**
 * Форматирование даты для вывода
 */
function formatDateForOutput(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Сохранение клиента
 */
function saveClient(client) {
  // Убеждаемся что таблица инициализирована
  initializeSpreadsheet();
  
  const sheet = getSpreadsheet().getSheetByName(CLIENTS_SHEET_NAME);
  
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  // Ищем существующую запись
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === client.id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  const rowData = [
    client.id,
    client.name,
    client.rate,
    client.currency || 'USD',
    client.notes || '',
    client.createdAt || new Date().toISOString(),
    new Date().toISOString()
  ];
  
  if (rowIndex > 0) {
    // Обновляем существующую запись
    sheet.getRange(rowIndex, 1, 1, 7).setValues([rowData]);
  } else {
    // Добавляем новую запись
    sheet.appendRow(rowData);
  }
  
  return { success: true, client };
}

/**
 * Сохранение сессии
 */
function saveSession(session) {
  // Убеждаемся что таблица инициализирована
  initializeSpreadsheet();
  
  const sheet = getSpreadsheet().getSheetByName(SESSIONS_SHEET_NAME);
  
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  // Ищем существующую запись
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === session.id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  const rowData = [
    session.id,
    session.clientId,
    session.date,
    session.amount,
    session.paid,
    session.notes || '',
    session.createdAt || new Date().toISOString(),
    new Date().toISOString()
  ];
  
  if (rowIndex > 0) {
    // Обновляем существующую запись
    sheet.getRange(rowIndex, 1, 1, 8).setValues([rowData]);
  } else {
    // Добавляем новую запись
    sheet.appendRow(rowData);
  }
  
  return { success: true, session };
}

/**
 * Удаление клиента
 */
function deleteClient(clientId) {
  const sheet = getSpreadsheet().getSheetByName(CLIENTS_SHEET_NAME);
  if (!sheet) return { success: false };
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clientId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  return { success: false, error: 'Client not found' };
}

/**
 * Удаление сессии
 */
function deleteSession(sessionId) {
  const sheet = getSpreadsheet().getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) return { success: false };
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === sessionId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  
  return { success: false, error: 'Session not found' };
}

/**
 * Полная синхронизация (перезапись всех данных)
 */
function syncAll(data) {
  // Убеждаемся что таблица инициализирована
  initializeSpreadsheet();
  
  const spreadsheet = getSpreadsheet();
  
  // Синхронизация клиентов
  const clientsSheet = spreadsheet.getSheetByName(CLIENTS_SHEET_NAME);
  if (clientsSheet && data.clients) {
    // Очищаем данные (оставляем заголовки)
    const lastRow = clientsSheet.getLastRow();
    if (lastRow > 1) {
      clientsSheet.deleteRows(2, lastRow - 1);
    }
    
    // Добавляем новые данные
    data.clients.forEach(client => {
      clientsSheet.appendRow([
        client.id,
        client.name,
        client.rate,
        client.currency || 'USD',
        client.notes || '',
        client.createdAt || new Date().toISOString(),
        client.updatedAt || new Date().toISOString()
      ]);
    });
  }
  
  // Синхронизация сессий
  const sessionsSheet = spreadsheet.getSheetByName(SESSIONS_SHEET_NAME);
  if (sessionsSheet && data.sessions) {
    // Очищаем данные (оставляем заголовки)
    const lastRow = sessionsSheet.getLastRow();
    if (lastRow > 1) {
      sessionsSheet.deleteRows(2, lastRow - 1);
    }
    
    // Добавляем новые данные
    data.sessions.forEach(session => {
      sessionsSheet.appendRow([
        session.id,
        session.clientId,
        session.date,
        session.amount,
        session.paid,
        session.notes || '',
        session.createdAt || new Date().toISOString(),
        session.updatedAt || new Date().toISOString()
      ]);
    });
  }
  
  return { success: true, syncedAt: new Date().toISOString() };
}

/**
 * Функция для тестирования (можно вызвать в редакторе скриптов)
 */
function testInit() {
  const result = initializeSpreadsheet();
  Logger.log(JSON.stringify(result, null, 2));
}

function testGetData() {
  const result = getAllData();
  Logger.log(JSON.stringify(result, null, 2));
}
