/**
 * Project TraceX — Telemetry, Leaflet Forensic Mapping & Real-Time Hub
 * 
 * Features:
 * - Leaflet CartoDB Dark Matter tile provider WITHOUT retina watermark.
 * - OpenStreetMap and CartoDB Positron layer control with automatic tile error fallback.
 * - Chronological directional polyline trails and pulsing device pins.
 * - Color Palette: Jet Black (#05080F) × Deep Navy (#080D18 / #0D1424) × Electric Blue (#00A6FF / #1677FF).
 * - Strict separation between Live SOC WebSocket and Frontend Demo Mode simulation.
 * - Bounded exponential backoff for WebSocket reconnection (anti-DoS).
 * - Accurate WebSocket connection states: CONNECTED, RECONNECTING, DISCONNECTED, ERROR.
 * - Complete XSS escaping on all dynamic DOM injections.
 */

import { api, showToast, escapeHtml, API_BASE } from './api.js';
import { getActiveCaseId } from './cases.js';
import { isValidCoordinate, renderGoogleMapsButton, renderLocationObservationCard } from './maps.js';

let telemetryEvents = [];
let callLogs = [];
let messagesList = [];

export function getTelemetryEvents() { return telemetryEvents; }
export function getCallLogs() { return callLogs; }
export function getMessagesList() { return messagesList; }
let ws = null;
let reconnectTimer = null;
let heartbeatInterval = null;
let demoStreamInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

// Runtime Map State
let googleMap = null;
let googleMarkers = {};
let googlePolylines = {};
let googleFixMarkers = {};
let googleInfoWindows = {};
let hasAutoCenteredByDevice = {};
let isPathVisible = true;
let isGoogleMapsLoaded = false;
let mapsLoadingPromise = null;
let activeMapProvider = 'google_maps';

// Leaflet Fallback State
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
    window.__tracex_telemetry_cache = telemetryEvents;
    renderTelemetryFeed();
    updateTelemetryMetrics();
    renderOverviewRecentEvents();
    updateOverviewDeviceSummary();
    updateMapData();
    window.dispatchEvent(new CustomEvent('telemetry:updated', { detail: { telemetryEvents } }));
  } catch (err) {
    console.warn('Telemetry history load deferred (backend offline or awaiting records):', err.message);
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
    window.__tracex_calls_cache = callLogs;
    renderCallLogs();
    renderOverviewRecentEvents();
  } catch (err) {
    console.warn('Call logs load deferred:', err.message);
  }
}

export async function loadMessages() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    messagesList = await api.get(`/telemetry/${encodeURIComponent(caseId)}/messages`);
    window.__tracex_messages_cache = messagesList;
    renderMessages();
    renderOverviewRecentEvents();
  } catch (err) {
    console.warn('Messages load deferred:', err.message);
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
        <span class="badge ${c.call_type === 'INCOMING' ? 'badge-emerald' : c.call_type === 'OUTGOING' ? 'badge-moss' : 'badge-rose'}">
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
        <span class="badge ${m.msg_type === 'INCOMING' ? 'badge-emerald' : 'badge-moss'}">
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

  const mobileCountGps = document.getElementById('mobile-count-gps');
  if (mobileCountGps) mobileCountGps.textContent = telemetryEvents.length;

  const mobileCountCalls = document.getElementById('mobile-count-calls');
  if (mobileCountCalls) mobileCountCalls.textContent = callLogs.length;

  const mobileCountMsgs = document.getElementById('mobile-count-messages');
  if (mobileCountMsgs) mobileCountMsgs.textContent = messagesList.length;

  const latestEl = document.getElementById('metric-latest-telemetry');
  if (latestEl) {
    if (telemetryEvents.length > 0 && isValidCoordinate(telemetryEvents[0].latitude, telemetryEvents[0].longitude)) {
      const lat = Number(telemetryEvents[0].latitude).toFixed(4);
      const lng = Number(telemetryEvents[0].longitude).toFixed(4);
      latestEl.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:5px;">
          <span>${lat}, ${lng}</span>
          ${renderGoogleMapsButton(telemetryEvents[0].latitude, telemetryEvents[0].longitude, 'Maps ↗', 'btn-xs')}
        </span>
      `;
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
      <td><span class="badge badge-accent">${escapeHtml(e.event_type || 'LOCATION')}</span></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="mono font-bold">${Number(e.latitude || 0).toFixed(6)}, ${Number(e.longitude || 0).toFixed(6)}</span>
          ${renderGoogleMapsButton(e.latitude, e.longitude, 'View in Google Maps ↗', 'btn-xs')}
        </div>
      </td>
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
      badgeClass: 'badge-emerald',
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
      badgeClass: c.call_type === 'INCOMING' ? 'badge-emerald' : 'badge-moss',
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
  const battery = latest.battery !== undefined ? latest.battery : (latest.battery_level !== undefined ? latest.battery_level : '—');

  container.innerHTML = `
    <div class="device-summary-item">
      <span class="device-summary-label">Target Device</span>
      <span class="device-summary-val mono text-cyan">${escapeHtml(latest.device_id || '—')}</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Status</span>
      <span class="device-summary-val text-emerald"><span class="pulse-dot"></span> Active Collection</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Last Coordinates</span>
      <span class="device-summary-val mono" style="display: flex; align-items: center; gap: 6px;">
        <span>${Number(latest.latitude || 0).toFixed(5)}, ${Number(latest.longitude || 0).toFixed(5)}</span>
        ${renderGoogleMapsButton(latest.latitude, latest.longitude, 'Maps ↗', 'btn-xs')}
      </span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Movement State</span>
      <span class="device-summary-val">${speedKmH > 1.0 ? `Moving (${speedKmH.toFixed(1)} km/h)` : 'Stationary'}</span>
    </div>
    <div class="device-summary-item">
      <span class="device-summary-label">Battery Level</span>
      <span class="device-summary-val ${battery < 20 ? 'text-rose' : 'text-emerald'}">${battery !== '—' ? `${Number(battery)}%` : '—'}</span>
    </div>
  `;
}

// ----------------- LEAFLET FORENSIC MAP -----------------

// ----------------- GOOGLE MAPS FORENSIC ENGINE -----------------

export async function loadGoogleMapsScript() {
  if (window.google && window.google.maps) {
    isGoogleMapsLoaded = true;
    return true;
  }
  if (mapsLoadingPromise) {
    return mapsLoadingPromise;
  }

  mapsLoadingPromise = (async () => {
    let key = '';

    // 1. Check window config or local storage override
    if (window.__TRACEX_CONFIG__ && window.__TRACEX_CONFIG__.GOOGLE_MAPS_API_KEY) {
      key = window.__TRACEX_CONFIG__.GOOGLE_MAPS_API_KEY.trim();
    } else if (typeof localStorage !== 'undefined' && localStorage.getItem('tracex_maps_key')) {
      key = localStorage.getItem('tracex_maps_key').trim();
    }

    // 2. Fetch from secure server configuration endpoint
    if (!key) {
      try {
        const cfg = await api.get('/config/maps');
        if (cfg && cfg.google_maps_api_key) {
          key = cfg.google_maps_api_key.trim();
        }
      } catch (err) {
        console.warn('Backend maps configuration query deferred:', err.message);
      }
    }

    if (!key) {
      console.warn('GOOGLE_MAPS_API_KEY is not configured in Vercel or environment.');
      return false;
    }

    return new Promise((resolve) => {
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        if (window.google && window.google.maps) {
          isGoogleMapsLoaded = true;
          return resolve(true);
        }
        existingScript.addEventListener('load', () => {
          isGoogleMapsLoaded = true;
          resolve(true);
        });
        existingScript.addEventListener('error', () => resolve(false));
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry,places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        isGoogleMapsLoaded = true;
        resolve(true);
      };
      script.onerror = () => {
        console.error('Failed to load Google Maps script. Check domain restrictions, HTTP referrer, or API key.');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  })();

  return mapsLoadingPromise;
}

export async function initMap(containerId = 'live-map-canvas') {
  const container = document.getElementById(containerId);
  if (!container) return;
  currentMapContainerId = containerId;

  const mapsAvailable = await loadGoogleMapsScript();

  if (mapsAvailable && window.google && window.google.maps) {
    activeMapProvider = 'google_maps';
    initGoogleMap(containerId);
  } else if (window.L) {
    activeMapProvider = 'leaflet';
    initLeafletFallback(containerId);
  } else {
    renderMapUnconfiguredState(container);
  }

  setupMapControls();
  renderMapDevicesList();
}

// Backwards compatibility alias for app.js
export const initLeafletMap = initMap;

function initGoogleMap(containerId) {
  const container = document.getElementById(containerId);
  if (!container || !window.google || !window.google.maps) return;

  if (googleMap && currentMapContainerId === containerId) {
    try {
      google.maps.event.trigger(googleMap, 'resize');
      updateMapData();
    } catch (e) {}
    return;
  }

  container.innerHTML = '';
  googleMarkers = {};
  googlePolylines = {};
  googleFixMarkers = {};
  googleInfoWindows = {};

  const mapOptions = {
    zoom: 14,
    center: { lat: 37.7749, lng: -122.4194 },
    mapTypeId: google.maps.MapTypeId.HYBRID,
    gestureHandling: 'greedy',
    fullscreenControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT
    },
    streetViewControl: false,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER
    }
  };

  googleMap = new google.maps.Map(container, mapOptions);

  setTimeout(() => {
    if (googleMap) {
      google.maps.event.trigger(googleMap, 'resize');
      updateMapData();
    }
  }, 100);
}

function initLeafletFallback(containerId) {
  const container = document.getElementById(containerId);
  if (!container || !window.L) return;

  if (leafletMap && currentMapContainerId === containerId) {
    try {
      leafletMap.invalidateSize();
      updateMapData();
    } catch (e) {}
    return;
  }

  if (leafletMap) {
    try { leafletMap.remove(); } catch (e) {}
    leafletMap = null;
    deviceMarkers = {};
    devicePolylines = {};
    deviceTracks = {};
  }

  container.innerHTML = '';

  leafletMap = window.L.map(containerId, {
    zoomControl: true,
    attributionControl: false
  }).setView([37.7749, -122.4194], 13);

  const cartoDark = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; CARTO &copy; OpenStreetMap'
  });
  cartoDark.addTo(leafletMap);

  setTimeout(() => {
    if (leafletMap) {
      leafletMap.invalidateSize();
      updateMapData();
    }
  }, 100);
}

function renderMapUnconfiguredState(container) {
  container.innerHTML = `
    <div style="display:flex; height:100%; align-items:center; justify-content:center; flex-direction:column; color:var(--text-muted); font-size:12px; gap:8px; padding:24px; text-align:center;">
      <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
      <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">Google Maps Configuration Required</div>
      <div style="max-width: 380px; line-height: 1.5;">
        Configure <code style="color: var(--color-cyan);">GOOGLE_MAPS_API_KEY</code> in Vercel Environment Variables to activate production satellite, hybrid, and real-time movement tracking.
      </div>
      <div class="mono text-muted" style="font-size: 11px;">Coordinates and cryptographic evidence remain active in Telemetry Feed.</div>
    </div>
  `;
}

export function updateMapData(customEvents = null) {
  const events = customEvents || telemetryEvents;

  if (activeMapProvider === 'google_maps' && googleMap && window.google && window.google.maps) {
    updateGoogleMapData(events);
  } else if (leafletMap && window.L) {
    updateLeafletMapData(events);
  }

  updateLiveStatusIndicators();
  renderMapDevicesList();
}

function updateGoogleMapData(events) {
  if (!googleMap || !window.google || !window.google.maps) return;

  if (!events || events.length === 0) {
    Object.values(googleMarkers).forEach(m => m.setMap(null));
    Object.values(googlePolylines).forEach(p => p.setMap(null));
    googleMarkers = {};
    googlePolylines = {};
    return;
  }

  const eventsByDevice = {};
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const devId = e.device_id;
    if (!devId || !isValidCoordinate(e.latitude, e.longitude)) continue;
    if (!eventsByDevice[devId]) eventsByDevice[devId] = [];
    eventsByDevice[devId].push(e);
  }

  const bounds = new google.maps.LatLngBounds();
  let validCoordsCount = 0;

  Object.entries(eventsByDevice).forEach(([devId, devEvents]) => {
    const path = devEvents.map(e => new google.maps.LatLng(Number(e.latitude), Number(e.longitude)));
    const latestEvent = devEvents[devEvents.length - 1];
    const latestPos = new google.maps.LatLng(Number(latestEvent.latitude), Number(latestEvent.longitude));

    path.forEach(pt => {
      bounds.extend(pt);
      validCoordsCount++;
    });

    // 1. Google Maps Movement Polyline Path
    if (!googlePolylines[devId]) {
      googlePolylines[devId] = new google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: devId === selectedDeviceId ? '#00E5FF' : '#00A6FF',
        strokeOpacity: 0.9,
        strokeWeight: 3.5,
        map: isPathVisible ? googleMap : null
      });
    } else {
      googlePolylines[devId].setPath(path);
      googlePolylines[devId].setMap(isPathVisible ? googleMap : null);
    }

    // 2. Custom Device Marker & Forensic Popup
    const speedKmH = ((latestEvent.speed || 0) * 3.6).toFixed(1);
    const accuracy = (latestEvent.accuracy || 0).toFixed(1);
    const timeStr = latestEvent.timestamp ? new Date(latestEvent.timestamp).toLocaleTimeString() : (latestEvent.received_at ? new Date(latestEvent.received_at).toLocaleTimeString() : 'Just now');

    const popupHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0F172A; padding: 6px 8px; min-width: 220px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8F0; padding-bottom: 5px; margin-bottom: 6px;">
          <strong style="color: #0284C7; font-size: 13px;">${escapeHtml(devId)}</strong>
          <span style="font-size: 10px; font-weight: 700; background: #DCFCE7; color: #166534; padding: 2px 6px; border-radius: 4px;">ONLINE</span>
        </div>
        <div style="font-size: 11px; color: #475569; margin-bottom: 2px;">
          Case: <strong>${escapeHtml(latestEvent.case_id || 'N/A')}</strong>
        </div>
        <div style="font-size: 10.5px; color: #64748B; margin-bottom: 5px;">
          Last Update: <strong>${escapeHtml(timeStr)}</strong>
        </div>
        <div style="font-family: monospace; font-size: 11px; font-weight: 600; background: #F1F5F9; padding: 4px 6px; border-radius: 4px; color: #1E293B; margin-bottom: 5px;">
          ${Number(latestEvent.latitude).toFixed(6)}, ${Number(latestEvent.longitude).toFixed(6)}
        </div>
        <div style="font-size: 10.5px; color: #0284C7; margin-bottom: 8px;">
          Speed: <strong>${speedKmH} km/h</strong> • Accuracy: <strong>±${accuracy} m</strong>
        </div>
        <div>
          <a href="https://www.google.com/maps/search/?api=1&query=${latestEvent.latitude},${latestEvent.longitude}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #0284C7; color: #FFF; font-size: 10.5px; font-weight: 600; padding: 4px 9px; border-radius: 4px; text-decoration: none;">
            Open in Google Maps ↗
          </a>
        </div>
      </div>
    `;

    if (!googleInfoWindows[devId]) {
      googleInfoWindows[devId] = new google.maps.InfoWindow({ content: popupHtml });
    } else {
      googleInfoWindows[devId].setContent(popupHtml);
    }

    const pinSvg = {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
      fillColor: devId === selectedDeviceId ? '#39FFB8' : '#00A6FF',
      fillOpacity: 1,
      strokeWeight: 1.5,
      strokeColor: '#FFFFFF',
      scale: 1.6,
      anchor: new google.maps.Point(12, 22)
    };

    if (!googleMarkers[devId]) {
      const marker = new google.maps.Marker({
        position: latestPos,
        map: googleMap,
        title: `${devId} (Case: ${latestEvent.case_id})`,
        icon: pinSvg,
        animation: google.maps.Animation.DROP
      });

      marker.addListener('click', () => {
        selectDeviceOnMap(devId);
        googleInfoWindows[devId].open(googleMap, marker);
      });

      googleMarkers[devId] = marker;
    } else {
      googleMarkers[devId].setPosition(latestPos);
      googleMarkers[devId].setIcon(pinSvg);
    }

    // Auto-center on first valid location fix only
    if (!hasAutoCenteredByDevice[devId]) {
      googleMap.panTo(latestPos);
      hasAutoCenteredByDevice[devId] = true;
    }
  });

  if (validCoordsCount > 1 && !selectedDeviceId) {
    googleMap.fitBounds(bounds);
  }
}

function updateLeafletMapData(events) {
  if (!leafletMap || !window.L || !events || events.length === 0) return;

  const eventsByDevice = {};
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const devId = e.device_id;
    if (!devId || !isValidCoordinate(e.latitude, e.longitude)) continue;
    if (!eventsByDevice[devId]) eventsByDevice[devId] = [];
    eventsByDevice[devId].push(e);
  }

  let bounds = [];

  Object.entries(eventsByDevice).forEach(([devId, devEvents]) => {
    const latLngs = devEvents.map(e => [e.latitude, e.longitude]);
    const latestEvent = devEvents[devEvents.length - 1];
    bounds.push(...latLngs);

    deviceTracks[devId] = latLngs;

    if (!devicePolylines[devId]) {
      devicePolylines[devId] = window.L.polyline(latLngs, {
        color: '#00A6FF',
        weight: 3,
        opacity: 0.85
      }).addTo(leafletMap);
    } else {
      devicePolylines[devId].setLatLngs(latLngs);
      if (isPathVisible) devicePolylines[devId].addTo(leafletMap);
      else devicePolylines[devId].remove();
    }

    const markerHtml = `
      <div class="tracex-marker-pin">
        <div class="pulse-ring" style="border-color: #00A6FF;"></div>
        <div class="core-dot" style="background: #00A6FF;"></div>
      </div>
    `;
    const icon = window.L.divIcon({
      className: 'tracex-div-icon',
      html: markerHtml,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });

    const popupContent = `
      <div style="font-family: var(--font-sans); color: #F1F5F9; padding: 6px; min-width: 195px;">
        <div style="font-size: 13px; font-weight: 700; color: #00A6FF;">${escapeHtml(devId)}</div>
        <div style="font-size: 10.5px; color: #94A3B8; margin-top: 2px;">Case: ${escapeHtml(latestEvent.case_id || 'N/A')}</div>
        <div style="margin-top: 6px; font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;">
          ${Number(latestEvent.latitude || 0).toFixed(6)}, ${Number(latestEvent.longitude || 0).toFixed(6)}
        </div>
        <div style="margin-top: 4px; font-size: 10.5px; color: #60A5FA;">
          Speed: ${((latestEvent.speed || 0) * 3.6).toFixed(1)} km/h • ±${(latestEvent.accuracy || 0).toFixed(1)}m
        </div>
      </div>
    `;

    if (!deviceMarkers[devId]) {
      const marker = window.L.marker([latestEvent.latitude, latestEvent.longitude], { icon })
        .addTo(leafletMap)
        .bindPopup(popupContent);

      marker.on('click', () => selectDeviceOnMap(devId));
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
}

export function selectDeviceOnMap(deviceId) {
  selectedDeviceId = deviceId;

  if (activeMapProvider === 'google_maps' && googleMap && googleMarkers[deviceId]) {
    const marker = googleMarkers[deviceId];
    googleMap.panTo(marker.getPosition());
    googleMap.setZoom(16);
    if (googleInfoWindows[deviceId]) {
      googleInfoWindows[deviceId].open(googleMap, marker);
    }

    Object.entries(googlePolylines).forEach(([id, poly]) => {
      poly.setOptions({
        strokeColor: id === deviceId ? '#00E5FF' : '#334155',
        strokeWeight: id === deviceId ? 4 : 2,
        strokeOpacity: id === deviceId ? 1.0 : 0.4
      });
    });
  } else if (leafletMap && deviceMarkers[deviceId]) {
    const marker = deviceMarkers[deviceId];
    leafletMap.setView(marker.getLatLng(), 15, { animate: true });
    marker.openPopup();
  }

  document.querySelectorAll('.map-device-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-device-id') === deviceId);
  });

  updateLiveStatusIndicators();
}

export function locateSelectedDevice() {
  const targetId = selectedDeviceId || (telemetryEvents[0] && telemetryEvents[0].device_id);
  if (!targetId) {
    showToast('No active mobile device selected to locate.', 'warning');
    return;
  }
  selectDeviceOnMap(targetId);
  showToast(`Centered map on device ${targetId}`, 'info');
}

export function fitMapTrail() {
  if (activeMapProvider === 'google_maps' && googleMap) {
    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    telemetryEvents.forEach(e => {
      if ((!selectedDeviceId || e.device_id === selectedDeviceId) && isValidCoordinate(e.latitude, e.longitude)) {
        bounds.extend(new google.maps.LatLng(Number(e.latitude), Number(e.longitude)));
        count++;
      }
    });
    if (count > 0) {
      googleMap.fitBounds(bounds);
      showToast(`Fit map to ${count} location fixes`, 'info');
    }
  } else if (leafletMap) {
    const pts = [];
    telemetryEvents.forEach(e => {
      if ((!selectedDeviceId || e.device_id === selectedDeviceId) && isValidCoordinate(e.latitude, e.longitude)) {
        pts.push([e.latitude, e.longitude]);
      }
    });
    if (pts.length > 0) {
      leafletMap.fitBounds(pts, { padding: [35, 35] });
      showToast(`Fit map to ${pts.length} location fixes`, 'info');
    }
  }
}

export function toggleMapTrail() {
  isPathVisible = !isPathVisible;
  if (activeMapProvider === 'google_maps') {
    Object.values(googlePolylines).forEach(p => p.setMap(isPathVisible ? googleMap : null));
  } else if (leafletMap) {
    Object.values(devicePolylines).forEach(p => {
      if (isPathVisible) p.addTo(leafletMap);
      else p.remove();
    });
  }
  const btn = document.getElementById('btn-toggle-path');
  if (btn) btn.textContent = isPathVisible ? 'Hide Path' : 'Show Path';
  showToast(isPathVisible ? 'Movement path displayed.' : 'Movement path hidden.', 'info');
}

export function clearMapVisualTrail() {
  if (activeMapProvider === 'google_maps') {
    Object.values(googlePolylines).forEach(p => p.setPath([]));
  } else {
    Object.values(devicePolylines).forEach(p => p.setLatLngs([]));
  }
  showToast('Visual trail cleared for current view (evidence records preserved in database).', 'info');
}

export function scrubMapTimeline(ratio = 1.0) {
  if (!telemetryEvents || !telemetryEvents.length) return;
  const clampedRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  const count = Math.max(1, Math.round(telemetryEvents.length * clampedRatio));
  const sliced = telemetryEvents.slice(0, count);
  updateMapData(sliced);
}

export function renderMapDevicesList() {
  const container = document.getElementById('map-devices-list');
  const countBadge = document.getElementById('map-devices-count');
  if (!container) return;

  const devicesMap = {};
  telemetryEvents.forEach(e => {
    if (e.device_id && !devicesMap[e.device_id]) {
      devicesMap[e.device_id] = e;
    }
  });

  const devices = Object.values(devicesMap);
  if (countBadge) countBadge.textContent = `${devices.length} Online`;

  if (devices.length === 0) {
    container.innerHTML = `
      <div class="text-muted" style="padding: 16px; font-size: 11.5px; text-align: center;">
        Awaiting authorized mobile location telemetry.
      </div>
    `;
    return;
  }

  container.innerHTML = devices.map(d => {
    const isSel = d.device_id === selectedDeviceId;
    const speed = ((d.speed || 0) * 3.6).toFixed(1);
    return `
      <div class="map-device-item ${isSel ? 'active' : ''}" data-device-id="${escapeHtml(d.device_id)}" style="cursor: pointer; padding: 10px 12px; border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="mono font-bold text-cyan" style="font-size: 12px;">${escapeHtml(d.device_id)}</span>
          <span class="badge badge-emerald" style="font-size: 9.5px;">ACTIVE</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
          Case: ${escapeHtml(d.case_id || 'N/A')}
        </div>
        <div class="mono" style="font-size: 10.5px; color: var(--text-secondary); margin-top: 3px;">
          ${Number(d.latitude || 0).toFixed(4)}, ${Number(d.longitude || 0).toFixed(4)}
        </div>
        <div style="font-size: 10px; color: var(--color-cyan); margin-top: 2px;">
          Speed: ${speed} km/h • ±${(d.accuracy || 0).toFixed(1)}m
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.map-device-item').forEach(el => {
    el.addEventListener('click', () => {
      const devId = el.getAttribute('data-device-id');
      if (devId) selectDeviceOnMap(devId);
    });
  });
}

function setupMapControls() {
  const btnLocate = document.getElementById('btn-locate-device');
  if (btnLocate && !btnLocate._bound) {
    btnLocate.addEventListener('click', locateSelectedDevice);
    btnLocate._bound = true;
  }

  const btnFit = document.getElementById('btn-fit-bounds');
  if (btnFit && !btnFit._bound) {
    btnFit.addEventListener('click', fitMapTrail);
    btnFit._bound = true;
  }

  const btnToggle = document.getElementById('btn-toggle-path');
  if (btnToggle && !btnToggle._bound) {
    btnToggle.addEventListener('click', toggleMapTrail);
    btnToggle._bound = true;
  }

  const btnClear = document.getElementById('btn-clear-trail');
  if (btnClear && !btnClear._bound) {
    btnClear.addEventListener('click', clearMapVisualTrail);
    btnClear._bound = true;
  }

  document.querySelectorAll('.map-time-btn').forEach(btn => {
    if (!btn._bound) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-time-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterLocationHistory(btn.getAttribute('data-range'));
      });
      btn._bound = true;
    }
  });
}
  showToast('Visual trail cleared for current view (evidence records preserved).', 'info');

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
      textEl.innerHTML = '<span class="pulse-dot" style="background:#4B5752;"></span> DISCONNECTED';
      break;
  }
}

function determineWsUrl() {
  const token = localStorage.getItem('tracex_token');
  let baseWs = '';
  if (typeof window !== 'undefined' && window.__TRACEX_CONFIG__ && window.__TRACEX_CONFIG__.WS_URL) {
    baseWs = window.__TRACEX_CONFIG__.WS_URL;
  } else if (typeof window !== 'undefined' && window.__TRACEX_WS_URL__) {
    baseWs = window.__TRACEX_WS_URL__;
  } else if (typeof API_BASE === 'string' && API_BASE.startsWith('http')) {
    try {
      const u = new URL(API_BASE);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      baseWs = `${wsProto}//${u.host}/ws/investigation`;
    } catch (e) {}
  }
  if (!baseWs) {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    baseWs = `${protocol}//${loc.host}/ws/investigation`;
  }
  return token ? `${baseWs}?token=${encodeURIComponent(token)}` : baseWs;
}

export function closeWebSocket() {
  clearInterval(heartbeatInterval);
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
  updateWsIndicator('DISCONNECTED');
}

export function initWebSocket() {
  // Clear any existing connection/intervals
  clearInterval(heartbeatInterval);
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;

  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }

  // Guard: Do not initiate authenticated WebSocket if not authenticated
  const token = localStorage.getItem('tracex_token');
  if (!token) {
    updateWsIndicator('DISCONNECTED');
    return;
  }

  // ---------------- LIVE SOC WEBSOCKET (REAL BACKEND) ----------------
  const wsUrl = determineWsUrl();
  updateWsIndicator('DISCONNECTED');

  function connect() {
    if (!localStorage.getItem('tracex_token')) {
      updateWsIndicator('DISCONNECTED');
      return;
    }
    try {
      reconnectAttempts++;
      updateWsIndicator(reconnectAttempts > 1 ? 'RECONNECTING' : 'CONNECTING');
      ws = new WebSocket(determineWsUrl());

      ws.onopen = () => {
        const wasReconnecting = reconnectAttempts > 1;
        reconnectAttempts = 0;
        updateWsIndicator('CONNECTED');
        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25000);

        // Section 26: After reconnection, synchronize state from REST API
        if (wasReconnecting) {
          loadTelemetryHistory();
        }
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
    row.style.background = 'rgba(57, 255, 184, 0.15)';
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
