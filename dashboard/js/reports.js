import { api, showToast } from './api.js';
import { getActiveCaseId } from './cases.js';

export async function loadReportPreview() {
  const caseId = getActiveCaseId();
  if (!caseId) return;

  const iframe = document.getElementById('report-iframe');
  if (!iframe) return;

  try {
    const html = await api.get(`/reports/${encodeURIComponent(caseId)}/html`);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (doc) {
      doc.open();
      const content = typeof html === 'string' ? html : (html.preview_html || '<p>Report generated.</p>');
      doc.write(content);
      doc.close();
    }
  } catch (err) {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { background: #0B0F17; color: #9AAAC0; font-family: 'Inter', sans-serif; padding: 40px; text-align: center; }
            h3 { color: #F1F5F9; font-size: 15px; margin-bottom: 8px; }
            p { font-size: 12px; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 11px; font-weight: 600; margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <span class="badge">REPORT ENGINE OFFLINE</span>
          <h3>Examination Report Standby</h3>
          <p>Report preview for Case ${caseId} is awaiting backend generation.</p>
        </body>
        </html>
      `);
      doc.close();
    }
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
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Generating...';
        const html = await api.get(`/reports/${encodeURIComponent(caseId)}/html`);
        const content = typeof html === 'string' ? html : (html.preview_html || '<html><body>TraceX Report</body></html>');
        const blob = new Blob([content], { type: 'text/html' });
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
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Report';
      }
    });
  }

  window.addEventListener('case:changed', () => {
    loadReportPreview();
  });
}
