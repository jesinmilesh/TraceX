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

export function switchView(viewName) {
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('data-view') === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

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

async function initDashboardData() {
  await loadCases();
  await loadDevices();
  await loadTelemetryHistory();
  await loadEvidence();
  await loadCustody();
  setTimeout(() => initLeafletMap('overview-map-canvas'), 200);
}

document.addEventListener('DOMContentLoaded', () => {
  // Navigation item clicks
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const view = el.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Quick switch buttons inside cards
  document.querySelectorAll('[data-switch-view]').forEach(el => {
    el.addEventListener('click', () => {
      const targetView = el.getAttribute('data-switch-view');
      if (targetView) switchView(targetView);
    });
  });

  // Live Map Time Filter Buttons
  document.querySelectorAll('.map-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.getAttribute('data-range');
      filterLocationHistory(range);
    });
  });

  // Clear Visual Trail Button
  const clearTrailBtn = document.getElementById('btn-clear-trail');
  if (clearTrailBtn) {
    clearTrailBtn.addEventListener('click', () => {
      clearMapVisualTrail();
    });
  }

  // Init all modules
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

  // If already logged in, fetch initial data
  if (isAuthenticated()) {
    initDashboardData();
  }

  // Live clock in topbar
  const clockEl = document.getElementById('utc-clock');
  function updateClock() {
    if (clockEl) {
      clockEl.textContent = new Date().toUTCString().replace('GMT', 'UTC');
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
});
