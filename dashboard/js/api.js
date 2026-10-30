/**
 * Project TraceX - Core API & HTTP Client
 * Framework-free Vanilla JS fetch client with Bearer token authentication
 * Automatically adapts to server hostname/port or reverse proxy without hardcoded URLs.
 * 
 * Strict Mode Separation:
 * - When DEMO_MODE is true: Serves purely isolated, in-memory fictional demo datasets.
 * - When DEMO_MODE is false (Live SOC): Executes real fetch requests to backend endpoints.
 *   Never silently substitutes mock data when a live API request fails.
 */

import {
  isDemoMode,
  DEMO_USER,
  DEMO_CASES,
  DEMO_DEVICES,
  DEMO_TELEMETRY,
  DEMO_CALLS,
  DEMO_MESSAGES,
  DEMO_EVIDENCE,
  DEMO_CUSTODY,
  DEMO_AUDIT
} from './demo.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

// Simulated latency for realistic demo interactions (ms)
const DEMO_LATENCY_MS = 60;

function resolveDemoData(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const cleanEndpoint = endpoint.replace(/^\/api\/v1/, '').split('?')[0];

  return new Promise((resolve) => {
    setTimeout(() => {
      // 1. Auth Login
      if (cleanEndpoint === '/auth/login' && method === 'POST') {
        resolve({
          access_token: 'demo-tracex-forensic-token-isolated',
          token_type: 'bearer',
          user: DEMO_USER
        });
        return;
      }

      // 2. Cases
      if (cleanEndpoint === '/cases') {
        resolve(DEMO_CASES);
        return;
      }

      // 3. Devices
      if (cleanEndpoint === '/devices') {
        resolve(DEMO_DEVICES);
        return;
      }

      // 4. Telemetry Endpoints
      if (cleanEndpoint.startsWith('/telemetry/')) {
        if (cleanEndpoint.endsWith('/calls')) {
          resolve(DEMO_CALLS);
          return;
        }
        if (cleanEndpoint.endsWith('/messages')) {
          resolve(DEMO_MESSAGES);
          return;
        }
        resolve(DEMO_TELEMETRY);
        return;
      }

      // 5. Evidence
      if (cleanEndpoint.includes('/verify')) {
        resolve({
          status: 'INTEGRITY VERIFIED',
          filename: 'simulated_vault_artifact.raw',
          evidence_id: 'EVD-DEMO-0041',
          original_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          current_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          verified_by: 'investigator.demo@tracex.local',
          verified_at: new Date().toISOString(),
          is_demo: true
        });
        return;
      }
      if (cleanEndpoint.startsWith('/evidence/case/')) {
        resolve(DEMO_EVIDENCE);
        return;
      }
      if (cleanEndpoint === '/evidence/upload' && method === 'POST') {
        resolve({
          success: true,
          evidence_id: `EVD-DEMO-${Date.now().toString().slice(-4)}`,
          original_filename: 'simulated_uploaded_file.bin',
          sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          vault_status: 'SIMULATED_VERIFIED',
          is_demo: true
        });
        return;
      }

      // 6. Custody
      if (cleanEndpoint.startsWith('/custody/case/')) {
        resolve(DEMO_CUSTODY);
        return;
      }

      // 7. Audit
      if (cleanEndpoint === '/audit') {
        resolve(DEMO_AUDIT);
        return;
      }

      // 8. Reports Preview
      if (cleanEndpoint === '/reports/preview') {
        resolve({
          preview_html: '<div style="padding:16px; font-family:sans-serif; color:#f1f5f9;"><h4>Project TraceX Forensic Audit Preview [DEMO MODE]</h4><p>Report compiled for Case TX-2026-089 (Operation Sentinel Shadow). All records are simulated for demonstration.</p></div>'
        });
        return;
      }

      // Default demo fallback
      resolve({ status: 'ok', is_demo: true, endpoint: cleanEndpoint });
    }, DEMO_LATENCY_MS);
  });
}

export async function request(endpoint, options = {}) {
  // ---------------- DEMO MODE INTERCEPTION ----------------
  if (isDemoMode()) {
    return await resolveDemoData(endpoint, options);
  }

  // ---------------- LIVE SOC MODE (REAL BACKEND) ----------------
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
