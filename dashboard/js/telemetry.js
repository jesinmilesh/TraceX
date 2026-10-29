import { api, showToast } from './api.js';
import { getActiveCaseId } from './cases.js';

let telemetryEvents = [];
let callLogs = [];
let messagesList = [];
let ws = null;
let reconnectTimer = null;
let heartbeatInterval = null;

// Leaflet Map State
let leafletMap = null;
let deviceMarkers = {};
let devicePolylines = {};
let deviceTracks = {};
let selectedDeviceId = null;
let activeTimeRange = 'live';

export async function loadTelemetryHistory() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    telemetryEvents = await api.get(`/telemetry/${caseId}?limit=200`);
    renderTelemetryFeed();
    updateTelemetryMetrics();
    updateMapData();
  } catch (err) {
    console.warn('Telemetry history load deferred:', err);
  }

  // Load associated communications evidence
  await loadCallLogs();
  await loadMessages();
}

export async function loadCallLogs() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    callLogs = await api.get(`/telemetry/${caseId}/calls`);
    renderCallLogs();
  } catch (err) {
    console.warn('Call logs load deferred:', err);
  }
}

export async function loadMessages() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    messagesList = await api.get(`/telemetry/${caseId}/messages`);
    renderMessages();
  } catch (err) {
    console.warn('Messages load deferred:', err);
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
      <td><span class="mono font-bold text-cyan">${c.phone_number || 'Unknown'}</span></td>
      <td>
        <span class="badge ${c.call_type === 'INCOMING' ? 'badge-emerald' : c.call_type === 'OUTGOING' ? 'badge-cyan' : 'badge-rose'}">
          ${c.call_type || 'CALL'}
        </span>
      </td>
      <td><span class="mono">${formatDuration(c.duration_seconds || 0)}</span></td>
      <td><span class="mono text-muted">${c.device_id || 'N/A'}</span></td>
      <td><small class="text-muted">${formatTimestamp(c.date || c.recorded_at)}</small></td>
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
      <td><span class="mono font-bold text-cyan">${m.sender || 'Unknown'}</span></td>
      <td>
        <span class="badge ${m.msg_type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan'}">
          ${m.msg_type || 'SMS'}
        </span>
      </td>
      <td><span style="word-break: break-word;">${escapeHtml(m.body || '') || '<em class="text-muted">empty body</em>'}</span></td>
      <td><span class="mono text-muted">${m.device_id || 'N/A'}</span></td>
      <td><small class="text-muted">${formatTimestamp(m.date || m.recorded_at)}</small></td>
    </tr>
  `).join('');
}

function updateTelemetryMetrics() {
  const countEl = document.getElementById('metric-telemetry-events');
  if (countEl) countEl.textContent = telemetryEvents.length;

  const latestEl = document.getElementById('metric-latest-telemetry');
  if (latestEl && telemetryEvents.length > 0) {
    const lat = telemetryEvents[0].latitude.toFixed(4);
    const lng = telemetryEvents[0].longitude.toFixed(4);
    latestEl.textContent = `${lat}, ${lng}`;
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
      <td><span class="mono text-cyan">${e.event_id || 'TLM-N/A'}</span></td>
      <td><span class="mono">${e.device_id || 'N/A'}</span></td>
      <td><span class="badge badge-cyan">${e.event_type || 'LOCATION'}</span></td>
      <td><span class="mono font-bold">${Number(e.latitude).toFixed(6)}, ${Number(e.longitude).toFixed(6)}</span></td>
      <td>±${e.accuracy ? Number(e.accuracy).toFixed(1) : 0}m</td>
      <td><span class="hash-pill" title="${e.evidence_hash || ''}">${(e.evidence_hash || '').slice(0, 16)}...</span></td>
      <td><small class="text-muted">${e.received_at ? new Date(e.received_at).toLocaleTimeString() : ''}</small></td>
    </tr>
  `).join('');
}

// ----------------- LEAFLET LIVE FORENSIC MAP -----------------
export function initLeafletMap(containerId = 'live-map-canvas') {
  const container = document.getElementById(containerId);
  if (!container || !window.L) return;

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    deviceMarkers = {};
    devicePolylines = {};
    deviceTracks = {};
  }

  // Initialize Leaflet map
  leafletMap = window.L.map(containerId, {
    zoomControl: true,
    attributionControl: false
  }).setView([37.7749, -122.4194], 13);

  // CartoDB Dark Matter tile layer for forensic SOC aesthetic
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(leafletMap);

  // Fallback attribution in corner
  window.L.control.attribution({ position: 'bottomright' })
    .addAttribution('&copy; <a href="https://openstreetmap.org" target="_blank" style="color: #64748b;">OSM</a> &copy; <a href="https://carto.com" target="_blank" style="color: #64748b;">CARTO</a>')
    .addTo(leafletMap);

  updateMapData();
}

export function updateMapData() {
  if (!leafletMap || !window.L || telemetryEvents.length === 0) return;

  // Group chronological coordinates by device
  const eventsByDevice = {};
  // Traverse backwards so points are sorted chronologically (oldest to newest)
  for (let i = telemetryEvents.length - 1; i >= 0; i--) {
    const e = telemetryEvents[i];
    const devId = e.device_id;
    if (!devId || !e.latitude || !e.longitude) continue;
    if (!eventsByDevice[devId]) eventsByDevice[devId] = [];
    eventsByDevice[devId].push(e);
  }

  let bounds = [];

  Object.entries(eventsByDevice).forEach(([devId, events]) => {
    const latLngs = events.map(e => [e.latitude, e.longitude]);
    const latestEvent = events[events.length - 1];
    bounds.push(...latLngs);

    deviceTracks[devId] = latLngs;

    // 1. Draw Movement Path Polyline
    if (!devicePolylines[devId]) {
      devicePolylines[devId] = window.L.polyline(latLngs, {
        color: '#06b6d4',
        weight: 3,
        opacity: 0.85,
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
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const popupContent = `
      <div style="font-family: var(--font-sans); color: #fff; padding: 4px; min-width: 180px;">
        <div style="font-size: 13px; font-weight: 700; color: #38bdf8;">${devId}</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Case: ${latestEvent.case_id}</div>
        <div style="margin-top: 8px; font-family: var(--font-mono); font-size: 11px;">
          ${latestEvent.latitude.toFixed(6)}, ${latestEvent.longitude.toFixed(6)}
        </div>
        <div style="margin-top: 4px; font-size: 11px; color: #10b981;">
          Speed: ${((latestEvent.speed || 0) * 3.6).toFixed(1)} km/h • ±${(latestEvent.accuracy || 0).toFixed(1)}m
        </div>
        <div style="margin-top: 4px; font-size: 10px; color: #64748b;">
          ${latestEvent.received_at ? new Date(latestEvent.received_at).toLocaleTimeString() : ''}
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

  // Fit bounds if first load or requested
  if (bounds.length > 0 && (!selectedDeviceId || !deviceMarkers[selectedDeviceId])) {
    try {
      leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } catch (e) {}
  }

  updateLiveStatusIndicators();
}

export function selectDeviceOnMap(deviceId) {
  selectedDeviceId = deviceId;
  const marker = deviceMarkers[deviceId];
  if (marker && leafletMap) {
    const latLng = marker.getLatLng();
    leafletMap.setView(latLng, 16, { animate: true });
    marker.openPopup();
  }

  // Highlight device item in sidebar
  document.querySelectorAll('.map-device-item').forEach(el => {
    if (el.getAttribute('data-device-id') === deviceId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  updateLiveStatusIndicators();
}

export async function filterLocationHistory(range = 'live') {
  activeTimeRange = range;
  const caseId = getActiveCaseId();
  if (!selectedDeviceId) return;

  let startTime = null;
  const now = Date.now();

  switch (range) {
    case '1h':
      startTime = now - (60 * 60 * 1000);
      break;
    case '6h':
      startTime = now - (6 * 60 * 60 * 1000);
      break;
    case 'today':
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      startTime = d.getTime();
      break;
    case 'all':
      startTime = null;
      break;
    default:
      startTime = null;
      break;
  }

  try {
    let url = `/devices/${selectedDeviceId}/location-history?case_id=${caseId}`;
    if (startTime) url += `&start_time=${startTime}`;

    const res = await api.get(url);
    if (res && res.history) {
      const latLngs = res.history.map(e => [e.latitude, e.longitude]);
      if (devicePolylines[selectedDeviceId]) {
        devicePolylines[selectedDeviceId].setLatLngs(latLngs);
        if (latLngs.length > 0) {
          leafletMap.fitBounds(latLngs, { padding: [30, 30] });
        }
      }
      showToast(`Loaded ${res.history.length} movement points (${range})`, 'info');
    }
  } catch (err) {
    console.warn('Failed to filter history:', err);
  }
}

export function clearMapVisualTrail() {
  Object.values(devicePolylines).forEach(p => p.setLatLngs([]));
  showToast('Visual trail cleared for current view (evidence records preserved).', 'info');
}

export function updateLiveStatusIndicators() {
  const statusBadge = document.getElementById('map-device-status-badge');
  const speedEl = document.getElementById('map-device-speed');
  const accuracyEl = document.getElementById('map-device-accuracy');
  const lastUpdateEl = document.getElementById('map-device-last-update');
  const movementEl = document.getElementById('map-device-movement');

  if (!statusBadge) return;

  const latest = telemetryEvents.find(e => !selectedDeviceId || e.device_id === selectedDeviceId) || telemetryEvents[0];
  if (!latest) {
    statusBadge.innerHTML = '<span class="pulse-dot" style="background: var(--color-rose);"></span> OFFLINE';
    if (lastUpdateEl) lastUpdateEl.textContent = 'No signal recorded';
    return;
  }

  const lastDt = latest.received_at ? new Date(latest.received_at).getTime() : (latest.timestamp || 0);
  const deltaSec = Math.max(0, Math.floor((Date.now() - lastDt) / 1000));

  if (deltaSec > 180) {
    statusBadge.innerHTML = '<span class="pulse-dot" style="background: var(--color-rose); box-shadow: 0 0 8px var(--color-rose);"></span> OFFLINE';
  } else if (deltaSec > 45) {
    statusBadge.innerHTML = '<span class="pulse-dot" style="background: var(--color-amber); box-shadow: 0 0 8px var(--color-amber);"></span> LOCATION SIGNAL STALE';
  } else {
    statusBadge.innerHTML = '<span class="pulse-dot"></span> ONLINE';
  }

  const speedKmH = ((latest.speed || 0) * 3.6);
  if (speedEl) speedEl.textContent = `${speedKmH.toFixed(1)} km/h`;
  if (movementEl) movementEl.textContent = speedKmH > 1.0 ? 'Moving' : 'Stationary';
  if (accuracyEl) accuracyEl.textContent = `±${(latest.accuracy || 0).toFixed(1)} m`;

  if (lastUpdateEl) {
    if (deltaSec < 5) lastUpdateEl.textContent = 'Just now';
    else if (deltaSec < 60) lastUpdateEl.textContent = `${deltaSec} seconds ago`;
    else lastUpdateEl.textContent = `${Math.floor(deltaSec / 60)} min ago`;
  }
}

// ----------------- WEBSOCKET REAL-TIME DISPATCHER -----------------
function determineWsUrl() {
  // 1. Build-time environment variable (configured in Vercel Production/Preview)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // 2. Window runtime configuration override
  if (typeof window !== 'undefined' && window.__TRACEX_WS_URL__) {
    return window.__TRACEX_WS_URL__;
  }

  // 3. LocalStorage override
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('tracex_ws_url');
    if (stored) return stored;
  }

  // 4. Derive from VITE_API_BASE_URL if configured
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    try {
      const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL);
      const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${apiUrl.host}/ws/investigation`;
    } catch (e) {
      // URL parsing fallback
    }
  }

  // 5. Same-host fallback
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws/investigation`;
}

export function initWebSocket() {
  const wsUrl = determineWsUrl();
  const statusIndicator = document.getElementById('ws-status-text');

  function connect() {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (statusIndicator) statusIndicator.textContent = 'SOC ONLINE';
        console.log('[TraceX WS] Secure telemetry stream established.');

        // Heartbeat ping
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
          handleWebSocketEvent(payload);
        } catch (e) {
          console.error('[TraceX WS] Error parsing payload:', e);
        }
      };

      ws.onclose = () => {
        if (statusIndicator) statusIndicator.textContent = 'RECONNECTING...';
        clearInterval(heartbeatInterval);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.warn('[TraceX WS] Telemetry socket warning, will reconnect');
        ws.close();
      };
    } catch (err) {
      console.warn('[TraceX WS] Socket connection failed:', err);
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

  // Validate case scope
  if (payload.case_id && currentCaseId && payload.case_id !== currentCaseId) {
    return;
  }

  switch (eventType) {
    case 'LOCATION_UPDATED':
    case 'TELEMETRY_UPDATE': {
      const data = payload.data || payload;
      telemetryEvents.unshift(data);
      if (telemetryEvents.length > 500) telemetryEvents.pop();

      renderTelemetryFeed();
      updateTelemetryMetrics();
      updateMapData();

      // If map is currently centered on this device, auto-pan
      if (leafletMap && (!selectedDeviceId || selectedDeviceId === data.device_id)) {
        leafletMap.panTo([data.latitude, data.longitude], { animate: true, duration: 0.5 });
      }
      break;
    }

    case 'CALL_LOG_ADDED':
    case 'CALL_LOGS_UPDATE': {
      if (payload.data && payload.data.phone_number) {
        callLogs.unshift(payload.data);
        renderCallLogs();
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

    case 'COLLECTION_STARTED':
    case 'COLLECTION_STOPPED': {
      window.dispatchEvent(new CustomEvent('devices:refresh'));
      showToast(`Device ${payload.device_id}: ${eventType}`, 'info');
      break;
    }
  }
}

function flashRow(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (tbody && tbody.firstElementChild) {
    const row = tbody.firstElementChild;
    row.style.background = 'rgba(6, 182, 212, 0.2)';
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
