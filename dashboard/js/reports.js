import { api, showToast } from './api.js';
import { getActiveCaseId } from './cases.js';

export async function loadReportPreview() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  const iframe = document.getElementById('report-iframe');
  if (!iframe) return;

  try {
    const html = await api.get(`/reports/${caseId}/html`);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
  } catch (err) {
    console.error('Failed to load report preview:', err);
  }
}

export function initReports() {
  const downloadBtn = document.getElementById('btn-download-report');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      const caseId = getActiveCaseId();
      if (!caseId) {
        showToast('Please select a case to export report', 'warning');
        return;
      }
      try {
        const html = await api.get(`/reports/${caseId}/html`);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TraceX-Forensic-Report-${caseId}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Forensic examination report downloaded', 'success');
      } catch (err) {
        showToast(err.message || 'Report download failed', 'error');
      }
    });
  }

  window.addEventListener('case:changed', () => {
    loadReportPreview();
  });
}
