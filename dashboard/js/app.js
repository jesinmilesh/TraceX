/**
 * Project TraceX - Enterprise Forensic Investigation Workbench Orchestrator
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
  clearMapVisualTrail,
  scrubMapTimeline
} from './telemetry.js';
import { initEvidence, loadEvidence } from './evidence.js';
import { initCustody, loadCustody } from './custody.js';
import { initAudit, loadAuditLogs } from './audit.js';
import { initReports, loadReportPreview } from './reports.js';
import { isDemoMode, setDemoMode, DEMO_USER } from './demo.js';
import { showToast } from './api.js';

import { initEvidenceGraph, fitGraphToScreen, refreshGraphData, selectGraphNode } from './graph.js';
import { initWorkbench, loadWorkbenchArtifacts, openArtifactInWorkbench } from './workbench.js';
import { initForensicTimeline, renderTimelineEvents } from './timeline.js';

let activeViewName = 'overview';
let activeOverviewMode = 'graph';

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
      setTimeout(() => {
        refreshGraphData();
        loadWorkbenchArtifacts();
        renderTimelineEvents();
        if (activeOverviewMode === 'map') {
          initLeafletMap('overview-map-canvas');
        }
      }, 150);
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

export function switchOverviewMode(modeName) {
  activeOverviewMode = modeName;
  document.querySelectorAll('.workspace-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === modeName);
  });
  document.querySelectorAll('.overview-subview-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `overview-subview-${modeName}`);
  });

  if (modeName === 'graph') {
    setTimeout(() => {
      initEvidenceGraph('graph-viewport');
      fitGraphToScreen();
    }, 60);
  } else if (modeName === 'workbench') {
    initWorkbench();
  } else if (modeName === 'map') {
    setTimeout(() => initLeafletMap('overview-map-canvas'), 100);
  } else if (modeName === 'timeline') {
    initForensicTimeline('forensic-timeline-view');
  }
}

export async function initDashboardData() {
  await loadCases();
  await loadDevices();
  await loadTelemetryHistory();
  await loadEvidence();
  await loadCustody();

  setTimeout(() => {
    initEvidenceGraph('graph-viewport');
    initWorkbench();
    initForensicTimeline('forensic-timeline-view');
    initLeafletMap('overview-map-canvas');
  }, 200);
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
      labelEl.innerHTML = '<span class="pulse-dot warning"></span> Demo Mode: ON';
    } else {
      toggleBtn.className = 'btn btn-secondary btn-sm';
      labelEl.innerHTML = '<span class="pulse-dot"></span> Live SOC';
    }
  }
}

// ==================== SIDEBAR RAIL & MOBILE DRAWER ====================

function toggleSidebarRail() {
  const sidebar = document.getElementById('main-sidebar');
  if (sidebar) {
    sidebar.classList.toggle('rail-collapsed');
    const isCollapsed = sidebar.classList.contains('rail-collapsed');
    localStorage.setItem('tracex_rail_collapsed', isCollapsed ? 'true' : 'false');
  }
}

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
  // Restore sidebar rail state
  if (localStorage.getItem('tracex_rail_collapsed') === 'true') {
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) sidebar.classList.add('rail-collapsed');
  }

  // Sidebar Rail Toggle
  const railToggleBtn = document.getElementById('sidebar-rail-toggle');
  if (railToggleBtn) {
    railToggleBtn.addEventListener('click', toggleSidebarRail);
  }

  // Mobile sidebar toggle
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

  // Navigation item clicks
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const view = el.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Overview Investigation Mode Buttons
  document.querySelectorAll('.workspace-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      if (mode) switchOverviewMode(mode);
    });
  });

  // Quick switch buttons inside cards / strips
  document.querySelectorAll('[data-switch-view]').forEach(el => {
    el.addEventListener('click', () => {
      const targetView = el.getAttribute('data-switch-view');
      if (targetView) switchView(targetView);
    });
  });

  // Map Observation Timeline Scrubber Slider
  const mapSlider = document.getElementById('map-timeline-slider');
  if (mapSlider) {
    mapSlider.addEventListener('input', (e) => {
      const ratio = Number(e.target.value) / 100;
      scrubMapTimeline(ratio);
    });
  }

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

  // Demo Mode Toggle Switch
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

  // Data update events -> refresh subviews
  window.addEventListener('case:changed', () => {
    initDashboardData();
  });
  window.addEventListener('evidence:updated', () => {
    refreshGraphData();
    loadWorkbenchArtifacts();
  });
  window.addEventListener('telemetry:updated', () => {
    refreshGraphData();
    renderTimelineEvents();
  });
  window.addEventListener('custody:updated', () => {
    refreshGraphData();
  });

  updateDemoModeUI();

  // Initialize Core Modules & Auth
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

  if (isAuthenticated()) {
    initDashboardData();
  }

  // URL Hash Navigation support (e.g. #map, #devices)
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && ['overview', 'map', 'cases', 'devices', 'calls', 'messages', 'telemetry', 'evidence', 'custody', 'audit', 'reports'].includes(initialHash)) {
    switchView(initialHash);
  }

  // Forensic UTC Timestamp Clock in Topbar
  const clockEl = document.getElementById('utc-clock');
  function updateClock() {
    if (clockEl) {
      clockEl.textContent = new Date().toUTCString().replace('GMT', 'UTC');
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMobileSidebar();
    }
  });
});
