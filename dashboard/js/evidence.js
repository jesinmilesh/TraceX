import { api, showToast, escapeHtml } from './api.js';
import { getActiveCaseId } from './cases.js';

let evidenceList = [];
export function getEvidenceList() { return evidenceList; }

export async function loadEvidence() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    evidenceList = await api.get(`/evidence/case/${encodeURIComponent(caseId)}`);
    window.__tracex_evidence_cache = evidenceList;
    renderEvidenceTable();
    updateEvidenceMetrics();
    window.dispatchEvent(new CustomEvent('evidence:updated', { detail: { evidenceList } }));
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

  tbody.innerHTML = evidenceList.map(e => {
    const evId = escapeHtml(e.evidence_id || '');
    const filename = escapeHtml(e.original_filename || 'unknown_artifact.raw');
    const sizeKb = (Number(e.file_size || 0) / 1024).toFixed(1);
    const mime = escapeHtml(e.mime_type || 'application/octet-stream');
    const sha = escapeHtml(e.sha256 || '');
    const status = escapeHtml(e.status || e.vault_status || 'VAULTED');
    const acquiredBy = escapeHtml(e.uploaded_by || e.acquired_by || 'Forensic Agent');
    const uploadTime = e.uploaded_at ? new Date(e.uploaded_at).toLocaleString() : 'N/A';

    return `
      <tr>
        <td><span class="mono text-cyan font-bold">${evId}</span></td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${filename}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 1px;">${sizeKb} KB | ${mime}</div>
        </td>
        <td>
          <span class="hash-pill" title="${sha}">
            ${sha.slice(0, 16)}...
          </span>
        </td>
        <td><span class="badge badge-cyan">${status}</span></td>
        <td>${acquiredBy}</td>
        <td><small class="text-muted">${escapeHtml(uploadTime)}</small></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-emerald btn-sm" data-verify-id="${evId}">
              Verify SHA-256
            </button>
            <a href="/api/v1/evidence/${evId}/download" class="btn btn-secondary btn-sm" download>
              Download
            </a>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-verify-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-verify-id');
      if (id) window.verifyEvidenceHash(id);
    });
  });
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
      const shortHash = uploaded.sha256 ? uploaded.sha256.slice(0, 12) : '';
      showToast(`Evidence ${uploaded.evidence_id || ''} vaulted! SHA-256: ${shortHash}...`, 'success');
      await loadEvidence();
    } catch (err) {
      showToast(err.message || 'Evidence upload failed', 'error');
    }
  }

  // Verification modal handler
  window.verifyEvidenceHash = async (evidenceId) => {
    try {
      showToast(`Computing live cryptographic SHA-256 for ${evidenceId}...`, 'info');
      const result = await api.get(`/evidence/${encodeURIComponent(evidenceId)}/verify`);

      const modal = document.getElementById('modal-verify-result');
      const body = document.getElementById('verify-modal-content');
      if (modal && body) {
        const isVerified = result.status === 'INTEGRITY VERIFIED';
        const statusText = escapeHtml(result.status || 'UNKNOWN');
        const filename = escapeHtml(result.filename || 'N/A');
        const evId = escapeHtml(result.evidence_id || evidenceId);
        const origHash = escapeHtml(result.original_sha256 || 'N/A');
        const currHash = escapeHtml(result.current_sha256 || 'N/A');
        const verifier = escapeHtml(result.verified_by || 'System Automated Validator');
        const verTime = result.verified_at ? new Date(result.verified_at).toLocaleString() : 'N/A';

        body.innerHTML = `
          <div style="margin-bottom: 14px;">
            <div style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.04em;">Verification Status</div>
            <div style="font-size: 16px; font-weight: 700; color: ${isVerified ? 'var(--color-emerald)' : 'var(--color-rose)'}; display: flex; align-items: center; gap: 6px; margin-top: 3px;">
              <span>${isVerified ? '✓' : '✗'}</span> ${statusText}
            </div>
          </div>
          <div style="margin-bottom: 10px;">
            <div class="form-label">Evidence Artifact</div>
            <div class="mono" style="color: var(--text-primary); font-size: 12px;">${filename} (${evId})</div>
          </div>
          <div style="margin-bottom: 10px;">
            <div class="form-label">Original Vault Record Hash (SHA-256)</div>
            <div class="hash-pill" style="max-width: 100%; width: 100%; word-break: break-all; white-space: normal;">${origHash}</div>
          </div>
          <div style="margin-bottom: 10px;">
            <div class="form-label">Live Physical Re-Computed Checksum</div>
            <div class="hash-pill" style="max-width: 100%; width: 100%; word-break: break-all; white-space: normal; color: ${isVerified ? 'var(--color-emerald)' : 'var(--color-rose)'};">${currHash}</div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
            Verified by: ${verifier} | Time: ${escapeHtml(verTime)}
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
