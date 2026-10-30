import { api, escapeHtml } from './api.js';
import { getActiveCaseId } from './cases.js';

let auditLogs = [];

export async function loadAuditLogs() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    auditLogs = await api.get(`/audit/case/${encodeURIComponent(caseId)}?limit=100`);
    renderAuditTable();
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

export function renderAuditTable() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  if (!auditLogs || auditLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align: center; padding: 24px;">No audit trail events found for this case.</td></tr>`;
    return;
  }

  tbody.innerHTML = auditLogs.map(l => {
    const auditId = escapeHtml(l.audit_id || l.log_id || 'AUD-N/A');
    const action = escapeHtml(l.action || 'ACCESS');
    const actor = escapeHtml(l.actor || 'System');
    const role = escapeHtml(l.role || l.status || 'INVESTIGATOR');
    const resource = escapeHtml(l.resource || l.action || 'DATABASE');
    const detailStr = l.ip_address || (l.details ? JSON.stringify(l.details) : '127.0.0.1');
    const details = escapeHtml(detailStr);
    const time = l.timestamp ? new Date(l.timestamp).toLocaleString() : 'N/A';

    return `
      <tr>
        <td><span class="mono text-cyan">${auditId}</span></td>
        <td><strong>${action}</strong></td>
        <td>${actor} <small class="text-muted">(${role})</small></td>
        <td><span class="mono">${resource}</span></td>
        <td><span class="mono text-muted" style="font-size: 11px;">${details}</span></td>
        <td><small class="text-muted">${escapeHtml(time)}</small></td>
      </tr>
    `;
  }).join('');
}

export function initAudit() {
  window.addEventListener('case:changed', () => {
    loadAuditLogs();
  });
}
