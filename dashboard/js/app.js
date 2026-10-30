/**
 * Project TraceX - Main Application Orchestrator & View Switcher
 * Pure Vanilla JavaScript ES6 Module
 */

import { initAuth, isAuthenticated } from './auth.js';
import { initCases, loadCases } from './cases.js';
import { initDevices, loadDevices } from './devices.js';
import {
  initWebSocket,
  loadTelemetryHistory,
  loadCallLogs,
  loadMessages,
  initLeafletMap,
  filterLocationHistory,
  clearMapVisualTrail
} from './telemetry.js';
import { initEvidence, loadEvidence } from './evidence.js';
import { initCustody, loadCustody } from './custody.js';
import { initAudit, loadAuditLogs } from './audit.js';
import { initReports, loadReportPreview } from './reports.js';
import { isDemoMode, setDemoMode, DEMO_USER } from './demo.js';
import { showToast } from './api.js';

let activeViewName = 'overview';

export function getActiveView() {
  return activeViewName;
}

export function switchView(viewName) {
  activeViewName = viewName;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('data-view') === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update view panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Close mobile sidebar on navigation
  closeMobileSidebar();

  // Trigger data refresh according to active view
  switch (viewName) {
    case 'overview':
      loadDevices();
      loadTelemetryHistory();
      loadEvidence();
      loadCustody();
      setTimeout(() => initLeafletMap('overview-map-canvas'), 150);
      break;
    case 'map':
      loadDevices();
      loadTelemetryHistory();
      setTimeout(() => initLeafletMap('live-map-canvas'), 150);
      break;
    case 'cases':
      loadCases();
      break;
    case 'devices':
      loadDevices();
      break;
    case 'calls':
      loadCallLogs();
      break;
    case 'messages':
      loadMessages();
      break;
    case 'telemetry':
      loadTelemetryHistory();
      break;
    case 'evidence':
      loadEvidence();
      break;
    case 'custody':
      loadCustody();
      break;
    case 'audit':
      loadAuditLogs();
      break;
    case 'reports':
      loadReportPreview();
      break;
  }
}

export async function initDashboardData() {
  await loadCases();
  await loadDevices();
  await loadTelemetryHistory();
  await loadEvidence();
  await loadCustody();
  setTimeout(() => initLeafletMap('overview-map-canvas'), 200);
}

function updateDemoModeUI() {
  const active = isDemoMode();
  const indicatorBar = document.getElementById('demo-indicator-bar');
  const toggleBtn = document.getElementById('btn-toggle-demo');
  const labelEl = document.getElementById('demo-toggle-label');

  if (indicatorBar) {
    indicatorBar.style.display = active ? 'inline-flex' : 'none';
  }

  if (toggleBtn && labelEl) {
    if (active) {
      toggleBtn.className = 'btn btn-secondary btn-sm';
      labelEl.innerHTML = '<span class="pulse-dot amber"></span> Demo Mode: ON';
    } else {
      toggleBtn.className = 'btn btn-secondary btn-sm';
      labelEl.innerHTML = '<span class="pulse-dot"></span> Live SOC';
    }
  }
}

// ==================== MOBILE SIDEBAR TOGGLE ====================

function openMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  // 0. Mobile sidebar toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('main-sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeMobileSidebar);
  }

  // 1. Navigation item clicks
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const view = el.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // 2. Quick switch buttons inside cards
  document.querySelectorAll('[data-switch-view]').forEach(el => {
    el.addEventListener('click', () => {
      const targetView = el.getAttribute('data-switch-view');
      if (targetView) switchView(targetView);
    });
  });

  // 3. Live Map Time Filter Buttons
  document.querySelectorAll('.map-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.getAttribute('data-range');
      filterLocationHistory(range);
    });
  });

  // 4. Clear Visual Trail Button
  const clearTrailBtn = document.getElementById('btn-clear-trail');
  if (clearTrailBtn) {
    clearTrailBtn.addEventListener('click', () => {
      clearMapVisualTrail();
    });
  }

  // 5. Demo Mode Toggle Switch
  const demoToggleBtn = document.getElementById('btn-toggle-demo');
  if (demoToggleBtn) {
    demoToggleBtn.addEventListener('click', () => {
      const currentlyDemo = isDemoMode();
      const nextMode = !currentlyDemo;
      setDemoMode(nextMode);

      if (nextMode) {
        localStorage.setItem('tracex_token', 'demo-tracex-forensic-token-isolated');
        localStorage.setItem('tracex_user', JSON.stringify(DEMO_USER));
        showToast('Switched to Demonstration Mode (Frontend-Only Simulated Records)', 'info');
      } else {
        localStorage.removeItem('tracex_token');
        localStorage.removeItem('tracex_user');
        showToast('Switched to Live SOC Mode (Real Backend & WebSocket)', 'info');
      }

      updateDemoModeUI();
      initWebSocket();
      initDashboardData();
    });
  }

  window.addEventListener('demo:toggle', () => {
    updateDemoModeUI();
  });

  updateDemoModeUI();

  // 6. Initialize Modules & Auth
  initAuth(() => {
    initDashboardData();
  });
  initCases();
  initDevices();
  initEvidence();
  initCustody();
  initAudit();
  initReports();
  initWebSocket();

  // If already authenticated, load initial data
  if (isAuthenticated()) {
    initDashboardData();
  }

  // 7. Forensic UTC Timestamp Clock in Topbar
  const clockEl = document.getElementById('utc-clock');
  function updateClock() {
    if (clockEl) {
      clockEl.textContent = new Date().toUTCString().replace('GMT', 'UTC');
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // 8. Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileSidebar();
    }
  });
});
