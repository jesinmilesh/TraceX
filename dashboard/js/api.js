/**
 * Project TraceX - Core API & HTTP Client
 * Framework-free Vanilla JS fetch client with Bearer token authentication
 * Automatically adapts to server hostname/port or reverse proxy without hardcoded URLs.
 */

function determineApiBase() {
  // 1. Runtime window configuration (Pure Vanilla Web)
  if (typeof window !== 'undefined' && window.__TRACEX_CONFIG__ && window.__TRACEX_CONFIG__.API_BASE_URL) {
    const configUrl = window.__TRACEX_CONFIG__.API_BASE_URL.replace(/\/+$/, '');
    return configUrl.endsWith('/api/v1') ? configUrl : `${configUrl}/api/v1`;
  }

  // 2. Window runtime configuration override
  if (typeof window !== 'undefined' && window.__TRACEX_API_BASE_URL__) {
    const winUrl = window.__TRACEX_API_BASE_URL__.replace(/\/+$/, '');
    return winUrl.endsWith('/api/v1') ? winUrl : `${winUrl}/api/v1`;
  }

  // 3. LocalStorage override for flexible deployment environments
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('tracex_api_base_url');
    if (stored) {
      const storedUrl = stored.replace(/\/+$/, '');
      return storedUrl.endsWith('/api/v1') ? storedUrl : `${storedUrl}/api/v1`;
    }
  }

  // 4. Same-origin deployment or development proxy
  const loc = window.location;
  if (loc && loc.protocol && loc.protocol.startsWith('http')) {
    if (loc.port === '5173') {
      return '/api/v1';
    }
    return `${loc.origin}/api/v1`;
  }

  return '/api/v1';
}

export const API_BASE = determineApiBase();

let lastToastMessage = '';
let lastToastTime = 0;

export function showToast(message, type = 'info') {
  const now = Date.now();
  if (message === lastToastMessage && now - lastToastTime < 3000) {
    return;
  }
  lastToastMessage = message;
  lastToastTime = now;

  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export async function request(endpoint, options = {}) {
  const token = localStorage.getItem('tracex_token');
  const headers = options.headers || {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers
  };

  try {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const response = await fetch(url, config);

    if (response.status === 401) {
      localStorage.removeItem('tracex_token');
      localStorage.removeItem('tracex_user');
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('Session expired or unauthorized. Please authenticate.');
    }

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}`;
      try {
        const errJson = await response.json();
        errorMsg = errJson.detail || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    const msg = error.message === 'Failed to fetch'
      ? 'Cannot connect to TraceX Backend API. Please verify server connection.'
      : error.message;
    showToast(msg, 'error');
    throw error;
  }
}

export const api = {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' }),
};
