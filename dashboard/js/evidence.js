import { api, showToast, escapeHtml, API_BASE } from './api.js';
import { getActiveCaseId } from './cases.js';
import { isValidCoordinate, renderGoogleMapsButton, renderLocationObservationCard } from './maps.js';

let evidenceList = [];
let activeMobileFilter = 'all';
let mobileSearchQuery = '';

export function getEvidenceList() { return evidenceList; }

export async function loadEvidence() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  try {
    evidenceList = await api.get(`/evidence/case/${encodeURIComponent(caseId)}`);
    window.__tracex_evidence_cache = evidenceList;
    renderEvidenceTable();
    renderMobileEvidenceCards();
    updateEvidenceMetrics();
    window.dispatchEvent(new CustomEvent('evidence:updated', { detail: { evidenceList } }));
  } catch (err) {
    console.error('Failed to load evidence:', err);
  }
}

function updateEvidenceMetrics() {
  const countEl = document.getElementById('metric-evidence-count');
  if (countEl) countEl.textContent = evidenceList.length;

  const mobileCountEl = document.getElementById('mobile-count-evidence');
  if (mobileCountEl) mobileCountEl.textContent = evidenceList.length;

  const mobileBadge = document.getElementById('mobile-ev-vault-badge');
  if (mobileBadge) mobileBadge.textContent = `${evidenceList.length} Artifacts`;
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
            <a href="${API_BASE}/evidence/${evId}/download" class="btn btn-secondary btn-sm" download>
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

export function renderMobileEvidenceCards() {
  const container = document.getElementById('mobile-evidence-cards-container');
  if (!container) return;

  const filtered = evidenceList.filter(ev => {
    const filename = (ev.original_filename || ev.filename || '').toLowerCase();
    const evId = (ev.evidence_id || '').toLowerCase();
    const mime = (ev.mime_type || '').toLowerCase();
    const sha = (ev.sha256 || '').toLowerCase();

    const matchesSearch = !mobileSearchQuery || filename.includes(mobileSearchQuery) || evId.includes(mobileSearchQuery) || sha.includes(mobileSearchQuery);

    let matchesFilter = true;
    if (activeMobileFilter === 'database') matchesFilter = mime.includes('sqlite') || mime.includes('database') || filename.endsWith('.db') || filename.endsWith('.sqlite');
    else if (activeMobileFilter === 'image') matchesFilter = mime.includes('image') || filename.endsWith('.jpg') || filename.endsWith('.png');
    else if (activeMobileFilter === 'telemetry') matchesFilter = mime.includes('json') || filename.includes('telemetry') || filename.includes('gps');
    else if (activeMobileFilter === 'archive') matchesFilter = mime.includes('zip') || mime.includes('tar') || mime.includes('gz') || filename.endsWith('.bin');

    return matchesSearch && matchesFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 24px; font-size: 11.5px;">No matching evidence artifacts found.</div>`;
    return;
  }

  container.innerHTML = filtered.map(ev => {
    const evId = escapeHtml(ev.evidence_id || '');
    const filename = escapeHtml(ev.original_filename || ev.filename || 'unknown_artifact');
    const sizeKb = (Number(ev.file_size || 0) / 1024).toFixed(1);
    const mime = escapeHtml(ev.mime_type || 'application/octet-stream');
    const sha = escapeHtml(ev.sha256 || '');
    const status = escapeHtml(ev.status || ev.vault_status || 'VAULTED');
    const timeStr = ev.uploaded_at ? new Date(ev.uploaded_at).toLocaleString() : 'N/A';

    return `
      <div class="mobile-evidence-card">
        <div class="mobile-ev-card-top">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="mobile-ev-icon">🔒</span>
            <div>
              <div class="mobile-ev-filename">${filename}</div>
              <div class="mono text-muted" style="font-size: 10px;">${evId} • ${sizeKb} KB</div>
            </div>
          </div>
          <span class="badge badge-accent">${status}</span>
        </div>

        <div class="mobile-ev-hash-row">
          <span class="hash-pill" style="max-width: 100%; width: 100%; font-size: 10px;" title="${sha}">
            ${sha.slice(0, 24)}...
          </span>
        </div>

        <div class="mobile-ev-card-footer">
          <span class="mono text-muted" style="font-size: 10px;">${escapeHtml(timeStr)}</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" data-mobile-detail-id="${evId}">
              Inspect
            </button>
            <button class="btn btn-primary btn-sm" data-mobile-verify-id="${evId}">
              Verify
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-mobile-verify-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mobile-verify-id');
      if (id) window.verifyEvidenceHash(id);
    });
  });

  container.querySelectorAll('[data-mobile-detail-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-mobile-detail-id');
      if (id) openMobileEvidenceDetail(id);
    });
  });
}

function openMobileEvidenceDetail(evidenceId) {
  const ev = evidenceList.find(e => e.evidence_id === evidenceId);
  if (!ev) return;

  const modal = document.getElementById('modal-mobile-evidence-detail');
  const title = document.getElementById('mobile-ev-detail-title');
  const body = document.getElementById('mobile-ev-detail-body');
  if (!modal || !body) return;

  const filename = escapeHtml(ev.original_filename || ev.filename || ev.evidence_id);
  const evId = escapeHtml(ev.evidence_id);
  const sizeBytes = Number(ev.file_size || 0);
  const sizeKb = (sizeBytes / 1024).toFixed(2);
  const mime = escapeHtml(ev.mime_type || 'application/octet-stream');
  const sha = escapeHtml(ev.sha256 || 'N/A');
  const uploader = escapeHtml(ev.uploaded_by || ev.acquired_by || 'Forensic Investigator');
  const timeStr = ev.uploaded_at ? new Date(ev.uploaded_at).toUTCString() : 'N/A';

  if (title) title.textContent = filename;

  body.innerHTML = `
    <div class="mobile-sheet-content">
      <div class="inspector-prop-group">
        <div class="inspector-prop-label">EVIDENCE ARTIFACT IDENTIFIER</div>
        <div class="mono text-accent font-bold" style="font-size: 13px;">${evId}</div>
      </div>

      <div class="inspector-grid-2">
        <div>
          <div class="inspector-prop-label">FILE SIZE</div>
          <div class="mono text-primary">${sizeKb} KB</div>
        </div>
        <div>
          <div class="inspector-prop-label">MIME TYPE</div>
          <div class="mono text-primary">${mime}</div>
        </div>
      </div>

      <div class="inspector-prop-group" style="margin-top: 10px;">
        <div class="inspector-prop-label">SHA-256 BITSTREAM HASH</div>
        <div class="hash-pill" style="max-width: 100%; width: 100%; word-break: break-all; white-space: normal; padding: 6px 8px; font-size: 11px;">
          ${sha}
        </div>
      </div>

      <div class="inspector-grid-2" style="margin-top: 10px;">
        <div>
          <div class="inspector-prop-label">ACQUIRED BY</div>
          <div class="text-primary font-semibold" style="font-size: 11.5px;">${uploader}</div>
        </div>
        <div>
          <div class="inspector-prop-label">TIMESTAMP (UTC)</div>
          <div class="mono text-muted" style="font-size: 10.5px;">${escapeHtml(timeStr)}</div>
        </div>
      </div>

      ${(isValidCoordinate(ev.latitude, ev.longitude) || (ev.metadata && isValidCoordinate(ev.metadata.latitude, ev.metadata.longitude))) ? `
        <div style="margin-top: 10px;">
          ${renderLocationObservationCard({
            latitude: ev.latitude || ev.metadata.latitude,
            longitude: ev.longitude || ev.metadata.longitude,
            timestamp: ev.uploaded_at,
            deviceId: ev.device_id,
            title: 'SEIZURE / EXTRACTION GPS LOCATION'
          })}
        </div>
      ` : ''}

      <div class="mobile-sheet-actions" style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
        <button class="btn btn-primary" id="mobile-sheet-btn-verify" style="width: 100%;">
          ⚡ Verify Cryptographic Hash
        </button>
        <a href="/api/v1/evidence/${evId}/download" class="btn btn-secondary" download style="width: 100%;">
          ⬇ Download Artifact File
        </a>
      </div>
    </div>
  `;

  const btnVerify = body.querySelector('#mobile-sheet-btn-verify');
  if (btnVerify) {
    btnVerify.onclick = () => {
      modal.classList.remove('active');
      window.verifyEvidenceHash(evId);
    };
  }

  modal.classList.add('active');
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

  // Mobile Evidence Filter Pills
  document.querySelectorAll('.mobile-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.mobile-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeMobileFilter = pill.getAttribute('data-ev-filter') || 'all';
      renderMobileEvidenceCards();
    });
  });

  const searchInput = document.getElementById('mobile-ev-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      mobileSearchQuery = e.target.value.toLowerCase().trim();
      renderMobileEvidenceCards();
    });
  }

  const closeMobileDetailBtn = document.getElementById('btn-close-mobile-ev-detail');
  const mobileDetailModal = document.getElementById('modal-mobile-evidence-detail');
  if (closeMobileDetailBtn && mobileDetailModal) {
    closeMobileDetailBtn.addEventListener('click', () => mobileDetailModal.classList.remove('active'));
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
            <div style="font-size: 15px; font-weight: 700; color: ${isVerified ? 'var(--color-accent)' : 'var(--color-error)'}; display: flex; align-items: center; gap: 6px; margin-top: 3px;">
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
            <div class="hash-pill" style="max-width: 100%; width: 100%; word-break: break-all; white-space: normal; color: ${isVerified ? 'var(--color-accent)' : 'var(--color-error)'};">${currHash}</div>
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
