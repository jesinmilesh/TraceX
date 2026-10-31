/**
 * Project TraceX - Enterprise Forensic Investigation Workbench Orchestrator
 * Pure Vanilla JavaScript ES6 Module
 */

import { initAuth, isAuthenticated } from './auth.js';
import { initCases, loadCases } from './cases.js';
import { initDevices, loadDevices, getDevicesList } from './devices.js';
import {
  initWebSocket,
  closeWebSocket,
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
import { showToast, API_BASE, setApiBase, checkServerHealth } from './api.js';
import { isValidCoordinate, renderGoogleMapsButton } from './maps.js';

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

  // Update mobile bottom nav active state
  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    const dest = btn.getAttribute('data-mobile-dest');
    let isActive = false;
    if (viewName === 'overview' && dest === 'home') isActive = true;
    else if (viewName === 'evidence' && dest === 'evidence') isActive = true;
    else if (viewName === 'timeline' && dest === 'history') isActive = true;
    else if (dest === 'more' && !['overview', 'evidence', 'timeline'].includes(viewName)) isActive = true;
    btn.classList.toggle('active', isActive);
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
    case 'timeline':
      setTimeout(() => initForensicTimeline('mobile-history-timeline-mount'), 100);
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
    updateMobileHomeInfo();
  }, 200);
}

export function updateMobileHomeInfo() {
  const caseSelect = document.getElementById('global-case-select');
  const titleEl = document.getElementById('mobile-case-title');
  const idEl = document.getElementById('mobile-case-id');
  const descEl = document.getElementById('mobile-case-desc');
  const deviceIdEl = document.getElementById('mobile-device-id');
  const uplinkEl = document.getElementById('mobile-uplink-status');

  if (caseSelect && titleEl && idEl) {
    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    if (selectedOption && selectedOption.value) {
      idEl.textContent = selectedOption.value;
      const parts = selectedOption.text.split('—');
      titleEl.textContent = parts.length > 1 ? parts.slice(1).join('—').trim() : selectedOption.text;
      if (descEl) descEl.textContent = 'Active Forensic Inquiry';
    } else {
      idEl.textContent = '—';
      titleEl.textContent = 'No Case Selected';
      if (descEl) descEl.textContent = '—';
    }
  }

  // Bind real enrolled device identity
  const devices = getDevicesList();
  if (deviceIdEl) {
    if (devices && devices.length > 0) {
      const d = devices[0];
      deviceIdEl.textContent = `${d.device_model || 'Android Unit'} (${d.device_id})`;
      if (uplinkEl) {
        const isLive = ['ONLINE', 'COLLECTION_ACTIVE', 'ACTIVE'].includes(d.status);
        uplinkEl.textContent = isLive ? 'ONLINE (ACTIVE UPLINK)' : 'STANDBY';
        uplinkEl.className = isLive ? 'text-accent' : 'text-muted';
      }
    } else {
      deviceIdEl.textContent = 'No Enrolled Unit';
      if (uplinkEl) {
        uplinkEl.textContent = 'AWAITING REGISTRATION';
        uplinkEl.className = 'text-muted';
      }
    }
  }

  const gmapsContainer = document.getElementById('mobile-case-gmaps-link');
  if (gmapsContainer && window.__tracex_telemetry_cache && window.__tracex_telemetry_cache.length > 0) {
    const t = window.__tracex_telemetry_cache[0];
    if (isValidCoordinate(t.latitude, t.longitude)) {
      gmapsContainer.innerHTML = renderGoogleMapsButton(t.latitude, t.longitude, 'Maps ↗', 'btn-xs');
    }
  }
}

function updateServerStatusUI(isHealthy = true) {
  const statusLabel = document.getElementById('server-status-label');
  const btn = document.getElementById('btn-server-config');
  if (statusLabel && btn) {
    if (isHealthy) {
      statusLabel.innerHTML = '<span class="pulse-dot"></span> API Server';
      btn.className = 'btn btn-secondary btn-sm';
    } else {
      statusLabel.innerHTML = '<span class="pulse-dot" style="background:#ef4444;"></span> Server Offline';
      btn.className = 'btn btn-secondary btn-sm';
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

  // Mobile Bottom Navigation Bar Destinations
  document.querySelectorAll('.mobile-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const dest = btn.getAttribute('data-mobile-dest');
      if (dest === 'home') {
        switchView('overview');
      } else if (dest === 'evidence') {
        switchView('evidence');
      } else if (dest === 'history') {
        switchView('timeline');
      } else if (dest === 'more') {
        openMobileSidebar();
      }
    });
  });

  // Mobile Topbar Hamburger / Drawer Button
  const mobileMenuDrawerBtn = document.getElementById('mobile-btn-menu-drawer');
  if (mobileMenuDrawerBtn) {
    mobileMenuDrawerBtn.addEventListener('click', () => {
      openMobileSidebar();
    });
  }

  // Mobile Collection Status Toggle
  const mobileToggleCollection = document.getElementById('mobile-btn-toggle-collection');
  let mobileCollectionRunning = true;
  if (mobileToggleCollection) {
    mobileToggleCollection.addEventListener('click', () => {
      mobileCollectionRunning = !mobileCollectionRunning;
      const statusText = document.getElementById('mobile-collection-status-text');
      if (mobileCollectionRunning) {
        mobileToggleCollection.innerHTML = '<span class="pulse-dot" style="background: #05100C;"></span> Collection Running';
        mobileToggleCollection.className = 'btn btn-primary';
        if (statusText) statusText.textContent = 'ACTIVE';
        showToast('Forensic acquisition streaming resumed', 'success');
      } else {
        mobileToggleCollection.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444;margin-right:6px;"></span> Collection Paused';
        mobileToggleCollection.className = 'btn btn-secondary';
        if (statusText) statusText.textContent = 'PAUSED';
        showToast('Forensic telemetry collection paused by investigator', 'warning');
      }
    });
  }

  // Server Configuration Modal
  const serverConfigBtn = document.getElementById('btn-server-config');
  const serverConfigModal = document.getElementById('modal-server-config');
  const closeServerConfigBtn = document.getElementById('btn-close-server-config-modal');
  const serverConfigForm = document.getElementById('form-server-config');
  const serverUrlInput = document.getElementById('cfg-server-url');
  const testConnBtn = document.getElementById('btn-test-server-connection');
  const diagEl = document.getElementById('server-health-diagnostic');

  if (serverConfigBtn && serverConfigModal) {
    serverConfigBtn.addEventListener('click', () => {
      const currentUrl = localStorage.getItem('tracex_api_base_url') || (API_BASE.replace(/\/api\/v1$/, ''));
      if (serverUrlInput) serverUrlInput.value = currentUrl;
      if (diagEl) diagEl.style.display = 'none';
      serverConfigModal.classList.add('active');
    });
  }

  if (closeServerConfigBtn && serverConfigModal) {
    closeServerConfigBtn.addEventListener('click', () => {
      serverConfigModal.classList.remove('active');
    });
  }

  if (testConnBtn && serverUrlInput && diagEl) {
    testConnBtn.addEventListener('click', async () => {
      const targetUrl = serverUrlInput.value.trim();
      diagEl.style.display = 'block';
      diagEl.style.background = 'rgba(255,255,255,0.05)';
      diagEl.style.color = '#94a3b8';
      diagEl.textContent = 'Testing connection to ' + targetUrl + '...';

      const res = await checkServerHealth(targetUrl);
      if (res.healthy) {
        diagEl.style.background = 'rgba(16, 185, 129, 0.15)';
        diagEl.style.color = '#10B981';
        diagEl.textContent = `Server Online! Database Status: ${res.data.database.toUpperCase()} (${res.data.environment})`;
      } else {
        diagEl.style.background = 'rgba(239, 68, 68, 0.15)';
        diagEl.style.color = '#EF4444';
        diagEl.textContent = `Connection Failed: ${res.error || 'Server unreachable'}`;
      }
    });
  }

  if (serverConfigForm && serverUrlInput && serverConfigModal) {
    serverConfigForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newUrl = serverUrlInput.value.trim();
      setApiBase(newUrl);
      serverConfigModal.classList.remove('active');
      showToast('Backend Server updated to ' + newUrl, 'success');
      initWebSocket();
      initDashboardData();
    });
  }

  // Initial Health Check
  checkServerHealth().then(res => {
    updateServerStatusUI(res.healthy);
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
  window.addEventListener('tracex:api-base-changed', () => {
    initWebSocket();
    initDashboardData();
  });

  // Initialize Core Modules & Auth
  initAuth(() => {
    initDashboardData();
    initWebSocket();
  });
  initCases();
  initDevices();
  initEvidence();
  initCustody();
  initAudit();
  initReports();

  window.addEventListener('auth:logout', () => {
    closeWebSocket();
  });

  if (isAuthenticated()) {
    initDashboardData();
    initWebSocket();
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
