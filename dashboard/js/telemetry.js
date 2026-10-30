/**
 * Project TraceX — Telemetry, Leaflet Forensic Mapping & Real-Time Hub
 * 
 * Features:
 * - Leaflet CartoDB Dark Matter tile provider WITHOUT retina watermark.
 * - OpenStreetMap and CartoDB Positron layer control with automatic tile error fallback.
 * - Chronological directional polyline trails and pulsing device pins.
 * - Strict separation between Live SOC WebSocket and Frontend Demo Mode simulation.
 * - Bounded exponential backoff for WebSocket reconnection (anti-DoS).
 * - Accurate WebSocket connection states: CONNECTED, RECONNECTING, DISCONNECTED, ERROR.
 * - Protection of sensitive data (no sensitive content logged to browser console).
 * - Complete XSS escaping on all DOM injections.
 */

import { api, showToast, escapeHtml } from './api.js';
import { getActiveCaseId } from './cases.js';
import { isDemoMode } from './demo.js';

let telemetryEvents = [];
let callLogs = [];
let messagesList = [];
let ws = null;
let reconnectTimer = null;
let heartbeatInterval = null;
let demoStreamInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

// Leaflet Map State
let leafletMap = null;
let deviceMarkers = {};
let devicePolylines = {};
let deviceTracks = {};
let selectedDeviceId = null;
let activeTimeRange = 'live';
let currentMapContainerId = null;

export async function loadTelemetryHistory() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    telemetryEvents = await api.get(`/telemetry/${encodeURIComponent(caseId)}?limit=200`);
    renderTelemetryFeed();
    updateTelemetryMetrics();
    renderOverviewRecentEvents();
    updateOverviewDeviceSummary();
    updateMapData();
  } catch (err) {
    if (!isDemoMode()) {
      console.warn('Telemetry history load deferred (backend offline or awaiting records):', err.message);
    }
  }

  // Load associated communications evidence
  await loadCallLogs();
  await loadMessages();
}

export async function loadCallLogs() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    callLogs = await api.get(`/telemetry/${encodeURIComponent(caseId)}/calls`);
    renderCallLogs();
    renderOverviewRecentEvents();
  } catch (err) {
    if (!isDemoMode()) {
      console.warn('Call logs load deferred:', err.message);
    }
  }
}

export async function loadMessages() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    messagesList = await api.get(`/telemetry/${encodeURIComponent(caseId)}/messages`);
    renderMessages();
    renderOverviewRecentEvents();
  } catch (err) {
    if (!isDemoMode()) {
      console.warn('Messages load deferred:', err.message);
    }
  }
}

export function renderCallLogs() {
  const tbody = document.getElementById('calls-table-body');
  const badge = document.getElementById('badge-call-count');
  if (badge) badge.textContent = `${callLogs.length} Records`;
  if (!tbody) return;

  if (callLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 24px;">No call logs collected yet from authorized mobile devices.</td></tr>`;
    return;
  }

  tbody.innerHTML = callLogs.map(c => `
    <tr>
      <td><span class="mono font-bold text-cyan">${escapeHtml(c.phone_number || 'Unknown')}</span></td>
      <td>
        <span class="badge ${c.call_type === 'INCOMING' ? 'badge-emerald' : c.call_type === 'OUTGOING' ? 'badge-cyan' : 'badge-rose'}">
          ${escapeHtml(c.call_type || 'CALL')}
        </span>
      </td>
      <td><span class="mono">${formatDuration(c.duration_seconds || 0)}</span></td>
      <td><span class="mono text-muted">${escapeHtml(c.device_id || 'N/A')}</span></td>
      <td><small class="text-muted">${escapeHtml(formatTimestamp(c.date || c.recorded_at))}</small></td>
    </tr>
  `).join('');
}

export function renderMessages() {
  const tbody = document.getElementById('messages-table-body');
  const badge = document.getElementById('badge-msg-count');
  if (badge) badge.textContent = `${messagesList.length} Records`;
  if (!tbody) return;

  if (messagesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 24px;">No SMS messages collected yet from authorized mobile devices.</td></tr>`;
    return;
  }

  tbody.innerHTML = messagesList.map(m => `
    <tr>
      <td><span class="mono font-bold text-cyan">${escapeHtml(m.sender || 'Unknown')}</span></td>
      <td>
        <span class="badge ${m.msg_type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan'}">
          ${escapeHtml(m.msg_type || 'SMS')}
        </span>
      </td>
      <td><span style="word-break: break-word;">${escapeHtml(m.body || '') || '<em class="text-muted">empty body</em>'}</span></td>
      <td><span class="mono text-muted">${escapeHtml(m.device_id || 'N/A')}</span></td>
      <td><small class="text-muted">${escapeHtml(formatTimestamp(m.date || m.recorded_at))}</small></td>
    </tr>
  `).join('');
}

function updateTelemetryMetrics() {
  const countEl = document.getElementById('metric-telemetry-events');
  if (countEl) countEl.textContent = telemetryEvents.length;

  const latestEl = document.getElementById('metric-latest-telemetry');
  if (latestEl) {
    if (telemetryEvents.length > 0 && telemetryEvents[0].latitude && telemetryEvents[0].longitude) {
      const lat = Number(telemetryEvents[0].latitude).toFixed(4);
      const lng = Number(telemetryEvents[0].longitude).toFixed(4);
      latestEl.textContent = `${lat}, ${lng}`;
    } else {
      latestEl.textContent = 'Awaiting fix...';
    }
  }
}

export function renderTelemetryFeed() {
  const tbody = document.getElementById('telemetry-table-body');
  if (!tbody) return;

  if (telemetryEvents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align: center; padding: 24px;">No telemetry received yet. Start the TraceX mobile collector on an authorized device.</td></tr>`;
    return;
  }

  tbody.innerHTML = telemetryEvents.slice(0, 50).map(e => `
    <tr>
      <td><span class="mono text-cyan">${escapeHtml(e.event_id || 'TLM-N/A')}</span></td>
      <td><span class="mono">${escapeHtml(e.device_id || 'N/A')}</span></td>
      <td><span class="badge badge-cyan">${escapeHtml(e.event_type || 'LOCATION')}</span></td>
      <td><span class="mono font-bold">${Number(e.latitude || 0).toFixed(6)}, ${Number(e.longitude || 0).toFixed(6)}</span></td>
      <td>±${e.accuracy ? Number(e.accuracy).toFixed(1) : 0}m</td>
      <td><span class="hash-pill" title="${escapeHtml(e.evidence_hash || '')}">${escapeHtml((e.evidence_hash || '').slice(0, 16))}...</span></td>
      <td><small class="text-muted">${e.received_at ? new Date(e.received_at).toLocaleTimeString() : 'N/A'}</small></td>
    </tr>
  `).join('');
}

// ----------------- OVERVIEW RECENT EVENTS & DEVICE SUMMARY -----------------

export function renderOverviewRecentEvents() {
  const container = document.getElementById('overview-recent-events');
  if (!container) return;

  const events = [];

  // Add telemetry location events
  telemetryEvents.slice(0, 8).forEach(t => {
    events.push({
      type: 'GPS LOCATION',
      detail: `${Number(t.latitude || 0).toFixed(5)}, ${Number(t.longitude || 0).toFixed(5)} (±${Number(t.accuracy || 0).toFixed(1)}m)`,
      device_id: t.device_id || 'N/A',
      timestamp: t.received_at ? new Date(t.received_at).getTime() : (t.timestamp || 0),
      badgeClass: 'badge-cyan',
      severity: 'NORMAL'
    });
  });

  // Add calls
  callLogs.slice(0, 5).forEach(c => {
    events.push({
      type: `${c.call_type || 'CALL'} LOG`,
      detail: `${c.phone_number || 'Unknown'} (${formatDuration(c.duration_seconds || 0)})`,
      device_id: c.device_id || 'N/A',
      timestamp: c.date ? new Date(c.date).getTime() : Date.now(),
      badgeClass: c.call_type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan',
      severity: c.call_type === 'MISSED' ? 'WARN' : 'INFO'
    });
  });

  // Add messages
  messagesList.slice(0, 5).forEach(m => {
    events.push({
      type: 'SMS MESSAGE',
      detail: `${m.sender || 'Unknown'}: "${(m.body || '').slice(0, 32)}..."`,
      device_id: m.device_id || 'N/A',
      timestamp: m.date ? new Date(m.date).getTime() : Date.now(),
      badgeClass: 'badge-emerald',
      severity: 'INFO'
    });
  });

  // Sort descending by timestamp
  events.sort((a, b) => b.timestamp - a.timestamp);

  if (events.length === 0) {
    container.innerHTML = `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
        Awaiting live forensic telemetry from enrolled Android devices.
      </div>
    `;
    return;
  }

  container.innerHTML = events.slice(0, 10).map(ev => `
    <div class="event-item">
      <div class="event-item-left">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="badge ${ev.badgeClass}">${escapeHtml(ev.type)}</span>
          <span class="mono" style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(ev.device_id)}</span>
        </div>
        <div class="event-detail">${escapeHtml(ev.detail)}</div>
      </div>
      <div class="event-meta">
        <span class="event-time">${ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'N/A'}</span>
      </div>
    </div>
  `).join('');
}

export function updateOverviewDeviceSummary() {
  const container = document.getElementById('overview-device-summary');
  if (!container) return;

  const latest = telemetryEvents[0];
  if (!latest) {
    container.innerHTML = `
      <div class="device-summary-item">
        <span class="device-summary-label">Target Device</span>
        <span class="device-summary-val mono text-muted">Awaiting enrollment</span>
      </div>
      <div class="device-summary-item">
        <span class="device-summary-label">Status</span>
        <span class="device-summary-val text-muted"><span class="pulse-dot amber"></span> Standby</span>
      </div>
      <div class="device-summary-item">
        <span class="device-summary-label">Last Coordinates</span>
        <span class="device-summary-val mono text-muted">Awaiting GPS fix</span>
      </div>
      <div class="device-summary-item">
        <span class="device-summary-label">Movement</span>
        <span class="device-summary-val text-muted">Stationary</span>
      </div>
      <div class="device-summary-item">
        <span class="device-summary-label">Battery Level</span>
        <span class="device-summary-val text-muted">--</span>
      </div>
    `;
    return;
  }

  const speedKmH = ((latest.speed || 0) * 3.6);
  const battery = latest.battery || latest.battery_level || 84;

  container.innerHTML = `
    <div class="device-summary-item">
      <span class="device-summary-label">Target Device</span>
      <span class="device-summary-val mono text-cyan">${escapeHtml(latest.device_id || 'DEV-ANDROID-01')}</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Status</span>
      <span class="device-summary-val text-emerald"><span class="pulse-dot"></span> Active Collection</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Last Coordinates</span>
      <span class="device-summary-val mono">${Number(latest.latitude || 0).toFixed(5)}, ${Number(latest.longitude || 0).toFixed(5)}</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Movement State</span>
      <span class="device-summary-val">${speedKmH > 1.0 ? `Moving (${speedKmH.toFixed(1)} km/h)` : 'Stationary'}</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Battery Level</span>
      <span class="device-summary-val ${battery < 20 ? 'text-rose' : 'text-emerald'}">${Number(battery)}%</span>
    </div>
  `;
}

// ----------------- LEAFLET FORENSIC MAP -----------------

export function initLeafletMap(containerId = 'live-map-canvas') {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!window.L) {
    container.innerHTML = `
      <div style="display:flex; height:100%; align-items:center; justify-content:center; flex-direction:column; color:var(--text-muted); font-size:12px; gap:6px; padding:20px; text-align:center;">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        <div>Leaflet map library unavailable or blocked by network.</div>
        <div class="mono" style="font-size: 11px;">Coordinates and trail data remain active in Telemetry Feed.</div>
      </div>
    `;
    return;
  }

  if (leafletMap && currentMapContainerId === containerId) {
    try {
      leafletMap.invalidateSize();
      updateMapData();
    } catch (e) {}
    return;
  }

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    deviceMarkers = {};
    devicePolylines = {};
    deviceTracks = {};
  }

  currentMapContainerId = containerId;

  try {
    // Initialize Leaflet map instance
    leafletMap = window.L.map(containerId, {
      zoomControl: true,
      attributionControl: false
    }).setView([37.7749, -122.4194], 13);

    // 1. Primary Base Layer: CartoDB Dark Matter (watermark-free)
    const cartoDark = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
    });

    // 2. OpenStreetMap Standard Layer (Guaranteed 100% free fallback)
    const osmStandard = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    });

    // 3. CartoDB Positron (High-contrast light layer)
    const cartoLight = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
    });

    // Graceful tile error handler: automatically fallback to OpenStreetMap if Carto tile fails
    cartoDark.on('tileerror', function (error, tile) {
      if (tile && error && error.coords) {
        tile.src = `https://tile.openstreetmap.org/${error.coords.z}/${error.coords.x}/${error.coords.y}.png`;
      }
    });

    // Add default layer
    cartoDark.addTo(leafletMap);

    // Layer Controls
    const baseLayers = {
      'Forensic Dark (CartoDB)': cartoDark,
      'OpenStreetMap Standard': osmStandard,
      'Positron Light (CartoDB)': cartoLight
    };
    window.L.control.layers(baseLayers, null, { position: 'topright' }).addTo(leafletMap);

    // Map attribution
    window.L.control.attribution({ position: 'bottomright' })
      .addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" style="color: #94a3b8;">OSM</a> &copy; <a href="https://carto.com" target="_blank" style="color: #94a3b8;">CARTO</a>')
      .addTo(leafletMap);

    setTimeout(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
        updateMapData();
      }
    }, 100);
  } catch (err) {
    console.warn('Map initialization deferred:', err);
  }
}

export function updateMapData(customEvents = null) {
  const events = customEvents || telemetryEvents;
  if (!leafletMap || !window.L || events.length === 0) return;

  // Group chronological coordinates by device
  const eventsByDevice = {};
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const devId = e.device_id;
    if (!devId || !e.latitude || !e.longitude) continue;
    if (!eventsByDevice[devId]) eventsByDevice[devId] = [];
    eventsByDevice[devId].push(e);
  }

  let bounds = [];

  Object.entries(eventsByDevice).forEach(([devId, devEvents]) => {
    const latLngs = devEvents.map(e => [e.latitude, e.longitude]);
    const latestEvent = devEvents[devEvents.length - 1];
    bounds.push(...latLngs);

    deviceTracks[devId] = latLngs;

    // 1. Draw Directional Movement Polyline Trail
    if (!devicePolylines[devId]) {
      devicePolylines[devId] = window.L.polyline(latLngs, {
        color: '#00C7E8',
        weight: 3,
        opacity: 0.9,
        smoothFactor: 1
      }).addTo(leafletMap);
    } else {
      devicePolylines[devId].setLatLngs(latLngs);
    }

    // 2. Custom Pulsing Device Marker
    const markerHtml = `
      <div class="tracex-marker-pin">
        <div class="pulse-ring"></div>
        <div class="core-dot"></div>
      </div>
    `;
    const icon = window.L.divIcon({
      className: 'tracex-div-icon',
      html: markerHtml,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    const popupContent = `
      <div style="font-family: var(--font-sans); color: #f1f5f9; padding: 4px; min-width: 170px;">
        <div style="font-size: 13px; font-weight: 700; color: #00C7E8;">${escapeHtml(devId)}</div>
        <div style="font-size: 11px; color: #9aaac0; margin-top: 2px;">Case: ${escapeHtml(latestEvent.case_id || 'N/A')}</div>
        <div style="margin-top: 6px; font-family: var(--font-mono); font-size: 11px;">
          ${Number(latestEvent.latitude || 0).toFixed(6)}, ${Number(latestEvent.longitude || 0).toFixed(6)}
        </div>
        <div style="margin-top: 4px; font-size: 11px; color: #10b981;">
          Speed: ${((latestEvent.speed || 0) * 3.6).toFixed(1)} km/h • ±${(latestEvent.accuracy || 0).toFixed(1)}m
        </div>
      </div>
    `;

    if (!deviceMarkers[devId]) {
      const marker = window.L.marker([latestEvent.latitude, latestEvent.longitude], { icon })
        .addTo(leafletMap)
        .bindPopup(popupContent);

      marker.on('click', () => {
        selectDeviceOnMap(devId);
      });

      deviceMarkers[devId] = marker;
    } else {
      deviceMarkers[devId].setLatLng([latestEvent.latitude, latestEvent.longitude]);
      deviceMarkers[devId].setPopupContent(popupContent);
    }
  });

  if (bounds.length > 0 && (!selectedDeviceId || !deviceMarkers[selectedDeviceId])) {
    try {
      leafletMap.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    } catch (e) {}
  }

  updateLiveStatusIndicators();
}

export function selectDeviceOnMap(deviceId) {
  selectedDeviceId = deviceId;
  const marker = deviceMarkers[deviceId];
  if (marker && leafletMap) {
    const latLng = marker.getLatLng();
    leafletMap.setView(latLng, 15, { animate: true });
    marker.openPopup();
  }

  document.querySelectorAll('.map-device-item').forEach(el => {
    if (el.getAttribute('data-device-id') === deviceId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  updateLiveStatusIndicators();
}

export function clearMapVisualTrail() {
  Object.values(devicePolylines).forEach(p => p.setLatLngs([]));
  showToast('Visual trail cleared for current view (evidence records preserved).', 'info');
}

export function filterLocationHistory(range) {
  activeTimeRange = range;
  const now = Date.now();
  let cutoff = 0;
  if (range === '1h') cutoff = now - (60 * 60 * 1000);
  else if (range === '6h') cutoff = now - (6 * 60 * 60 * 1000);
  else if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    cutoff = d.getTime();
  } else if (range === '7d') cutoff = now - (7 * 24 * 60 * 60 * 1000);

  if (cutoff > 0) {
    const filtered = telemetryEvents.filter(e => {
      const dt = e.received_at ? new Date(e.received_at).getTime() : (e.timestamp || 0);
      return dt >= cutoff;
    });
    updateMapData(filtered);
  } else {
    updateMapData();
  }
}

export function updateLiveStatusIndicators() {
  const statusBadge = document.getElementById('map-device-status-badge');
  const speedEl = document.getElementById('map-device-speed');
  const accuracyEl = document.getElementById('map-device-accuracy');
  const lastUpdateEl = document.getElementById('map-device-last-update');

  if (!statusBadge) return;

  const latest = telemetryEvents.find(e => !selectedDeviceId || e.device_id === selectedDeviceId) || telemetryEvents[0];
  if (!latest) {
    statusBadge.innerHTML = '<span class="pulse-dot rose"></span> OFFLINE';
    if (lastUpdateEl) lastUpdateEl.textContent = 'No signal recorded';
    return;
  }

  const lastDt = latest.received_at ? new Date(latest.received_at).getTime() : (latest.timestamp || 0);
  const deltaSec = Math.max(0, Math.floor((Date.now() - lastDt) / 1000));

  if (deltaSec > 180) {
    statusBadge.innerHTML = '<span class="pulse-dot rose"></span> OFFLINE';
  } else if (deltaSec > 45) {
    statusBadge.innerHTML = '<span class="pulse-dot amber"></span> SIGNAL STALE';
  } else {
    statusBadge.innerHTML = '<span class="pulse-dot"></span> ONLINE';
  }

  const speedKmH = ((latest.speed || 0) * 3.6);
  if (speedEl) speedEl.textContent = `${speedKmH.toFixed(1)} km/h`;
  if (accuracyEl) accuracyEl.textContent = `±${(latest.accuracy || 0).toFixed(1)} m`;

  if (lastUpdateEl) {
    if (deltaSec < 5) lastUpdateEl.textContent = 'Just now';
    else if (deltaSec < 60) lastUpdateEl.textContent = `${deltaSec}s ago`;
    else lastUpdateEl.textContent = `${Math.floor(deltaSec / 60)}m ago`;
  }
}

// ----------------- WEBSOCKET & DEMO STREAM REAL-TIME HUB -----------------

function updateWsIndicator(status) {
  const container = document.getElementById('ws-status-container');
  const textEl = document.getElementById('ws-status-text');
  if (!container || !textEl) return;

  container.className = 'live-indicator';

  switch (status) {
    case 'CONNECTED':
      container.classList.add('connected');
      textEl.innerHTML = '<span class="pulse-dot"></span> CONNECTED';
      break;
    case 'CONNECTING':
    case 'RECONNECTING':
      container.classList.add('reconnecting');
      textEl.innerHTML = '<span class="pulse-dot amber"></span> RECONNECTING...';
      break;
    case 'ERROR':
      container.classList.add('error');
      textEl.innerHTML = '<span class="pulse-dot rose"></span> ERROR';
      break;
    case 'DISCONNECTED':
      container.classList.add('disconnected');
      textEl.innerHTML = '<span class="pulse-dot" style="background:#64748b;"></span> DISCONNECTED';
      break;
    case 'DEMO':
      container.classList.add('reconnecting');
      textEl.innerHTML = '<span class="pulse-dot amber"></span> DEMO STREAM (LOCAL)';
      break;
  }
}

function determineWsUrl() {
  if (typeof window !== 'undefined' && window.__TRACEX_CONFIG__ && window.__TRACEX_CONFIG__.WS_URL) {
    return window.__TRACEX_CONFIG__.WS_URL;
  }
  if (typeof window !== 'undefined' && window.__TRACEX_WS_URL__) {
    return window.__TRACEX_WS_URL__;
  }
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws/investigation`;
}

export function initWebSocket() {
  // Clear any existing connection/intervals
  clearInterval(heartbeatInterval);
  clearTimeout(reconnectTimer);
  clearInterval(demoStreamInterval);
  reconnectAttempts = 0;

  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }

  // ---------------- DEMO MODE SIMULATION ----------------
  if (isDemoMode()) {
    updateWsIndicator('DEMO');

    let mockStep = 0;
    demoStreamInterval = setInterval(() => {
      mockStep++;
      const baseLat = 37.7749 + (Math.sin(mockStep * 0.2) * 0.003);
      const baseLng = -122.4194 + (Math.cos(mockStep * 0.2) * 0.003);

      const demoEvent = {
        event_id: `TEL-DEMO-LIVE-${mockStep}`,
        device_id: 'DEV-ANDROID-01',
        case_id: getActiveCaseId() || 'CASE-2026-001',
        event_type: 'LOCATION_UPDATE',
        latitude: baseLat,
        longitude: baseLng,
        accuracy: 3.5,
        speed: 4.2 + (Math.random() * 2),
        altitude: 20.0,
        battery: 84,
        evidence_hash: `demo_hash_${Date.now()}`,
        received_at: new Date().toISOString(),
        is_demo: true
      };

      telemetryEvents.unshift(demoEvent);
      if (telemetryEvents.length > 100) telemetryEvents.pop();

      renderTelemetryFeed();
      updateTelemetryMetrics();
      renderOverviewRecentEvents();
      updateOverviewDeviceSummary();
      updateMapData();
    }, 6000);

    return;
  }

  // ---------------- LIVE SOC WEBSOCKET (REAL BACKEND) ----------------
  const wsUrl = determineWsUrl();
  updateWsIndicator('DISCONNECTED');

  function connect() {
    try {
      reconnectAttempts++;
      updateWsIndicator(reconnectAttempts > 1 ? 'RECONNECTING' : 'CONNECTING');
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0;
        updateWsIndicator('CONNECTED');
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') return;
          const payload = JSON.parse(event.data);
          if (payload && typeof payload === 'object') {
            handleWebSocketEvent(payload);
          }
        } catch (e) {
          console.error('[TraceX WS] Error parsing payload:', e);
        }
      };

      ws.onclose = () => {
        clearInterval(heartbeatInterval);
        clearTimeout(reconnectTimer);

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          updateWsIndicator('RECONNECTING');
          const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
          reconnectTimer = setTimeout(connect, delay);
        } else {
          // Bounded backoff reached limit — switch to idle disconnected state
          updateWsIndicator('DISCONNECTED');
          // Slow background retry every 45s without flooding
          reconnectTimer = setTimeout(() => {
            reconnectAttempts = 0;
            connect();
          }, 45000);
        }
      };

      ws.onerror = () => {
        updateWsIndicator('ERROR');
        try { ws.close(); } catch (e) {}
      };
    } catch (err) {
      updateWsIndicator('ERROR');
    }
  }

  connect();

  window.addEventListener('case:changed', () => {
    loadTelemetryHistory();
  });
}

function handleWebSocketEvent(payload) {
  const eventType = payload.event || payload.type;
  const currentCaseId = getActiveCaseId();

  if (payload.case_id && currentCaseId && payload.case_id !== currentCaseId) {
    return;
  }

  switch (eventType) {
    case 'LOCATION_UPDATED':
    case 'TELEMETRY_UPDATE': {
      const data = payload.data || payload;
      if (data && data.latitude && data.longitude) {
        telemetryEvents.unshift(data);
        if (telemetryEvents.length > 500) telemetryEvents.pop();

        renderTelemetryFeed();
        updateTelemetryMetrics();
        renderOverviewRecentEvents();
        updateOverviewDeviceSummary();
        updateMapData();

        if (leafletMap && (!selectedDeviceId || selectedDeviceId === data.device_id)) {
          leafletMap.panTo([data.latitude, data.longitude], { animate: true, duration: 0.5 });
        }
      }
      break;
    }

    case 'CALL_LOG_ADDED':
    case 'CALL_LOGS_UPDATE': {
      if (payload.data && payload.data.phone_number) {
        callLogs.unshift(payload.data);
        renderCallLogs();
        renderOverviewRecentEvents();
        flashRow('calls-table-body');
      } else {
        loadCallLogs();
      }
      break;
    }

    case 'MESSAGE_ADDED':
    case 'MESSAGES_UPDATE': {
      if (payload.data && payload.data.sender) {
        messagesList.unshift(payload.data);
        renderMessages();
        renderOverviewRecentEvents();
        flashRow('messages-table-body');
      } else {
        loadMessages();
      }
      break;
    }

    case 'DEVICE_STATUS_CHANGED': {
      window.dispatchEvent(new CustomEvent('devices:refresh'));
      updateLiveStatusIndicators();
      break;
    }
  }
}

function flashRow(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (tbody && tbody.firstElementChild) {
    const row = tbody.firstElementChild;
    row.style.background = 'rgba(0, 199, 232, 0.15)';
    row.style.transition = 'background 600ms ease';
    setTimeout(() => {
      row.style.background = '';
    }, 1200);
  }
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}
