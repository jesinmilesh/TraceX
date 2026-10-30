import { api, showToast, escapeHtml } from './api.js';
import { getActiveCaseId } from './cases.js';

let custodyEntries = [];
export function getCustodyEntries() { return custodyEntries; }

export async function loadCustody() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    custodyEntries = await api.get(`/custody/case/${encodeURIComponent(caseId)}`);
    window.__tracex_custody_cache = custodyEntries;
    renderCustodyTimeline();
    updateCustodyMetrics();
    window.dispatchEvent(new CustomEvent('custody:updated', { detail: { custodyEntries } }));
  } catch (err) {
    console.error('Failed to load custody chain:', err);
  }
}

function updateCustodyMetrics() {
  const countEl = document.getElementById('metric-custody-count');
  if (countEl) countEl.textContent = custodyEntries.length;

  const mobileCountCustody = document.getElementById('mobile-count-custody');
  if (mobileCountCustody) mobileCountCustody.textContent = custodyEntries.length;
}

export function renderCustodyTimeline() {
  const container = document.getElementById('custody-timeline-container');
  if (!container) return;

  if (custodyEntries.length === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 32px;">No custody events recorded for this case. Upload evidence to establish genesis blocks.</div>`;
    return;
  }

  container.innerHTML = custodyEntries.map((c, idx) => {
    const action = escapeHtml(c.action || 'TRANSACTION');
    const evId = escapeHtml(c.evidence_id || 'N/A');
    const desc = escapeHtml(c.description || c.notes || 'Forensic custody transaction logged.');
    const prevHash = escapeHtml(c.previous_event_hash || c.previous_hash || 'GENESIS');
    const currHash = escapeHtml(c.event_hash || c.block_hash || 'N/A');
    const time = c.timestamp ? new Date(c.timestamp).toLocaleString() : 'N/A';
    const actor = escapeHtml(c.actor || c.role || 'Investigator');

    return `
      <div class="custody-block">
        <div class="custody-node-dot"></div>
        <div class="custody-meta">
          <div>
            <span class="badge badge-cyan">${action}</span>
            <strong style="margin-left: 8px; color: var(--text-primary); font-size: 12.5px;">${evId}</strong>
            <span style="font-size: 11px; color: var(--text-muted); margin-left: 6px;">(${actor})</span>
          </div>
          <small class="text-muted mono" style="font-size: 10.5px;">${escapeHtml(time)}</small>
        </div>
        <div class="custody-desc">${desc}</div>
        <div class="custody-hashes">
          <div><span style="color: var(--text-muted);">PREV HASH:</span> <span class="mono" style="color: #94a3b8;">${prevHash}</span></div>
          <div><span style="color: var(--color-cyan);">BLOCK HASH:</span> <span class="mono" style="color: var(--color-emerald);">${currHash}</span></div>
        </div>
      </div>
    `;
  }).join('');
}

export function initCustody() {
  window.addEventListener('case:changed', () => {
    loadCustody();
  });
}
