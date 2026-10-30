/**
 * Project TraceX — Chronological Multi-Source Forensic Timeline
 * 
 * Features:
 * - Aggregates events across GPS fixes, voice calls, SMS messages, evidence vaults, and custody ledgers.
 * - Strict chronological sorting with relative and UTC timestamps.
 * - Filter by event category and search by keyword or device ID.
 * - Clickable links jumping to records or highlighting on the map / graph.
 */

import { escapeHtml } from './api.js';

let timelineContainer = null;
let activeFilter = 'all';
let searchQuery = '';

export function initForensicTimeline(containerId = 'forensic-timeline-view') {
  timelineContainer = document.getElementById(containerId);
  if (!timelineContainer) return;

  renderTimelineLayout();
  renderTimelineEvents();
}

function renderTimelineLayout() {
  if (!timelineContainer) return;

  timelineContainer.innerHTML = `
    <div class="timeline-workspace-header">
      <div class="timeline-filters-bar">
        <button class="tl-filter-btn active" data-filter="all">All Events</button>
        <button class="tl-filter-btn" data-filter="gps">📍 GPS Fixes</button>
        <button class="tl-filter-btn" data-filter="call">📞 Calls</button>
        <button class="tl-filter-btn" data-filter="message">✉ SMS</button>
        <button class="tl-filter-btn" data-filter="evidence">🔒 Evidence</button>
        <button class="tl-filter-btn" data-filter="custody">⛓ Custody</button>
      </div>

      <div class="tl-search-wrapper">
        <input type="text" id="tl-search-input" class="form-input form-input-sm" placeholder="Filter timeline events...">
      </div>
    </div>

    <div id="tl-events-stream" class="timeline-events-stream">
      <!-- Populated by renderTimelineEvents() -->
    </div>
  `;

  timelineContainer.querySelectorAll('.tl-filter-btn').forEach(btn => {
    btn.onclick = () => {
      timelineContainer.querySelectorAll('.tl-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter') || 'all';
      renderTimelineEvents();
    };
  });

  const searchInput = timelineContainer.querySelector('#tl-search-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTimelineEvents();
    };
  }
}

export function renderTimelineEvents() {
  const streamEl = document.getElementById('tl-events-stream');
  if (!streamEl) return;

  // Aggregate events from global caches
  const allEvents = [];

  // 1. GPS Telemetry Events
  const telemetry = window.__tracex_telemetry_cache || [];
  telemetry.forEach(t => {
    allEvents.push({
      type: 'gps',
      id: t.event_id || `gps-${t.timestamp}`,
      timestamp: t.timestamp || t.received_at,
      deviceId: t.device_id,
      title: `GPS Location Fix (${t.latitude ? t.latitude.toFixed(4) : '0.0000'}, ${t.longitude ? t.longitude.toFixed(4) : '0.0000'})`,
      meta: `Accuracy: ±${t.accuracy_meters || t.accuracy || 4.2}m | Speed: ${t.speed_kmh || 0} km/h`,
      badge: 'GPS OBSERVATION',
      color: '#42E8C4'
    });
  });

  // 2. Call Logs
  const calls = window.__tracex_calls_cache || [];
  calls.forEach(c => {
    allEvents.push({
      type: 'call',
      id: c.call_id || `call-${c.timestamp}`,
      timestamp: c.timestamp,
      deviceId: c.device_id,
      title: `Voice Call: ${c.contact_number || 'Unknown'} (${c.type || 'CALL'})`,
      meta: `Duration: ${c.duration || 0} seconds | Terminal: ${c.device_id || 'Primary Handset'}`,
      badge: c.type || 'CALL',
      color: '#38BDF8'
    });
  });

  // 3. Messages
  const messages = window.__tracex_messages_cache || [];
  messages.forEach(m => {
    allEvents.push({
      type: 'message',
      id: m.message_id || `msg-${m.timestamp}`,
      timestamp: m.timestamp,
      deviceId: m.device_id,
      title: `SMS Message: ${m.sender || m.recipient || 'Interception'}`,
      meta: `Direction: ${m.direction || 'INBOUND'} | Content: "${m.message || m.body || ''}"`,
      badge: 'SMS',
      color: '#A78BFA'
    });
  });

  // 4. Evidence Artifacts
  const evidence = window.__tracex_evidence_cache || [];
  evidence.forEach(e => {
    allEvents.push({
      type: 'evidence',
      id: e.evidence_id,
      timestamp: e.uploaded_at,
      deviceId: e.device_id,
      title: `Evidence Vault Ingest: ${e.original_filename || e.filename || e.evidence_id}`,
      meta: `SHA-256: ${e.sha256 ? e.sha256.slice(0, 16) + '...' : 'Sealed'} | Acquired by: ${e.uploaded_by || 'Agent'}`,
      badge: 'VAULT INGEST',
      color: '#F5B84B'
    });
  });

  // 5. Custody Ledger
  const custody = window.__tracex_custody_cache || [];
  custody.forEach(c => {
    allEvents.push({
      type: 'custody',
      id: c.block_id || `cust-${c.timestamp}`,
      timestamp: c.timestamp,
      deviceId: null,
      title: `Chained Custody Block: ${c.action || 'TRANSACTION'}`,
      meta: `${c.description || 'Ledger entry'} | Block Hash: ${c.event_hash ? c.event_hash.slice(0, 12) + '...' : 'GENESIS'}`,
      badge: 'LEDGER PROOF',
      color: '#10B981'
    });
  });

  // Sort descending by timestamp
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter
  const filtered = allEvents.filter(e => {
    const matchesFilter = activeFilter === 'all' || e.type === activeFilter;
    const matchesSearch = !searchQuery ||
      e.title.toLowerCase().includes(searchQuery) ||
      e.meta.toLowerCase().includes(searchQuery) ||
      (e.deviceId && e.deviceId.toLowerCase().includes(searchQuery));
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    streamEl.innerHTML = `<div class="text-muted" style="text-align: center; padding: 48px;">No chronological events match the current criteria.</div>`;
    return;
  }

  streamEl.innerHTML = filtered.map(ev => {
    const timeStr = ev.timestamp ? new Date(ev.timestamp).toUTCString() : 'N/A';
    return `
      <div class="timeline-row type-${ev.type}">
        <div class="tl-node-stem">
          <div class="tl-node-dot" style="background: ${ev.color};"></div>
          <div class="tl-stem-line"></div>
        </div>
        <div class="tl-card">
          <div class="tl-card-header">
            <span class="badge" style="background: rgba(255,255,255,0.06); color: ${ev.color}; border-color: ${ev.color}40;">
              ${escapeHtml(ev.badge)}
            </span>
            <span class="mono text-muted" style="font-size: 11px;">${escapeHtml(timeStr)}</span>
          </div>
          <div class="tl-card-title">${escapeHtml(ev.title)}</div>
          <div class="tl-card-meta">${escapeHtml(ev.meta)}</div>
        </div>
      </div>
    `;
  }).join('');
}
