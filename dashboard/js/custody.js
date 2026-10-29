import { api, showToast } from './api.js';
import { getActiveCaseId } from './cases.js';

let custodyEntries = [];

export async function loadCustody() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    custodyEntries = await api.get(`/custody/case/${caseId}`);
    renderCustodyTimeline();
    updateCustodyMetrics();
  } catch (err) {
    console.error('Failed to load custody chain:', err);
  }
}

function updateCustodyMetrics() {
  const countEl = document.getElementById('metric-custody-count');
  if (countEl) countEl.textContent = custodyEntries.length;
}

export function renderCustodyTimeline() {
  const container = document.getElementById('custody-timeline-container');
  if (!container) return;

  if (custodyEntries.length === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 32px;">No custody events recorded for this case. Upload evidence to establish genesis blocks.</div>`;
    return;
  }

  container.innerHTML = custodyEntries.map((c, idx) => `
    <div class="custody-block">
      <div class="custody-node-dot"></div>
      <div class="custody-meta">
        <div>
          <span class="badge badge-cyan">${c.action}</span>
          <strong style="margin-left: 8px;">${c.evidence_id}</strong>
        </div>
        <small class="text-muted mono">${new Date(c.timestamp).toLocaleString()}</small>
      </div>
      <div class="custody-desc">${c.description}</div>
      <div class="custody-hashes">
        <div><span style="color: var(--text-muted);">PREV HASH:</span> <span class="mono" style="color: #94a3b8;">${c.previous_event_hash}</span></div>
        <div><span style="color: var(--color-cyan);">EVENT HASH:</span> <span class="mono" style="color: var(--color-emerald);">${c.event_hash}</span></div>
      </div>
    </div>
  `).join('');
}

export function initCustody() {
  window.addEventListener('case:changed', () => {
    loadCustody();
  });
}
