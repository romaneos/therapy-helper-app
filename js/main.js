        // КОНФИГУРАЦИЯ И ХРАНИЛИЩЕ
        // ============================================
        
        // Configuration (sync-related config moved to js/app.js)
        const CONFIG = {
            STORAGE_KEYS: {
                CLIENTS: 'therapy_clients',
                SESSIONS: 'therapy_sessions',
                SCRIPT_URL: 'scriptUrl',
                EXCHANGE_RATES: 'therapy_exchange_rates'
            },
            CURRENCIES: {
                USD: { symbol: '$', name: 'Доллар США' },
                EUR: { symbol: '€', name: 'Евро' },
                PLN: { symbol: 'zł', name: 'Злотый' }
            }
        };

        // Application state (sync state moved to SyncManager)
        let clients = [];
        let sessions = [];
        let currentScreen = 'sessionsScreen';
        let currentPeriod = 'week';
        let exchangeRates = {
            USD: 1,
            EUR: 0.92,
            PLN: 4.02,
            lastUpdated: null
        };

        // Expose data to global scope for SyncManager access
        window.clients = clients;
        window.sessions = sessions;
        
        // ============================================
        // ИНИЦИАЛИЗАЦИЯ
        // ============================================
        
        document.addEventListener('DOMContentLoaded', () => {
            M.AutoInit();
            const statsCurrency = document.getElementById('statsCurrency');
            if (statsCurrency) M.FormSelect.init(statsCurrency);

            loadLocalData();
            loadExchangeRates();
            setupEventListeners();
            renderAll();
            fetchExchangeRates();

            // Initialize Materialize datepicker
            const dateElems = document.querySelectorAll('.datepicker');
            M.Datepicker.init(dateElems, {
                format: 'yyyy-mm-dd',
                autoClose: true,
                defaultDate: new Date(),
                setDefaultDate: true,
                i18n: {
                    cancel: 'Отмена',
                    done: 'Готово',
                    months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                    monthsShort: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                    weekdays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
                    weekdaysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
                    weekdaysAbbrev: ['В', 'П', 'В', 'С', 'Ч', 'П', 'С']
                }
            });

            // Set default date value for session date
            const today = new Date();
            document.getElementById('sessionDate').value = today.toISOString().split('T')[0];

            // Initialize sync (handled by app.js module)
            // Small delay to ensure module is loaded
            setTimeout(() => {
                if (typeof window.checkConnectionAndSync === 'function') {
                    window.checkConnectionAndSync();
                }
            }, 100);
        });

        function loadLocalData() {
            const savedClients = localStorage.getItem(CONFIG.STORAGE_KEYS.CLIENTS);
            const savedSessions = localStorage.getItem(CONFIG.STORAGE_KEYS.SESSIONS);
            
            clients = savedClients ? JSON.parse(savedClients) : [];
            sessions = savedSessions ? JSON.parse(savedSessions) : [];
        }
        
        function saveLocalData() {
            localStorage.setItem(CONFIG.STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
            localStorage.setItem(CONFIG.STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
            // Keep global references in sync
            window.clients = clients;
            window.sessions = sessions;
        }
        // Expose saveLocalData to global scope for SyncManager
        window.saveLocalData = saveLocalData;

        function loadExchangeRates() {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.EXCHANGE_RATES);
            if (saved) {
                exchangeRates = JSON.parse(saved);
            }
        }
        
        function saveExchangeRates() {
            localStorage.setItem(CONFIG.STORAGE_KEYS.EXCHANGE_RATES, JSON.stringify(exchangeRates));
        }
        
        async function fetchExchangeRates() {
            try {
                // Using exchangerate-api.com free tier (no API key needed for basic usage)
                const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
                if (response.ok) {
                    const data = await response.json();
                    exchangeRates = {
                        USD: 1,
                        EUR: data.rates.EUR,
                        PLN: data.rates.PLN,
                        lastUpdated: new Date().toISOString()
                    };
                    saveExchangeRates();
                    renderStats();
                }
            } catch (e) {
                console.log('Could not fetch exchange rates, using cached values');
            }
        }
        
        function convertCurrency(amount, fromCurrency, toCurrency) {
            if (fromCurrency === toCurrency) return amount;
            
            // Convert to USD first, then to target currency
            const amountInUSD = amount / exchangeRates[fromCurrency] * exchangeRates.USD;
            const result = amountInUSD / exchangeRates.USD * exchangeRates[toCurrency];
            
            return Math.round(result * 100) / 100;
        }
        
        function getCurrencySymbol(currency) {
            return CONFIG.CURRENCIES[currency]?.symbol || currency;
        }
        
        function formatMoneyWithCurrency(amount, currency) {
            return `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} ${getCurrencySymbol(currency)}`;
        }

        // ============================================
        // NAVIGATION
        // ============================================
        
        function setupEventListeners() {
            // Navigation (Materialize bottom tabs)
            document.querySelectorAll('.nav-tab-link').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const screenId = item.dataset.screen;
                    switchScreen(screenId);

                    document.querySelectorAll('.nav-tab-link').forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                });
            });
            
            // Date filters
            document.querySelectorAll('.date-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.date-filter-btn').forEach(b => {
                        b.classList.remove('teal');
                        b.classList.add('grey', 'lighten-2', 'grey-text', 'text-darken-2', 'waves-effect');
                    });
                    btn.classList.remove('grey', 'lighten-2', 'grey-text', 'text-darken-2', 'waves-effect');
                    btn.classList.add('teal');
                    currentPeriod = btn.dataset.period;
                    renderStats();
                });
            });
            
            // Forms
            document.getElementById('clientForm').addEventListener('submit', saveClient);
            document.getElementById('sessionForm').addEventListener('submit', saveSession);
            document.getElementById('settingsForm').addEventListener('submit', saveSettings);
            
            // Client select change - auto-fill rate
            document.getElementById('sessionClient').addEventListener('change', (e) => {
                const client = clients.find(c => c.id === e.target.value);
                if (client) {
                    document.getElementById('sessionAmount').value = client.rate;
                    M.updateTextFields();
                }
            });
            
            // Close modals on overlay click
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.classList.remove('active');
                    }
                });
            });
        }
        
        function switchScreen(screenId) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(screenId).classList.add('active');
            currentScreen = screenId;
            
            // Show/hide FAB
            const fab = document.getElementById('fabButton');
            fab.style.display = (screenId === 'statsScreen' || screenId === 'settingsScreen') ? 'none' : 'flex';
        }
        
        // ============================================
        // РЕНДЕРИНГ
        // ============================================
        
        function renderAll() {
            renderClients();
            renderSessions();
            renderStats();
            updateClientSelect();
            updateSyncQueueUI();
        }
        // Expose renderAll to global scope for SyncManager
        window.renderAll = renderAll;

        function updateSyncQueueUI() {
            const queueItem = document.getElementById('syncQueueItem');
            const queueStatus = document.getElementById('syncQueueStatus');
            const queueLength = typeof window.getSyncQueueLength === 'function'
                ? window.getSyncQueueLength()
                : 0;

            if (queueLength > 0) {
                queueItem.style.display = '';
                queueStatus.textContent = `${queueLength} ${pluralize(queueLength, 'операция', 'операции', 'операций')} в очереди`;
            } else {
                queueItem.style.display = 'none';
            }
        }
        // Expose updateSyncQueueUI to global scope for SyncManager
        window.updateSyncQueueUI = updateSyncQueueUI;

        // forceSyncNow is now provided by js/app.js
        
        function renderClients() {
            const container = document.getElementById('clientsList');

            if (clients.length === 0) {
                container.innerHTML = `
                    <div class="center-align grey-text" style="padding: 48px 24px;">
                        <i class="material-icons large" style="opacity: 0.6;">people_outline</i>
                        <h5 class="grey-text text-darken-2">Нет клиентов</h5>
                        <p class="grey-text">Добавьте первого клиента для начала работы</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = clients.map((client, index) => {
                const clientSessions = sessions.filter(s => s.clientId === client.id);
                const unpaidSessions = clientSessions.filter(s => !s.paid);
                const debt = unpaidSessions.reduce((sum, s) => sum + Number(s.amount), 0);
                const currency = client.currency || 'USD';

                return `
                    <div class="card hoverable compact" onclick="openClientDetail('${client.id}')">
                        <div class="card-content" style="margin-bottom: 0;">
                            <div class="row valign-wrapper" style="margin: 0;">
                                <div class="col s1" style="padding-right: 0;">
                                    <i class="material-icons teal-text" style="font-size: 20px;">person</i>
                                </div>
                                <div class="col s11">
                                    <span class="card-title" style="font-size: 15px; margin: 0; line-height: 1.3;">${escapeHtml(client.name)}</span>
                                    <p class="grey-text" style="margin: 0; font-size: 12px;">${formatMoneyWithCurrency(client.rate, currency)} / сессия</p>
                                </div>
                            </div>
                            ${client.notes ? `<p class="grey-text text-darken-1" style="margin: 4px 0 0 0; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(client.notes)}</p>` : ''}
                        </div>
                        <div class="card-action" style="display: flex; justify-content: space-between; align-items: center;">
                            <span class="grey-text" style="font-size: 12px;"><i class="material-icons" style="font-size: 14px; vertical-align: middle;">event</i> ${clientSessions.length} ${pluralize(clientSessions.length, 'сессия', 'сессии', 'сессий')}</span>
                            ${debt > 0 ? `
                                <span class="chip orange lighten-4 orange-text text-darken-2" style="height: 24px; line-height: 24px; font-size: 11px;">Долг: ${formatMoneyWithCurrency(debt, currency)}</span>
                            ` : `
                                <span class="chip green lighten-4 green-text text-darken-2" style="height: 24px; line-height: 24px; font-size: 11px;"><i class="material-icons" style="font-size: 14px;">check</i> Без долгов</span>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function renderSessions() {
            const container = document.getElementById('sessionsList');
            
            if (sessions.length === 0) {
                container.innerHTML = `
                    <div class="center-align grey-text" style="padding: 48px 24px;">
                        <i class="material-icons large" style="opacity: 0.6;">event_busy</i>
                        <h5 class="grey-text text-darken-2">Нет сессий</h5>
                        <p class="grey-text">Добавьте первую сессию</p>
                    </div>
                `;
                return;
            }

            // Sort by date descending
            const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));

            container.innerHTML = sorted.map((session, index) => {
                const client = clients.find(c => c.id === session.clientId);
                const clientName = client ? client.name : 'Неизвестный клиент';
                const currency = client?.currency || 'USD';

                return `
                    <div class="card hoverable compact" onclick="openSessionModal('${session.id}')">
                        <div class="card-content">
                            <div class="row valign-wrapper" style="margin: 0;">
                                <div class="col s1" style="padding-right: 0;">
                                    <i class="material-icons ${session.paid ? 'green-text' : 'orange-text'}" style="font-size: 20px;">${session.paid ? 'check_circle' : 'schedule'}</i>
                                </div>
                                <div class="col s6">
                                    <span class="card-title" style="font-size: 15px; margin: 0; line-height: 1.3;">${escapeHtml(clientName)}</span>
                                    <p class="grey-text" style="margin: 0; font-size: 12px;">${formatDate(session.date)}</p>
                                </div>
                                <div class="col s3 center-align">
                                    <span class="chip ${session.paid ? 'green lighten-4 green-text text-darken-2' : 'orange lighten-4 orange-text text-darken-2'}" style="height: 22px; line-height: 22px; font-size: 10px;">${session.paid ? 'Оплачено' : 'Не опл.'}</span>
                                </div>
                                <div class="col s2 right-align">
                                    <span class="teal-text text-darken-1" style="font-weight: 500; font-size: 13px;">${formatMoneyWithCurrency(session.amount, currency)}</span>
                                </div>
                            </div>
                            ${session.notes ? `<p class="grey-text text-darken-1" style="margin: 4px 0 0 0; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(session.notes)}</p>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function renderStats() {
            const targetCurrency = document.getElementById('statsCurrency').value;
            const filtered = filterSessionsByPeriod(sessions, currentPeriod);
            
            // Total income (paid sessions only) - converted to target currency
            const paidSessions = filtered.filter(s => s.paid);
            let totalIncome = 0;
            paidSessions.forEach(s => {
                const client = clients.find(c => c.id === s.clientId);
                const sessionCurrency = client?.currency || 'USD';
                totalIncome += convertCurrency(Number(s.amount), sessionCurrency, targetCurrency);
            });
            document.getElementById('totalIncome').textContent = formatMoneyWithCurrency(totalIncome, targetCurrency);
            
            // Total sessions
            document.getElementById('totalSessions').textContent = filtered.length;
            
            // Total debt (all unpaid sessions, not filtered by period) - converted to target currency
            const unpaidSessions = sessions.filter(s => !s.paid);
            let totalDebt = 0;
            unpaidSessions.forEach(s => {
                const client = clients.find(c => c.id === s.clientId);
                const sessionCurrency = client?.currency || 'USD';
                totalDebt += convertCurrency(Number(s.amount), sessionCurrency, targetCurrency);
            });
            document.getElementById('totalDebt').textContent = formatMoneyWithCurrency(totalDebt, targetCurrency);
            
            // Show exchange rate info
            const rateInfo = document.getElementById('exchangeRateInfo');
            if (rateInfo) {
                const lastUpdated = exchangeRates.lastUpdated 
                    ? new Date(exchangeRates.lastUpdated).toLocaleString('ru-RU')
                    : 'Не обновлялись';
                rateInfo.textContent = `Курсы: 1 USD = ${exchangeRates.EUR.toFixed(2)} EUR = ${exchangeRates.PLN.toFixed(2)} PLN (обновлено: ${lastUpdated})`;
            }
            
            // Debts by client
            renderDebts(targetCurrency);
        }
        
        function renderDebts(targetCurrency = 'USD') {
            const container = document.getElementById('debtsList');
            
            const debts = clients.map(client => {
                const unpaidSessions = sessions.filter(s => s.clientId === client.id && !s.paid);
                const clientCurrency = client.currency || 'USD';
                const debtInOriginal = unpaidSessions.reduce((sum, s) => sum + Number(s.amount), 0);
                const debtConverted = convertCurrency(debtInOriginal, clientCurrency, targetCurrency);
                return {
                    client,
                    debt: debtConverted,
                    debtOriginal: debtInOriginal,
                    clientCurrency,
                    sessionsCount: unpaidSessions.length
                };
            }).filter(d => d.debt > 0).sort((a, b) => b.debt - a.debt);
            
            if (debts.length === 0) {
                container.innerHTML = `
                    <div class="center-align grey-text" style="padding: 48px 24px;">
                        <i class="material-icons green-text text-darken-2" style="font-size: 64px; margin-bottom: 16px;">celebration</i>
                        <h5 class="grey-text text-darken-2">Нет долгов</h5>
                        <p class="grey-text">Все сессии оплачены</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = '<ul class="collection">' + debts.map(d => `
                <li class="collection-item avatar valign-wrapper">
                    <i class="material-icons circle orange lighten-4 orange-text">person</i>
                    <div class="col s8">
                        <span class="title">${escapeHtml(d.client.name)}</span>
                        <p class="grey-text">${d.sessionsCount} ${pluralize(d.sessionsCount, 'сессия', 'сессии', 'сессий')} ${d.clientCurrency !== targetCurrency ? `(${formatMoneyWithCurrency(d.debtOriginal, d.clientCurrency)})` : ''}</p>
                    </div>
                    <span class="secondary-content orange-text text-darken-2" style="font-weight: 600;">${formatMoneyWithCurrency(d.debt, targetCurrency)}</span>
                </li>
            `).join('') + '</ul>';
        }
        
        function updateClientSelect() {
            const select = document.getElementById('sessionClient');
            select.innerHTML = '<option value="">Выберите клиента</option>' + 
                clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        }
        
        // ============================================
        // МОДАЛЬНЫЕ ОКНА
        // ============================================
        
        function openClientModal(clientId = null) {
            const modalEl = document.getElementById('clientModal');
            const modal = M.Modal.getInstance(modalEl);
            const title = document.getElementById('clientModalTitle');
            const form = document.getElementById('clientForm');

            form.reset();
            document.getElementById('clientId').value = '';

            // Reset and reinitialize select
            const currencySelect = document.getElementById('clientCurrency');
            currencySelect.value = 'USD';
            M.FormSelect.init(currencySelect);

            if (clientId) {
                const client = clients.find(c => c.id === clientId);
                if (client) {
                    title.textContent = 'Редактировать клиента';
                    document.getElementById('clientId').value = client.id;
                    document.getElementById('clientName').value = client.name;
                    document.getElementById('clientRate').value = client.rate;
                    currencySelect.value = client.currency || 'USD';
                    document.getElementById('clientNotes').value = client.notes || '';
                    M.FormSelect.init(currencySelect);
                }
            } else {
                title.textContent = 'Новый клиент';
            }

            modal.open();
            setTimeout(function() { M.updateTextFields(); }, 0);
        }

        function closeClientModal() {
            const modalEl = document.getElementById('clientModal');
            const modal = M.Modal.getInstance(modalEl);
            modal.close();
        }

        function openSessionModal(sessionId = null) {
            const modalEl = document.getElementById('sessionModal');
            const modal = M.Modal.getInstance(modalEl);
            const title = document.getElementById('sessionModalTitle');
            const form = document.getElementById('sessionForm');
            const deleteBtn = document.getElementById('sessionDeleteBtn');
            const sessionDateEl = document.getElementById('sessionDate');

            form.reset();
            document.getElementById('sessionId').value = '';

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];

            if (sessionId) {
                const session = sessions.find(s => s.id === sessionId);
                if (session) {
                    title.textContent = 'Редактировать сессию';
                    document.getElementById('sessionId').value = session.id;
                    document.getElementById('sessionClient').value = session.clientId;
                    sessionDateEl.value = session.date;
                    document.getElementById('sessionAmount').value = session.amount;
                    document.getElementById('sessionPaid').checked = session.paid;
                    document.getElementById('sessionNotes').value = session.notes || '';
                    deleteBtn.style.display = 'block';
                    const dp = M.Datepicker.getInstance(sessionDateEl);
                    if (dp) dp.setDate(new Date(session.date));
                }
            } else {
                title.textContent = 'Новая сессия';
                deleteBtn.style.display = 'none';
                sessionDateEl.value = dateStr;
                const dp = M.Datepicker.getInstance(sessionDateEl);
                if (dp) dp.setDate(today);
            }

            const clientSelect = document.getElementById('sessionClient');
            M.FormSelect.init(clientSelect);

            modal.open();
            // Update floating labels after modal is visible (fixes label overlapping value)
            setTimeout(function() {
                M.updateTextFields();
            }, 0);
        }

        function closeSessionModal() {
            const modalEl = document.getElementById('sessionModal');
            const modal = M.Modal.getInstance(modalEl);
            modal.close();
        }

        function deleteSession() {
            const sessionId = document.getElementById('sessionId').value;
            if (!sessionId) return;

            if (confirm('Удалить эту сессию?')) {
                sessions = sessions.filter(s => s.id !== sessionId);

                // Track deleted ID to prevent resurrection during sync
                if (typeof window.trackDeleted === 'function') {
                    window.trackDeleted('sessions', sessionId);
                }

                saveLocalData();
                pushToSheets('deleteSession', { id: sessionId });
                renderAll();
                closeSessionModal();
                showToast('Сессия удалена');
            }
        }

        function openSettingsModal() {
            const modalEl = document.getElementById('settingsModal');
            const modal = M.Modal.getInstance(modalEl);
            document.getElementById('scriptUrl').value = localStorage.getItem(CONFIG.STORAGE_KEYS.SCRIPT_URL) || '';
            modal.open();
            setTimeout(function() { M.updateTextFields(); }, 0);
        }

        function closeSettingsModal() {
            const modalEl = document.getElementById('settingsModal');
            const modal = M.Modal.getInstance(modalEl);
            modal.close();
        }
        
        function openClientDetail(clientId) {
            const client = clients.find(c => c.id === clientId);
            if (!client) return;

            const currency = client.currency || 'USD';
            const clientSessions = sessions
                .filter(s => s.clientId === clientId)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            const unpaidSessions = clientSessions.filter(s => !s.paid);
            const totalDebt = unpaidSessions.reduce((sum, s) => sum + Number(s.amount), 0);

            const content = document.getElementById('clientDetailContent');
            content.innerHTML = `
                <div class="center-align" style="margin-bottom: 24px;">
                    <i class="material-icons circle teal lighten-4 teal-text" style="font-size: 48px; padding: 16px; border-radius: 50%;">person</i>
                    <h4 style="margin: 12px 0 4px 0;">${escapeHtml(client.name)}</h4>
                    <p class="grey-text">${formatMoneyWithCurrency(client.rate, currency)} / сессия</p>
                    ${client.notes ? `<p class="grey-text text-darken-1" style="font-size: 14px;">${escapeHtml(client.notes)}</p>` : ''}
                </div>

                <div class="row">
                    <div class="col s6">
                        <div class="card-panel center-align" style="padding: 16px;">
                            <i class="material-icons teal-text">event</i>
                            <h5 style="margin: 8px 0 4px 0;">${clientSessions.length}</h5>
                            <span class="grey-text" style="font-size: 12px;">Всего сессий</span>
                        </div>
                    </div>
                    <div class="col s6">
                        <div class="card-panel center-align" style="padding: 16px;">
                            <i class="material-icons ${totalDebt > 0 ? 'orange-text' : 'green-text'}">${totalDebt > 0 ? 'report_problem' : 'check_circle'}</i>
                            <h5 style="margin: 8px 0 4px 0; color: ${totalDebt > 0 ? '#ff9800' : '#4caf50'};">${totalDebt > 0 ? formatMoneyWithCurrency(totalDebt, currency) : 'Нет'}</h5>
                            <span class="grey-text" style="font-size: 12px;">Долг</span>
                        </div>
                    </div>
                </div>

                <div class="row" style="margin-bottom: 20px;">
                    <div class="col s6">
                        <a class="waves-effect waves-light btn-flat teal-text" style="width: 100%;" onclick="editClientFromDetail('${client.id}')">
                            <i class="material-icons left">edit</i>Изменить
                        </a>
                    </div>
                    <div class="col s6">
                        <a class="waves-effect waves-light btn-flat red-text" style="width: 100%;" onclick="deleteClientFromDetail('${client.id}')">
                            <i class="material-icons left">delete</i>Удалить
                        </a>
                    </div>
                </div>

                ${clientSessions.length > 0 ? `
                    <h6 class="grey-text text-darken-2" style="margin-bottom: 12px;">История сессий</h6>
                    <ul class="collection">
                        ${clientSessions.map(session => `
                            <li class="collection-item avatar" style="cursor: pointer;" onclick="openSessionModal('${session.id}'); closeClientDetail();">
                                <i class="material-icons circle ${session.paid ? 'green' : 'orange'}">${session.paid ? 'check' : 'schedule'}</i>
                                <span class="title">${formatDate(session.date)}</span>
                                <p class="grey-text" style="font-size: 12px;">${session.notes ? escapeHtml(session.notes.substring(0, 30)) + (session.notes.length > 30 ? '...' : '') : 'Без заметок'}</p>
                                <span class="secondary-content">
                                    <span style="color: ${session.paid ? '#4caf50' : '#ff9800'}; font-weight: 500;">${formatMoneyWithCurrency(session.amount, currency)}</span>
                                </span>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="center-align grey-text" style="padding: 32px;">
                        <i class="material-icons" style="font-size: 48px; opacity: 0.5;">event_busy</i>
                        <p>Нет сессий</p>
                    </div>
                `}
            `;

            const modalEl = document.getElementById('clientDetailModal');
            const modal = M.Modal.getInstance(modalEl);
            modal.open();
        }

        function closeClientDetail() {
            const modalEl = document.getElementById('clientDetailModal');
            const modal = M.Modal.getInstance(modalEl);
            modal.close();
        }
        
        function editClientFromDetail(clientId) {
            closeClientDetail();
            openClientModal(clientId);
        }
        
        function deleteClientFromDetail(clientId) {
            if (confirm('Удалить клиента? Все связанные сессии также будут удалены.')) {
                // Get session IDs to delete
                const sessionIdsToDelete = sessions.filter(s => s.clientId === clientId).map(s => s.id);

                clients = clients.filter(c => c.id !== clientId);
                sessions = sessions.filter(s => s.clientId !== clientId);

                // Track deleted IDs to prevent resurrection during sync
                if (typeof window.trackDeleted === 'function') {
                    window.trackDeleted('clients', clientId);
                    sessionIdsToDelete.forEach(sessionId => {
                        window.trackDeleted('sessions', sessionId);
                    });
                }

                saveLocalData();

                // Sync deletions with Google Sheets
                pushToSheets('deleteClient', { id: clientId });
                sessionIdsToDelete.forEach(sessionId => {
                    pushToSheets('deleteSession', { id: sessionId });
                });

                renderAll();
                closeClientDetail();
                showToast('Клиент удалён');
            }
        }
        
        // ============================================
        // СОХРАНЕНИЕ ДАННЫХ
        // ============================================
        
        function saveClient(e) {
            e.preventDefault();
            
            const name = document.getElementById('clientName').value.trim();
            const rate = Number(document.getElementById('clientRate').value);
            
            // Validation
            if (!name) {
                showToast('Введите имя клиента');
                return;
            }
            if (!rate || rate <= 0) {
                showToast('Введите корректную стоимость');
                return;
            }
            
            const id = document.getElementById('clientId').value;
            const clientData = {
                id: id || generateId(),
                name: name,
                rate: rate,
                currency: document.getElementById('clientCurrency').value,
                notes: document.getElementById('clientNotes').value.trim(),
                updatedAt: new Date().toISOString()
            };
            
            if (id) {
                const index = clients.findIndex(c => c.id === id);
                if (index !== -1) {
                    clients[index] = { ...clients[index], ...clientData };
                }
            } else {
                clientData.createdAt = new Date().toISOString();
                clients.push(clientData);
            }
            
            saveLocalData();
            pushToSheets('saveClient', clientData);
            renderAll();
            closeClientModal();
            showToast(id ? 'Клиент обновлён' : 'Клиент добавлен');
        }
        
        function saveSession(e) {
            e.preventDefault();
            
            const clientId = document.getElementById('sessionClient').value;
            const date = document.getElementById('sessionDate').value;
            const amount = Number(document.getElementById('sessionAmount').value);
            
            // Validation
            if (!clientId) {
                showToast('Выберите клиента');
                return;
            }
            if (!date) {
                showToast('Выберите дату');
                return;
            }
            if (!amount || amount <= 0) {
                showToast('Введите корректную стоимость');
                return;
            }
            
            const id = document.getElementById('sessionId').value;
            const sessionData = {
                id: id || generateId(),
                clientId: clientId,
                date: date,
                amount: amount,
                paid: document.getElementById('sessionPaid').checked,
                notes: document.getElementById('sessionNotes').value.trim(),
                updatedAt: new Date().toISOString()
            };
            
            if (id) {
                const index = sessions.findIndex(s => s.id === id);
                if (index !== -1) {
                    sessions[index] = { ...sessions[index], ...sessionData };
                }
            } else {
                sessionData.createdAt = new Date().toISOString();
                sessions.push(sessionData);
            }
            
            saveLocalData();
            pushToSheets('saveSession', sessionData);
            renderAll();
            closeSessionModal();
            showToast(id ? 'Сессия обновлена' : 'Сессия добавлена');
        }
        
        function saveSettings(e) {
            e.preventDefault();

            const url = document.getElementById('scriptUrl').value.trim();
            localStorage.setItem(CONFIG.STORAGE_KEYS.SCRIPT_URL, url);

            // Update SyncManager with new URL
            if (typeof window.updateSyncScriptUrl === 'function') {
                window.updateSyncScriptUrl(url);
            }

            closeSettingsModal();

            // Check connection with new URL
            if (typeof window.checkConnectionAndSync === 'function') {
                window.checkConnectionAndSync();
            }

            showToast('Настройки сохранены');
        }
        
        // ============================================
        // ЭКСПОРТ/ИМПОРТ
        // ============================================
        
        function exportData() {
            const data = {
                clients,
                sessions,
                exportedAt: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `therapy-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            showToast('Данные экспортированы');
        }
        
        function importData(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    if (data.clients && Array.isArray(data.clients)) {
                        clients = data.clients;
                    }
                    if (data.sessions && Array.isArray(data.sessions)) {
                        sessions = data.sessions;
                    }
                    
                    saveLocalData();
                    renderAll();
                    showToast('Данные импортированы');
                } catch (error) {
                    showToast('Ошибка импорта');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        }
        
        function clearAllData() {
            if (confirm('Вы уверены? Все локальные данные будут удалены.')) {
                clients = [];
                sessions = [];
                saveLocalData();
                renderAll();
                showToast('Данные очищены');
            }
        }
        
        // ============================================
        // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
        // ============================================
        
        function handleFabClick() {
            if (currentScreen === 'clientsScreen') {
                openClientModal();
            } else if (currentScreen === 'sessionsScreen') {
                openSessionModal();
            }
        }
        
        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substring(2);
        }
        
        function formatMoney(amount) {
            return new Intl.NumberFormat('ru-RU').format(amount);
        }
        
        function formatDate(dateStr) {
            const date = new Date(dateStr);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (date.toDateString() === today.toDateString()) {
                return 'Сегодня';
            }
            if (date.toDateString() === yesterday.toDateString()) {
                return 'Вчера';
            }
            
            return date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
            });
        }
        
        function pluralize(n, one, few, many) {
            const mod10 = n % 10;
            const mod100 = n % 100;
            
            if (mod100 >= 11 && mod100 <= 19) return many;
            if (mod10 === 1) return one;
            if (mod10 >= 2 && mod10 <= 4) return few;
            return many;
        }
        
        function filterSessionsByPeriod(sessions, period) {
            const now = new Date();
            let startDate;
            
            switch (period) {
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case 'year':
                    startDate = new Date(now);
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                case 'all':
                default:
                    return sessions;
            }
            
            return sessions.filter(s => new Date(s.date) >= startDate);
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function showToast(message) {
            M.toast({html: message, displayLength: 2500});
        }
        // Expose showToast to global scope for SyncManager
        window.showToast = showToast;
