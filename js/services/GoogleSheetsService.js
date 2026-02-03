/**
 * GoogleSheetsService - handles all HTTP communication with Google Apps Script backend.
 *
 * This service is responsible for:
 * - Making API calls to Google Sheets via Apps Script
 * - Handling URL length limitations
 * - Data truncation for long notes
 */
export class GoogleSheetsService {
  #scriptUrl;
  #maxUrlLength;

  /**
   * @param {string} scriptUrl - Google Apps Script deployment URL
   * @param {number} maxUrlLength - Maximum URL length (default 1800 for safety)
   */
  constructor(scriptUrl, maxUrlLength = 1800) {
    this.#scriptUrl = scriptUrl;
    this.#maxUrlLength = maxUrlLength;
  }

  /**
   * Get the current script URL
   * @returns {string}
   */
  get scriptUrl() {
    return this.#scriptUrl;
  }

  /**
   * Update the script URL
   * @param {string} url
   */
  set scriptUrl(url) {
    this.#scriptUrl = url;
  }

  /**
   * Check if service is configured with a valid URL
   * @returns {boolean}
   */
  get isConfigured() {
    return Boolean(this.#scriptUrl);
  }

  /**
   * Ping the server to check connection
   * @returns {Promise<boolean>}
   */
  async ping() {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const response = await fetch(`${this.#scriptUrl}?action=ping`, {
        method: 'GET',
        mode: 'cors'
      });
      return response.ok;
    } catch (e) {
      console.error('GoogleSheetsService: ping failed', e);
      return false;
    }
  }

  /**
   * Initialize the spreadsheet (creates sheets and headers if needed)
   * @returns {Promise<boolean>}
   */
  async init() {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const response = await fetch(`${this.#scriptUrl}?action=init`, {
        method: 'GET',
        mode: 'cors'
      });
      const result = await response.json();
      return result.success !== false;
    } catch (e) {
      console.error('GoogleSheetsService: init failed', e);
      return false;
    }
  }

  /**
   * Get all data from Google Sheets
   * @returns {Promise<{clients: Array, sessions: Array, syncedAt: string}|null>}
   */
  async getData() {
    if (!this.isConfigured) {
      return null;
    }

    try {
      const response = await fetch(`${this.#scriptUrl}?action=getData`, {
        method: 'GET',
        mode: 'cors'
      });
      const data = await response.json();

      if (data.error) {
        console.error('GoogleSheetsService: getData error', data.error);
        return null;
      }

      return data;
    } catch (e) {
      console.error('GoogleSheetsService: getData failed', e);
      return null;
    }
  }

  /**
   * Save a client to Google Sheets
   * @param {Object} client - Client data
   * @returns {Promise<boolean>}
   */
  async saveClient(client) {
    return this.#pushData('saveClient', client);
  }

  /**
   * Save a session to Google Sheets
   * @param {Object} session - Session data
   * @returns {Promise<boolean>}
   */
  async saveSession(session) {
    return this.#pushData('saveSession', session);
  }

  /**
   * Delete a client from Google Sheets
   * @param {string} id - Client ID
   * @returns {Promise<boolean>}
   */
  async deleteClient(id) {
    return this.#pushData('deleteClient', { id });
  }

  /**
   * Delete a session from Google Sheets
   * @param {string} id - Session ID
   * @returns {Promise<boolean>}
   */
  async deleteSession(id) {
    return this.#pushData('deleteSession', { id });
  }

  /**
   * Sync all data to Google Sheets (full overwrite)
   * @param {Object} data - { clients: Array, sessions: Array }
   * @returns {Promise<boolean>}
   */
  async syncAll(data) {
    return this.#pushData('syncAll', data);
  }

  /**
   * Internal method to push data to Google Sheets
   * @param {string} action - API action name
   * @param {Object} data - Data to send
   * @returns {Promise<boolean>}
   */
  async #pushData(action, data) {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const truncatedData = this.#truncateDataForUrl(data);
      const url = this.#buildUrl(action, truncatedData);

      // Check URL length and truncate more if needed
      if (url.length > this.#maxUrlLength) {
        console.warn('GoogleSheetsService: URL too long, truncating notes further');

        if (truncatedData.notes !== undefined) {
          truncatedData.notes = truncatedData.notes
            ? truncatedData.notes.substring(0, 200)
            : '';
        }

        const shortUrl = this.#buildUrl(action, truncatedData);

        if (shortUrl.length > this.#maxUrlLength) {
          console.error('GoogleSheetsService: URL still too long after truncation');
          return false;
        }

        return this.#executeRequest(shortUrl);
      }

      return this.#executeRequest(url);
    } catch (e) {
      console.error('GoogleSheetsService: pushData failed', e);
      return false;
    }
  }

  /**
   * Execute the actual fetch request
   * @param {string} url - Full URL to fetch
   * @returns {Promise<boolean>}
   */
  async #executeRequest(url) {
    const response = await fetch(url, { method: 'GET', mode: 'cors' });
    const result = await response.json();

    if (result.error) {
      console.error('GoogleSheetsService: server error', result.error);
      return false;
    }

    return result.success !== false;
  }

  /**
   * Build URL with action and data parameters
   * @param {string} action - API action
   * @param {Object} data - Data to encode
   * @returns {string}
   */
  #buildUrl(action, data) {
    const params = new URLSearchParams({
      action: action,
      data: JSON.stringify(data)
    });
    return `${this.#scriptUrl}?${params.toString()}`;
  }

  /**
   * Truncate data fields that might be too long for URL
   * @param {Object} data - Original data
   * @returns {Object} - Truncated copy
   */
  #truncateDataForUrl(data) {
    const truncated = { ...data };

    // Truncate notes if too long
    if (truncated.notes && truncated.notes.length > 500) {
      truncated.notes = truncated.notes.substring(0, 500) + '...';
      console.warn('GoogleSheetsService: notes truncated for URL length limit');
    }

    return truncated;
  }
}
