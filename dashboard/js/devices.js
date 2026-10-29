import { api, showToast } from './api.js';
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

    return `
      <tr>
        <td>
          <a href="#" class="mono font-bold text-cyan" onclick="window.openDeviceDetails('${d.device_id}'); return false;">
            ${d.device_id}
          </a>
        </td>
        <td><strong>${d.device_model || 'Android Unit'}</strong></td>
        <td>Android ${d.android_version || '16'} (v${d.app_version || '1.0.0'})</td>
        <td>
          <span class="badge ${statusColor}">
            <span class="pulse-dot" style="${!isOnline ? 'background: var(--color-rose); box-shadow: 0 0 8px var(--color-rose);' : ''}"></span>
            ${d.status}
          </span>
        </td>
        <td><span class="mono">${d.battery_level || 100}% (${d.network_state || 'WIFI'})</span></td>
        <td><small class="text-muted">${d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : 'Never'}</small></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary btn-sm" onclick="window.openDeviceDetails('${d.device_id}')">
              Details
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.toggleDeviceStatus('${d.device_id}', '${d.status}')">
              ${isOnline ? 'Suspend' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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

    return `
      <div class="map-device-item ${idx === 0 ? 'active' : ''}" data-device-id="${d.device_id}" onclick="window.focusDeviceOnMap('${d.device_id}')">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="pulse-dot" style="background: ${dotColor}; box-shadow: 0 0 8px ${dotColor};"></span>
            <span class="mono font-bold" style="font-size: 13px;">${d.device_id}</span>
          </div>
          <span style="font-size: 10px; color: var(--text-muted);">${d.battery_level || 100}%</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: var(--text-muted);">
          <span>${d.device_model || 'Android'}</span>
          <span>${d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : 'Never'}</span>
        </div>
      </div>
    `;
  }).join('');
}

export async function openDeviceDetails(deviceId) {
  const dev = devicesList.find(d => d.device_id === deviceId);
  if (!dev) return;
  activeDetailDevice = dev;

  const modal = document.getElementById('modal-device-details');
  if (!modal) return;

  // Header info
  document.getElementById('dev-modal-title').textContent = `Device: ${dev.device_id}`;
  document.getElementById('dev-modal-model').textContent = `${dev.device_model} (Android ${dev.android_version})`;
  document.getElementById('dev-modal-case').textContent = dev.case_id;

  // Overview Tab Data
  document.getElementById('dev-overview-id').textContent = dev.device_id;
  document.getElementById('dev-overview-case').textContent = dev.case_id;
  document.getElementById('dev-overview-model').textContent = dev.device_model;
  document.getElementById('dev-overview-os').textContent = `Android ${dev.android_version} (App v${dev.app_version})`;
  document.getElementById('dev-overview-status').textContent = dev.status;
  document.getElementById('dev-overview-battery').textContent = `${dev.battery_level || 100}%`;
  document.getElementById('dev-overview-network').textContent = dev.network_state || 'WIFI';
  document.getElementById('dev-overview-registered').textContent = dev.registered_at ? new Date(dev.registered_at).toLocaleString() : 'N/A';
  document.getElementById('dev-overview-lastseen').textContent = dev.last_seen ? new Date(dev.last_seen).toLocaleString() : 'N/A';

  // Load Device Telemetry & Call Logs & Messages
  loadDeviceSubData(dev.device_id, dev.case_id);

  modal.classList.add('active');
}

async function loadDeviceSubData(deviceId, caseId) {
  try {
    const locRes = await api.get(`/devices/${deviceId}/location-history?case_id=${caseId}&limit=50`);
    const historyTbody = document.getElementById('dev-history-table-body');
    if (historyTbody && locRes && locRes.history) {
      if (locRes.history.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 16px;">No historical locations recorded yet.</td></tr>`;
      } else {
        historyTbody.innerHTML = locRes.history.map(h => `
          <tr>
            <td><small class="mono">${new Date(h.timestamp || h.received_at).toLocaleTimeString()}</small></td>
            <td><span class="mono font-bold">${Number(h.latitude).toFixed(6)}, ${Number(h.longitude).toFixed(6)}</span></td>
            <td>±${(h.accuracy || 0).toFixed(1)}m</td>
            <td>${((h.speed || 0) * 3.6).toFixed(1)} km/h</td>
            <td><small class="mono text-muted">${(h.evidence_hash || '').slice(0, 12)}...</small></td>
          </tr>
        `).join('');
      }
    }

    const calls = await api.get(`/telemetry/${caseId}/calls?device_id=${deviceId}&limit=50`);
    const callsTbody = document.getElementById('dev-calls-table-body');
    if (callsTbody) {
      if (!calls || calls.length === 0) {
        callsTbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 16px;">No call logs for this device.</td></tr>`;
      } else {
        callsTbody.innerHTML = calls.map(c => `
          <tr>
            <td><span class="mono text-cyan">${c.phone_number}</span></td>
            <td><span class="badge ${c.call_type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan'}">${c.call_type}</span></td>
            <td><span class="mono">${c.duration_seconds}s</span></td>
            <td><small class="text-muted">${new Date(c.date || c.recorded_at).toLocaleString()}</small></td>
          </tr>
        `).join('');
      }
    }

    const msgs = await api.get(`/telemetry/${caseId}/messages?device_id=${deviceId}&limit=50`);
    const msgsTbody = document.getElementById('dev-msgs-table-body');
    if (msgsTbody) {
      if (!msgs || msgs.length === 0) {
        msgsTbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 16px;">No messages for this device.</td></tr>`;
      } else {
        msgsTbody.innerHTML = msgs.map(m => `
          <tr>
            <td><span class="mono text-cyan">${m.sender}</span></td>
            <td><span class="badge ${m.msg_type === 'INCOMING' ? 'badge-emerald' : 'badge-cyan'}">${m.msg_type}</span></td>
            <td><span>${m.body || '<em class="text-muted">empty</em>'}</span></td>
            <td><small class="text-muted">${new Date(m.date || m.recorded_at).toLocaleString()}</small></td>
          </tr>
        `).join('');
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
      await api.patch(`/devices/${deviceId}/status`, { status: newStatus });
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
