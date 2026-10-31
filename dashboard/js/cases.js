import { api, showToast, escapeHtml } from './api.js';

let casesList = [];
let activeCaseId = null;

export function getActiveCaseId() {
  return activeCaseId || localStorage.getItem('tracex_active_case_id');
}

export function getCasesList() {
  return casesList;
}

export function setActiveCaseId(caseId) {
  const previousId = activeCaseId;
  activeCaseId = caseId;
  if (caseId) {
    localStorage.setItem('tracex_active_case_id', caseId);
  } else {
    localStorage.removeItem('tracex_active_case_id');
  }
  if (previousId !== caseId) {
    window.dispatchEvent(new CustomEvent('case:changed', { detail: { caseId } }));
  }
}

export async function loadCases() {
  try {
    casesList = await api.get('/cases');
    populateCaseDropdown();
    renderCasesTable();

    // If active case is not in the real case list, select the first available real case
    const saved = localStorage.getItem('tracex_active_case_id');
    if (saved && casesList.some(c => c.case_id === saved)) {
      setActiveCaseId(saved);
    } else if (casesList.length > 0) {
      setActiveCaseId(casesList[0].case_id);
    } else {
      setActiveCaseId(null);
    }

    const selectEl = document.getElementById('global-case-select');
    if (selectEl && activeCaseId) {
      selectEl.value = activeCaseId;
    }
  } catch (err) {
    console.error('Failed to load cases:', err);
  }
}

function populateCaseDropdown() {
  const selectEl = document.getElementById('global-case-select');
  if (!selectEl) return;

  if (casesList.length === 0) {
    selectEl.innerHTML = '<option value="">No Active Cases</option>';
    return;
  }

  selectEl.innerHTML = casesList.map(c => {
    const rawTitle = c.title || 'Untitled Case';
    const displayTitle = rawTitle.length > 32 ? rawTitle.slice(0, 32) + '...' : rawTitle;
    const caseNum = c.case_number || c.case_id || 'TX-UNKNOWN';
    return `<option value="${escapeHtml(c.case_id)}">${escapeHtml(caseNum)} — ${escapeHtml(displayTitle)}</option>`;
  }).join('');

  selectEl.onchange = (e) => {
    setActiveCaseId(e.target.value);
  };
}

export function renderCasesTable() {
  const tbody = document.getElementById('cases-table-body');
  if (!tbody) return;

  if (casesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align: center; padding: 24px;">No cases found. Create a new case to begin.</td></tr>`;
    return;
  }

  tbody.innerHTML = casesList.map(c => {
    const caseId = escapeHtml(c.case_id || '');
    const caseNum = escapeHtml(c.case_number || c.case_id || 'TX-UNKNOWN');
    const title = escapeHtml(c.title || 'Untitled Case');
    const desc = escapeHtml(c.description || 'No judicial description provided');
    const status = escapeHtml(c.status || 'OPEN');
    const investigator = escapeHtml(c.investigator || c.lead_investigator || 'Unassigned');
    const devCount = Number(c.device_count || 0);
    const evCount = Number(c.evidence_count || 0);
    const isCurrentActive = (c.case_id === getActiveCaseId());

    return `
      <tr class="${isCurrentActive ? 'case-row-active' : ''}">
        <td><span class="mono text-cyan font-bold">${caseNum}</span></td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${title}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${desc}</div>
        </td>
        <td><span class="badge ${status === 'ACTIVE' || status === 'OPEN' ? 'badge-emerald' : 'badge-cyan'}">${status}</span></td>
        <td>${investigator}</td>
        <td><span class="mono">${devCount} units</span></td>
        <td><span class="mono">${evCount} items</span></td>
        <td>
          <button class="btn ${isCurrentActive ? 'btn-primary' : 'btn-secondary'} btn-sm" data-select-case="${caseId}">
            ${isCurrentActive ? 'Active' : 'Select'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach safe click listeners
  tbody.querySelectorAll('[data-select-case]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-select-case');
      if (targetId) {
        window.selectAndOpenCase(targetId);
      }
    });
  });
}

export function initCases() {
  // Modal toggle for create case
  const createBtn = document.getElementById('btn-open-create-case-modal');
  const modal = document.getElementById('modal-create-case');
  const closeBtn = document.getElementById('btn-close-create-case-modal');
  const form = document.getElementById('form-create-case');

  if (createBtn && modal) {
    createBtn.addEventListener('click', () => modal.classList.add('active'));
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('case-title').value.trim();
      const description = document.getElementById('case-description').value.trim();

      try {
        const newCase = await api.post('/cases', { title, description });
        showToast(`Case ${newCase.case_number || newCase.case_id} initialized successfully`, 'success');
        if (modal) modal.classList.remove('active');
        form.reset();
        await loadCases();
        if (newCase.case_id) {
          setActiveCaseId(newCase.case_id);
        }
      } catch (err) {
        showToast(err.message || 'Failed to create case', 'error');
      }
    });
  }

  window.selectAndOpenCase = (caseId) => {
    setActiveCaseId(caseId);
    const selectEl = document.getElementById('global-case-select');
    if (selectEl) selectEl.value = caseId;
    renderCasesTable();
    showToast(`Active case switched to ${caseId}`, 'info');
  };
}
