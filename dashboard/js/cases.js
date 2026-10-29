import { api, showToast } from './api.js';

let casesList = [];
let activeCaseId = null;

export function getActiveCaseId() {
  return activeCaseId || localStorage.getItem('tracex_active_case_id');
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

  selectEl.innerHTML = casesList.map(c => `
    <option value="${c.case_id}">
      ${c.case_number} — ${c.title.length > 28 ? c.title.slice(0, 28) + '...' : c.title}
    </option>
  `).join('');

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

  tbody.innerHTML = casesList.map(c => `
    <tr>
      <td><span class="mono text-cyan font-bold">${c.case_number}</span></td>
      <td><strong>${c.title}</strong><br><small class="text-muted">${c.description || 'No description provided'}</small></td>
      <td><span class="badge ${c.status === 'ACTIVE' ? 'badge-emerald' : 'badge-cyan'}">${c.status}</span></td>
      <td>${c.investigator}</td>
      <td><span class="mono">${c.device_count} devices</span></td>
      <td><span class="mono">${c.evidence_count} files</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="window.selectAndOpenCase('${c.case_id}')">Select</button>
      </td>
    </tr>
  `).join('');
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
        showToast(`Case ${newCase.case_number} created successfully`, 'success');
        if (modal) modal.classList.remove('active');
        form.reset();
        await loadCases();
        setActiveCaseId(newCase.case_id);
      } catch (err) {
        showToast(err.message || 'Failed to create case', 'error');
      }
    });
  }

  window.selectAndOpenCase = (caseId) => {
    setActiveCaseId(caseId);
    const selectEl = document.getElementById('global-case-select');
    if (selectEl) selectEl.value = caseId;
    showToast(`Switched active context to Case ${caseId}`, 'info');
  };
}
