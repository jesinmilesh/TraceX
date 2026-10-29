import { api, showToast } from './api.js';
import { getActiveCaseId } from './cases.js';

let evidenceList = [];

export async function loadEvidence() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    evidenceList = await api.get(`/evidence/case/${caseId}`);
    renderEvidenceTable();
    updateEvidenceMetrics();
  } catch (err) {
    console.error('Failed to load evidence:', err);
  }
}

function updateEvidenceMetrics() {
  const countEl = document.getElementById('metric-evidence-count');
  if (countEl) countEl.textContent = evidenceList.length;
}

export function renderEvidenceTable() {
  const tbody = document.getElementById('evidence-table-body');
  if (!tbody) return;

  if (evidenceList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align: center; padding: 24px;">No evidence files vaulted for this case. Use the vault uploader below.</td></tr>`;
    return;
  }

  tbody.innerHTML = evidenceList.map(e => `
    <tr>
      <td><span class="mono text-cyan font-bold">${e.evidence_id}</span></td>
      <td><strong>${e.original_filename}</strong><br><small class="text-muted">${(e.file_size / 1024).toFixed(1)} KB | ${e.mime_type}</small></td>
      <td>
        <span class="hash-pill" title="${e.sha256}">
          ${e.sha256.slice(0, 18)}...
        </span>
      </td>
      <td><span class="badge badge-cyan">${e.status}</span></td>
      <td>${e.uploaded_by}</td>
      <td><small class="text-muted">${new Date(e.uploaded_at).toLocaleString()}</small></td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-emerald btn-sm" onclick="window.verifyEvidenceHash('${e.evidence_id}')">
            Verify SHA-256
          </button>
          <a href="/api/v1/evidence/${e.evidence_id}/download" class="btn btn-secondary btn-sm" download>
            Download
          </a>
        </div>
      </td>
    </tr>
  `).join('');
}

export function initEvidence() {
  const dropzone = document.getElementById('evidence-dropzone');
  const fileInput = document.getElementById('evidence-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  async function handleFileUpload(file) {
    const caseId = getActiveCaseId();
    if (!caseId) {
      showToast('Please select or create an active case first', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('case_id', caseId);
    formData.append('file', file);

    try {
      showToast(`Ingesting ${file.name} into Evidence Vault...`, 'info');
      const uploaded = await api.post('/evidence/upload', formData);
      showToast(`Evidence ${uploaded.evidence_id} vaulted! SHA-256: ${uploaded.sha256.slice(0, 12)}...`, 'success');
      await loadEvidence();
    } catch (err) {
      showToast(err.message || 'Evidence upload failed', 'error');
    }
  }

  // Verification modal handler
  window.verifyEvidenceHash = async (evidenceId) => {
    try {
      showToast(`Computing live cryptographic SHA-256 for ${evidenceId}...`, 'info');
      const result = await api.get(`/evidence/${evidenceId}/verify`);

      const modal = document.getElementById('modal-verify-result');
      const body = document.getElementById('verify-modal-content');
      if (modal && body) {
        body.innerHTML = `
          <div style="margin-bottom: 16px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: bold;">Status</div>
            <div style="font-size: 18px; font-weight: bold; color: ${result.status === 'INTEGRITY VERIFIED' ? 'var(--color-emerald)' : 'var(--color-rose)'}; display: flex; align-items: center; gap: 8px;">
              <span>${result.status === 'INTEGRITY VERIFIED' ? '✓' : '✗'}</span> ${result.status}
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <div class="form-label">Evidence Artifact</div>
            <div class="mono" style="color: var(--text-primary);">${result.filename} (${result.evidence_id})</div>
          </div>
          <div style="margin-bottom: 12px;">
            <div class="form-label">Original Vault Record Hash (SHA-256)</div>
            <div class="hash-pill" style="max-width: 100%; width: 100%; word-break: break-all; white-space: normal;">${result.original_sha256}</div>
          </div>
          <div style="margin-bottom: 12px;">
            <div class="form-label">Live Physical Re-Computed Checksum</div>
            <div class="hash-pill" style="max-width: 100%; width: 100%; word-break: break-all; white-space: normal; color: var(--color-emerald);">${result.current_sha256}</div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            Verified by: ${result.verified_by} | Time: ${new Date(result.verified_at).toLocaleString()}
          </div>
        `;
        modal.classList.add('active');
      }
    } catch (err) {
      showToast(err.message || 'Verification check failed', 'error');
    }
  };

  const closeVerifyBtn = document.getElementById('btn-close-verify-modal');
  const verifyModal = document.getElementById('modal-verify-result');
  if (closeVerifyBtn && verifyModal) {
    closeVerifyBtn.addEventListener('click', () => verifyModal.classList.remove('active'));
  }

  window.addEventListener('case:changed', () => {
    loadEvidence();
  });
}
