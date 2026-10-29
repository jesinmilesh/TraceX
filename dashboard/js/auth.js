import { api, showToast } from './api.js';

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

  function updateAuthUI() {
    const user = getStoredUser();
    if (isAuthenticated() && user) {
      if (authOverlay) authOverlay.style.display = 'none';
      const userNameEl = document.getElementById('current-user-name');
      const userRoleEl = document.getElementById('current-user-role');
      const userAvatarEl = document.getElementById('current-user-avatar');

      if (userNameEl) userNameEl.textContent = user.name || user.email;
      if (userRoleEl) userRoleEl.textContent = user.role;
      if (userAvatarEl) userAvatarEl.textContent = (user.name || user.email).slice(0, 2).toUpperCase();
    } else {
      if (authOverlay) authOverlay.style.display = 'flex';
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

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
        showToast(err.message || 'Authentication failed', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Authenticate & Enter SOC';
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('tracex_token');
      localStorage.removeItem('tracex_user');
      showToast('Logged out of Project TraceX', 'info');
      updateAuthUI();
    });
  }

  window.addEventListener('auth:expired', () => {
    updateAuthUI();
  });

  updateAuthUI();
}
