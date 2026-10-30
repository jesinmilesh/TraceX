import { api, showToast, escapeHtml } from './api.js';
import { getActiveCaseId } from './cases.js';
import { selectDeviceOnMap } from './telemetry.js';

let devicesList = [];
let activeDetailDevice = null;

export async function loadDevices() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    devicesList = await api.get(`/devices?case_id=${caseId}`);
    renderDevicesTable();
    renderMapDeviceSidebar();
    updateDeviceCount();
  } catch (err) {
    console.warn('Devices load deferred:', err);
  }
}

function updateDeviceCount() {
  const countEl = document.getElementById('metric-active-devices');
  if (countEl) {
    const active = devicesList.filter(d => ['ONLINE', 'COLLECTION_ACTIVE', 'ACTIVE'].includes(d.status)).length;
    countEl.textContent = active;
  }
}

function getDeviceModel(d) {
  return d.device_model || d.model || d.device_name || 'Android Unit';
}

function getAndroidVersion(d) {
  return d.android_version || '';
}

function getAppVersion(d) {
  return d.app_version || '1.0.0';
}

function getNetworkState(d) {
  if (d.network_state) return d.network_state;
  if (d.wifi_ssid) return d.wifi_ssid;
  if (d.cellular_network) return d.cellular_network;
  return 'N/A';
}

export function renderDevicesTable() {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  if (devicesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align: center; padding: 24px;">No enrolled Android devices for this case. Launch the TraceX mobile collector on an authorized unit to begin.</td></tr>`;
    return;
  }

  tbody.innerHTML = devicesList.map(d => {
    const isOnline = ['ONLINE', 'COLLECTION_ACTIVE', 'ACTIVE'].includes(d.status);
    const isStale = d.status === 'LOCATION_STALE';
    const statusColor = isOnline ? 'badge-emerald' : isStale ? 'badge-amber' : 'badge-rose';
    const devId = escapeHtml(d.device_id || 'UNKNOWN');
    const rawDevId = d.device_id || '';
    const model = escapeHtml(getDeviceModel(d));
    const androidVer = escapeHtml(getAndroidVersion(d));
    const appVer = escapeHtml(getAppVersion(d));
    const network = escapeHtml(getNetworkState(d));
    const status = escapeHtml(d.status || 'OFFLINE');
    const battery = Number(d.battery_level ?? 100);

    return `
      <tr>
        <td>
          <button class="btn-link mono font-bold text-cyan" data-open-device="${escapeHtml(rawDevId)}" style="background:none; border:none; padding:0; cursor:pointer; font-size:inherit;">
            ${devId}
          </button>
        </td>
        <td><strong>${model}</strong></td>
        <td>${androidVer ? `Android ${androidVer}` : ''} (v${appVer})</td>
        <td>
          <span class="badge ${statusColor}">
            <span class="pulse-dot" style="${!isOnline ? 'background: var(--color-rose);' : ''}"></span>
            ${status}
          </span>
        </td>
        <td><span class="mono">${battery}% (${network})</span></td>
        <td><small class="text-muted">${d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : 'Never'}</small></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary btn-sm" data-open-device="${escapeHtml(rawDevId)}">
              Details
            </button>
            <button class="btn btn-secondary btn-sm" data-toggle-device="${escapeHtml(rawDevId)}" data-current-status="${escapeHtml(d.status || '')}">
              ${isOnline ? 'Suspend' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach event listeners
  tbody.querySelectorAll('[data-open-device]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const devId = btn.getAttribute('data-open-device');
      if (devId) openDeviceDetails(devId);
    });
  });

  tbody.querySelectorAll('[data-toggle-device]').forEach(btn => {
    btn.addEventListener('click', () => {
      const devId = btn.getAttribute('data-toggle-device');
      const curStatus = btn.getAttribute('data-current-status');
      if (devId) window.toggleDeviceStatus(devId, curStatus);
    });
  });
}

export function renderMapDeviceSidebar() {
  const listEl = document.getElementById('map-devices-list');
  if (!listEl) return;

  if (devicesList.length === 0) {
    listEl.innerHTML = `<div class="text-muted" style="padding: 16px; font-size: 12px; text-align: center;">No enrolled collectors</div>`;
    return;
  }

  listEl.innerHTML = devicesList.map((d, idx) => {
    const isOnline = ['ONLINE', 'COLLECTION_ACTIVE', 'ACTIVE'].includes(d.status);
    const isStale = d.status === 'LOCATION_STALE';
    const dotColor = isOnline ? 'var(--color-emerald)' : isStale ? 'var(--color-amber)' : 'var(--color-rose)';
    const model = escapeHtml(getDeviceModel(d));
    const devId = escapeHtml(d.device_id || 'UNKNOWN');
    const rawDevId = d.device_id || '';
    const battery = Number(d.battery_level ?? 100);

    return `
      <div class="map-device-item ${idx === 0 ? 'active' : ''}" data-device-id="${escapeHtml(rawDevId)}">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="pulse-dot" style="background: ${dotColor};"></span>
            <span class="mono font-bold" style="font-size: 12px;">${devId}</span>
          </div>
          <span style="font-size: 10px; color: var(--text-muted);">${battery}%</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 3px; font-size: 10.5px; color: var(--text-muted);">
          <span>${model}</span>
          <span>${d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : 'Never'}</span>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.map-device-item').forEach(item => {
    item.addEventListener('click', () => {
      const devId = item.getAttribute('data-device-id');
      if (devId) selectDeviceOnMap(devId);
    });
  });
}

export async function openDeviceDetails(deviceId) {
  const dev = devicesList.find(d => d.device_id === deviceId);
  if (!dev) return;
  activeDetailDevice = dev;

  const modal = document.getElementById('modal-device-details');
  if (!modal) return;

  const model = getDeviceModel(dev);
  const androidVer = getAndroidVersion(dev);
  const appVer = getAppVersion(dev);
  const network = getNetworkState(dev);

  // Safe textContent assignments
  document.getElementById('dev-modal-title').textContent = `Device: ${dev.device_id}`;
  document.getElementById('dev-modal-model').textContent = `${model}${androidVer ? ` (Android ${androidVer})` : ''}`;

  document.getElementById('dev-overview-id').textContent = dev.device_id;
  document.getElementById('dev-overview-case').textContent = dev.case_id || 'N/A';
  document.getElementById('dev-overview-model').textContent = model;
  document.getElementById('dev-overview-os').textContent = `${androidVer ? `Android ${androidVer}` : 'N/A'} (App v${appVer})`;
  document.getElementById('dev-overview-status').textContent = dev.status || 'UNKNOWN';
  document.getElementById('dev-overview-battery').textContent = `${dev.battery_level ?? 100}%`;
  document.getElementById('dev-overview-network').textContent = network;
  document.getElementById('dev-overview-registered').textContent = dev.registered_at ? new Date(dev.registered_at).toLocaleString() : 'N/A';
  document.getElementById('dev-overview-lastseen').textContent = dev.last_seen ? new Date(dev.last_seen).toLocaleString() : 'N/A';

  // Load Device Telemetry, Call Logs, Messages
  loadDeviceSubData(dev.device_id, dev.case_id);

  modal.classList.add('active');
}

async function loadDeviceSubData(deviceId, caseId) {
  try {
    const locRes = await api.get(`/devices/${encodeURIComponent(deviceId)}/location-history?case_id=${encodeURIComponent(caseId || '')}&limit=50`);
    const historyTbody = document.getElementById('dev-history-table-body');
    if (historyTbody && locRes && locRes.history) {
      if (locRes.history.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 16px;">No historical locations recorded yet.</td></tr>`;
      } else {
        historyTbody.innerHTML = locRes.history.map(h => {
          const lat = Number(h.latitude || 0).toFixed(6);
          const lng = Number(h.longitude || 0).toFixed(6);
          const acc = Number(h.accuracy || 0).toFixed(1);
          const speed = ((Number(h.speed || 0)) * 3.6).toFixed(1);
          const hash = escapeHtml((h.evidence_hash || '').slice(0, 16));
          const time = h.timestamp || h.received_at ? new Date(h.timestamp || h.received_at).toLocaleTimeString() : 'N/A';

          return `
            <tr>
              <td><small class="mono">${escapeHtml(time)}</small></td>
              <td><span class="mono font-bold">${lat}, ${lng}</span></td>
              <td>±${acc}m</td>
              <td>${speed} km/h</td>
              <td><small class="mono text-muted">${hash}...</small></td>
            </tr>
          `;
        }).join('');
      }
    }

    const calls = await api.get(`/telemetry/${encodeURIComponent(caseId || '')}/calls?device_id=${encodeURIComponent(deviceId)}&limit=50`);
    const callsTbody = document.getElementById('dev-calls-table-body');
    if (callsTbody) {
      if (!calls || calls.length === 0) {
        callsTbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 16px;">No call logs for this device.</td></tr>`;
      } else {
        callsTbody.innerHTML = calls.map(c => {
          const phone = escapeHtml(c.phone_number || 'Unknown');
          const type = escapeHtml(c.call_type || 'CALL');
          const dur = Number(c.duration_seconds || 0);
          const time = c.date || c.recorded_at ? new Date(c.date || c.recorded_at).toLocaleString() : 'N/A';

          return `
            <tr>
              <td><span class="mono text-cyan">${phone}</span></td>
              <td><span class="badge ${type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan'}">${type}</span></td>
              <td><span class="mono">${dur}s</span></td>
              <td><small class="text-muted">${escapeHtml(time)}</small></td>
            </tr>
          `;
        }).join('');
      }
    }

    const msgs = await api.get(`/telemetry/${encodeURIComponent(caseId || '')}/messages?device_id=${encodeURIComponent(deviceId)}&limit=50`);
    const msgsTbody = document.getElementById('dev-msgs-table-body');
    if (msgsTbody) {
      if (!msgs || msgs.length === 0) {
        msgsTbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 16px;">No messages for this device.</td></tr>`;
      } else {
        msgsTbody.innerHTML = msgs.map(m => {
          const sender = escapeHtml(m.sender || 'Unknown');
          const type = escapeHtml(m.msg_type || 'SMS');
          const body = escapeHtml(m.body || '');
          const time = m.date || m.recorded_at ? new Date(m.date || m.recorded_at).toLocaleString() : 'N/A';

          return `
            <tr>
              <td><span class="mono text-cyan">${sender}</span></td>
              <td><span class="badge ${type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan'}">${type}</span></td>
              <td><span>${body || '<em class="text-muted">empty</em>'}</span></td>
              <td><small class="text-muted">${escapeHtml(time)}</small></td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.warn('Sub data load deferred:', err);
  }
}

export function initDevices() {
  window.openDeviceDetails = openDeviceDetails;

  window.focusDeviceOnMap = (deviceId) => {
    selectDeviceOnMap(deviceId);
  };

  window.toggleDeviceStatus = async (deviceId, currentStatus) => {
    const isOnline = ['ONLINE', 'COLLECTION_ACTIVE', 'ACTIVE'].includes(currentStatus);
    const newStatus = isOnline ? 'SUSPENDED' : 'ONLINE';
    try {
      await api.patch(`/devices/${encodeURIComponent(deviceId)}/status`, { status: newStatus });
      showToast(`Device ${deviceId} status set to ${newStatus}`, 'info');
      await loadDevices();
    } catch (err) {
      showToast(err.message || 'Failed to update device status', 'error');
    }
  };

  // Switch tabs inside Device Details modal
  document.querySelectorAll('.dev-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.dev-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dev-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`dev-tab-${targetTab}`);
      if (pane) pane.classList.add('active');
    });
  });

  window.addEventListener('case:changed', () => {
    loadDevices();
  });

  window.addEventListener('devices:refresh', () => {
    loadDevices();
  });
}
