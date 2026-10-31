/**
 * Project TraceX - Authentication & RBAC Session Manager
 * Preserves JWT session in localStorage and manages full-screen auth barrier.
 * Exclusively authenticates against real backend credentials.
 */

import { api, showToast, API_BASE } from './api.js';

export function getStoredUser() {
  const userStr = localStorage.getItem('tracex_user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

export function isAuthenticated() {
  return !!localStorage.getItem('tracex_token');
}

export function initAuth(onLoginSuccess) {
  const authOverlay = document.getElementById('auth-overlay');
  const loginForm = document.getElementById('login-form');
  const logoutBtn = document.getElementById('logout-btn');
  const loginErrorAlert = document.getElementById('login-error-alert');
  const loginBackendUrlEl = document.getElementById('login-backend-url');
  const changeServerBtn = document.getElementById('btn-login-change-server');
  const serverConfigModal = document.getElementById('modal-server-config');
  const serverUrlInput = document.getElementById('cfg-server-url');

  function updateServerDisplay() {
    if (loginBackendUrlEl) {
      const displayUrl = API_BASE.replace(/\/api\/v1$/, '') || window.location.origin;
      loginBackendUrlEl.textContent = displayUrl;
    }
  }

  updateServerDisplay();
  window.addEventListener('tracex:api-base-changed', updateServerDisplay);

  if (changeServerBtn && serverConfigModal) {
    changeServerBtn.addEventListener('click', () => {
      if (serverUrlInput) {
        serverUrlInput.value = localStorage.getItem('tracex_api_base_url') || API_BASE.replace(/\/api\/v1$/, '');
      }
      serverConfigModal.classList.add('active');
    });
  }

  function updateAuthUI() {
    const user = getStoredUser();
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (isAuthenticated() && user) {
      if (authOverlay) authOverlay.style.display = 'none';
      if (bottomNav && window.innerWidth <= 768) bottomNav.style.display = 'flex';
      const userNameEl = document.getElementById('current-user-name');
      const userRoleEl = document.getElementById('current-user-role');
      const userAvatarEl = document.getElementById('current-user-avatar');

      if (userNameEl) userNameEl.textContent = user.name || user.email;
      if (userRoleEl) userRoleEl.textContent = user.role;
      if (userAvatarEl) {
        const initials = (user.name || user.email).split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        userAvatarEl.textContent = initials || 'TX';
      }
    } else {
      if (authOverlay) authOverlay.style.display = 'flex';
      if (bottomNav) bottomNav.style.display = 'none';
      updateServerDisplay();
    }
  }

  // 1. Standard Form Login against Backend
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (loginErrorAlert) {
        loginErrorAlert.style.display = 'none';
        loginErrorAlert.textContent = '';
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Verifying Credentials...';
        }

        const data = await api.post('/auth/login', { email, password });
        localStorage.setItem('tracex_token', data.access_token);
        localStorage.setItem('tracex_user', JSON.stringify(data.user));

        showToast(`Authenticated as ${data.user.role}: ${data.user.email}`, 'success');
        updateAuthUI();
        if (onLoginSuccess) onLoginSuccess();
      } catch (err) {
        const errorText = err.message || 'Authentication failed';
        if (loginErrorAlert) {
          loginErrorAlert.style.display = 'block';
          if (errorText.includes('404') || errorText.includes('connect')) {
            loginErrorAlert.innerHTML = `<strong>Server Connection Error:</strong> Unable to reach FastAPI backend at <code>${API_BASE}</code>.<br><small style="color:#94a3b8;">Click 'Configure' below to set the backend URL (e.g. <code>http://localhost:8000</code> or your production server).</small>`;
          } else {
            loginErrorAlert.textContent = errorText;
          }
        }
        showToast(errorText, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Authenticate & Enter SOC';
        }
      }
    });
  }

  // 2. Terminate Session / Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('tracex_token');
      localStorage.removeItem('tracex_user');
      showToast('Terminated Project TraceX Session', 'info');
      updateAuthUI();
    });
  }

  window.addEventListener('auth:expired', () => {
    updateAuthUI();
  });

  updateAuthUI();
}
