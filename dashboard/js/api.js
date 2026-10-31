/**
 * Project TraceX - Core Production API & HTTP Client
 * Framework-free Vanilla JS fetch client with Bearer token authentication.
 * Exclusively executes real fetch requests against the authoritative backend.
 * Zero simulated data.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function determineApiBase() {
  // 1. Runtime window configuration
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
      const storedUrl = stored.trim().replace(/\/+$/, '');
      return storedUrl.endsWith('/api/v1') ? storedUrl : `${storedUrl}/api/v1`;
    }
  }

  // 4. Smart development and origin resolution
  const loc = typeof window !== 'undefined' ? window.location : null;
  if (loc && loc.protocol && loc.protocol.startsWith('http')) {
    // If viewing via local static file server (Live Server 5500, Vite 5173/3000), default API to FastAPI backend on 8000
    if ((loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') && loc.port && loc.port !== '8000') {
      const devProto = loc.protocol || 'http:';
      return `${devProto}//${loc.hostname}:8000/api/v1`;
    }
    return `${loc.origin}/api/v1`;
  }

  if (loc && loc.protocol === 'file:') {
    const proto = 'http:';
    const host = 'localhost';
    return `${proto}//${host}:8000/api/v1`;
  }

  return '/api/v1';
}

export let API_BASE = determineApiBase();

export function setApiBase(newUrl) {
  const trimmed = newUrl.trim().replace(/\/+$/, '');
  const finalBase = trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
  localStorage.setItem('tracex_api_base_url', trimmed);
  API_BASE = finalBase;
  window.dispatchEvent(new CustomEvent('tracex:api-base-changed', { detail: { apiBase: finalBase } }));
  return finalBase;
}

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
  
  const textSpan = document.createElement('span');
  textSpan.textContent = String(message);
  toast.appendChild(textSpan);

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
      let errorMsg = 'Invalid email or password';
      try {
        const errJson = await response.json();
        errorMsg = errJson.detail || errorMsg;
      } catch (e) {}

      if (!endpoint.includes('/auth/login')) {
        localStorage.removeItem('tracex_token');
        localStorage.removeItem('tracex_user');
        window.dispatchEvent(new CustomEvent('auth:expired'));
        errorMsg = 'Session expired or unauthorized. Please authenticate.';
      }
      throw new Error(errorMsg);
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
    const isNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';
    const msg = isNetworkError
      ? 'Cannot connect to TraceX Backend API. Please verify server connection.'
      : error.message;
    showToast(msg, 'error');
    throw error;
  }
}

export async function checkServerHealth(customUrl = null) {
  const base = customUrl ? customUrl.trim().replace(/\/+$/, '') : API_BASE.replace(/\/api\/v1$/, '');
  try {
    const res = await fetch(`${base}/health`, { method: 'GET', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { healthy: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { healthy: data.status === 'healthy', data };
  } catch (e) {
    return { healthy: false, error: e.message || 'Network error' };
  }
}

export const api = {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' }),
};
