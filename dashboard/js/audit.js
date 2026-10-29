import { api } from './api.js';
import { getActiveCaseId } from './cases.js';

let auditLogs = [];

export async function loadAuditLogs() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    auditLogs = await api.get(`/audit/case/${caseId}?limit=100`);
    renderAuditTable();
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

export function renderAuditTable() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  if (auditLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align: center; padding: 24px;">No audit trail events found for this case.</td></tr>`;
    return;
  }

  tbody.innerHTML = auditLogs.map(l => `
    <tr>
      <td><span class="mono text-cyan">${l.audit_id}</span></td>
      <td><strong>${l.action}</strong></td>
      <td>${l.actor} <small class="text-muted">(${l.role})</small></td>
      <td><span class="mono">${l.resource}</span></td>
      <td><span class="mono" style="font-size: 11px; color: var(--text-muted);">${JSON.stringify(l.details || {})}</span></td>
      <td><small class="text-muted">${new Date(l.timestamp).toLocaleString()}</small></td>
    </tr>
  `).join('');
}

export function initAudit() {
  window.addEventListener('case:changed', () => {
    loadAuditLogs();
  });
}
