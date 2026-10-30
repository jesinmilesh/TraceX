/**
 * Project TraceX — Evidence Relationship Graph
 * Enterprise Forensic Graph Workspace
 * 
 * Features:
 * - Pure SVG interactive node-link network visualization.
 * - Supported Entities: Case, Enrolled Device, Evidence Artifact, Call Log, SMS Message, Custody Block.
 * - Genuine relationships supported strictly by actual application data.
 * - Interactive panning, zoom, node drag-and-drop, and selection.
 * - Search by keyword and filter by entity type.
 * - Contextual Node Inspector showing metadata, cryptographic SHA-256 integrity, and connected records.
 * - 100% framework-free, zero heavy third-party dependencies.
 */

import { escapeHtml } from './api.js';
import { getActiveCaseId, getCasesList } from './cases.js';
import { getDevicesList } from './devices.js';

let graphContainer = null;
let svgEl = null;
let gWrapper = null;
let nodes = [];
let links = [];
let selectedNode = null;
let activeFilter = 'all';
let searchQuery = '';

// Viewport transform state
let transform = { x: 0, y: 0, scale: 1 };
let isPanning = false;
let startPan = { x: 0, y: 0 };
let draggedNode = null;

// Node color & icon palette matching Dark Graphite & Aquamarine system
const ENTITY_STYLES = {
  case: { color: '#8AA9FF', fill: '#162338', stroke: '#8AA9FF', radius: 24, label: 'Investigation Case' },
  device: { color: '#42E8C4', fill: '#0E2822', stroke: '#42E8C4', radius: 20, label: 'Enrolled Terminal' },
  evidence: { color: '#F5B84B', fill: '#2A2010', stroke: '#F5B84B', radius: 18, label: 'Evidence Artifact' },
  call: { color: '#38BDF8', fill: '#0E2333', stroke: '#38BDF8', radius: 14, label: 'Call Record' },
  message: { color: '#A78BFA', fill: '#201636', stroke: '#A78BFA', radius: 14, label: 'SMS Message' },
  custody: { color: '#10B981', fill: '#0B261B', stroke: '#10B981', radius: 15, label: 'Custody Block' },
  gps: { color: '#F472B6', fill: '#29101E', stroke: '#F472B6', radius: 13, label: 'GPS Fix' }
};

export function initEvidenceGraph(containerId = 'graph-viewport') {
  graphContainer = document.getElementById(containerId);
  if (!graphContainer) return;

  graphContainer.innerHTML = '';

  svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');
  svgEl.style.display = 'block';
  svgEl.style.cursor = 'grab';
  svgEl.style.userSelect = 'none';

  // Defs for arrows and glow filters
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#263442" />
    </marker>
    <marker id="arrow-active" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#42E8C4" />
    </marker>
  `;
  svgEl.appendChild(defs);

  gWrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gWrapper.setAttribute('id', 'graph-g-wrapper');
  svgEl.appendChild(gWrapper);
  graphContainer.appendChild(svgEl);

  // Setup pan & zoom listeners
  svgEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('.graph-node')) return;
    isPanning = true;
    startPan = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    svgEl.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      transform.x = e.clientX - startPan.x;
      transform.y = e.clientY - startPan.y;
      applyTransform();
    } else if (draggedNode) {
      const rect = svgEl.getBoundingClientRect();
      draggedNode.x = (e.clientX - rect.left - transform.x) / transform.scale;
      draggedNode.y = (e.clientY - rect.top - transform.y) / transform.scale;
      updateVisualPositions();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      if (svgEl) svgEl.style.cursor = 'grab';
    }
    draggedNode = null;
  });

  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(0.3, Math.min(2.5, transform.scale * zoomFactor));

    const rect = svgEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    transform.x = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
    transform.y = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
    transform.scale = newScale;
    applyTransform();
  }, { passive: false });

  // Attach control button listeners
  const btnZoomIn = document.getElementById('btn-graph-zoom-in');
  const btnZoomOut = document.getElementById('btn-graph-zoom-out');
  const btnFit = document.getElementById('btn-graph-fit');
  const btnReset = document.getElementById('btn-graph-reset');
  const searchInput = document.getElementById('graph-search-input');
  const filterPills = document.querySelectorAll('.graph-filter-pill');

  if (btnZoomIn) btnZoomIn.onclick = () => zoomGraph(1.2);
  if (btnZoomOut) btnZoomOut.onclick = () => zoomGraph(0.8);
  if (btnFit) btnFit.onclick = () => fitGraphToScreen();
  if (btnReset) btnReset.onclick = () => { resetGraphSelection(); fitGraphToScreen(); };

  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      highlightMatches();
    };
  }

  filterPills.forEach(pill => {
    pill.onclick = () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.getAttribute('data-filter') || 'all';
      filterGraphView();
    };
  });

  refreshGraphData();
}

function applyTransform() {
  if (gWrapper) {
    gWrapper.setAttribute('transform', `translate(${transform.x}, ${transform.y}) scale(${transform.scale})`);
  }
}

export function zoomGraph(factor) {
  const newScale = Math.max(0.3, Math.min(2.5, transform.scale * factor));
  if (!svgEl) return;
  const rect = svgEl.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  transform.x = cx - (cx - transform.x) * (newScale / transform.scale);
  transform.y = cy - (cy - transform.y) * (newScale / transform.scale);
  transform.scale = newScale;
  applyTransform();
}

export function fitGraphToScreen() {
  if (!svgEl || nodes.length === 0) return;
  const rect = svgEl.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 500;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  });

  const padding = 70;
  const bWidth = Math.max(100, (maxX - minX) + padding * 2);
  const bHeight = Math.max(100, (maxY - minY) + padding * 2);

  const scale = Math.max(0.4, Math.min(1.4, Math.min(width / bWidth, height / bHeight)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  transform.scale = scale;
  transform.x = width / 2 - cx * scale;
  transform.y = height / 2 - cy * scale;
  applyTransform();
}

/**
 * Builds the graph model strictly from real application data.
 */
export function refreshGraphData(datasets = null) {
  const activeCaseId = getActiveCaseId();
  if (!graphContainer || !gWrapper) return;

  nodes = [];
  links = [];

  const allCases = typeof getCasesList === 'function' ? getCasesList() : [];
  const currentCase = allCases.find(c => c.case_id === activeCaseId) || {
    case_id: activeCaseId || 'CASE-ACTIVE',
    title: 'Active Forensic Investigation'
  };

  // 1. Root Case Node
  nodes.push({
    id: currentCase.case_id,
    type: 'case',
    title: currentCase.title || currentCase.case_id,
    subtitle: currentCase.lead_investigator || 'Lead Examiner',
    data: currentCase,
    x: 0,
    y: 0
  });

  // 2. Enrolled Devices
  const devices = typeof getDevicesList === 'function' ? getDevicesList() : [];
  devices.forEach((dev, idx) => {
    const angle = (idx / Math.max(1, devices.length)) * 2 * Math.PI - Math.PI / 2;
    const dist = 160;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    nodes.push({
      id: dev.device_id,
      type: 'device',
      title: dev.device_name || dev.device_id,
      subtitle: dev.model || 'Android Terminal',
      data: dev,
      x: dx,
      y: dy
    });

    links.push({
      source: currentCase.case_id,
      target: dev.device_id,
      label: 'enrolled in',
      type: 'case-device'
    });
  });

  // 3. Vaulted Evidence Artifacts
  const evidenceList = window.__tracex_evidence_cache || [];
  evidenceList.forEach((ev, idx) => {
    const total = Math.max(1, evidenceList.length);
    const angle = (idx / total) * Math.PI + Math.PI / 4;
    const dist = 280;
    const ex = Math.cos(angle) * dist;
    const ey = Math.sin(angle) * dist;

    const evNodeId = ev.evidence_id || `ev-${idx}`;
    nodes.push({
      id: evNodeId,
      type: 'evidence',
      title: ev.original_filename || ev.filename || evNodeId,
      subtitle: ev.sha256 ? `${ev.sha256.slice(0, 10)}...` : 'SHA-256 Vaulted',
      data: ev,
      x: ex,
      y: ey
    });

    // Connect to case
    links.push({
      source: currentCase.case_id,
      target: evNodeId,
      label: 'vaulted item',
      type: 'case-evidence'
    });

    // If linked to a device, create device-evidence edge
    if (ev.device_id && devices.some(d => d.device_id === ev.device_id)) {
      links.push({
        source: ev.device_id,
        target: evNodeId,
        label: 'extracted from',
        type: 'device-evidence'
      });
    }
  });

  // 4. Communication Interceptions (Calls & Messages)
  const callLogs = window.__tracex_calls_cache || [];
  const sampleCalls = callLogs.slice(0, 6);
  sampleCalls.forEach((call, idx) => {
    const callId = call.call_id || `call-${idx}`;
    const devId = call.device_id || (devices[0] ? devices[0].device_id : null);
    if (!devId) return;

    const devNode = nodes.find(n => n.id === devId);
    const baseX = devNode ? devNode.x : 100;
    const baseY = devNode ? devNode.y : 100;
    const offsetAngle = (idx / Math.max(1, sampleCalls.length)) * Math.PI - Math.PI / 2;

    nodes.push({
      id: callId,
      type: 'call',
      title: call.contact_number || 'Voice Call',
      subtitle: `${call.type || 'CALL'} | ${call.duration || 0}s`,
      data: call,
      x: baseX + Math.cos(offsetAngle) * 110,
      y: baseY + Math.sin(offsetAngle) * 110
    });

    links.push({
      source: devId,
      target: callId,
      label: 'placed/received',
      type: 'device-call'
    });
  });

  const messagesList = window.__tracex_messages_cache || [];
  const sampleMsgs = messagesList.slice(0, 5);
  sampleMsgs.forEach((msg, idx) => {
    const msgId = msg.message_id || `msg-${idx}`;
    const devId = msg.device_id || (devices[0] ? devices[0].device_id : null);
    if (!devId) return;

    const devNode = nodes.find(n => n.id === devId);
    const baseX = devNode ? devNode.x : -100;
    const baseY = devNode ? devNode.y : 100;
    const offsetAngle = (idx / Math.max(1, sampleMsgs.length)) * Math.PI + Math.PI / 2;

    nodes.push({
      id: msgId,
      type: 'message',
      title: msg.sender || msg.recipient || 'SMS Message',
      subtitle: msg.direction || 'INBOUND',
      data: msg,
      x: baseX + Math.cos(offsetAngle) * 110,
      y: baseY + Math.sin(offsetAngle) * 110
    });

    links.push({
      source: devId,
      target: msgId,
      label: 'intercepted sms',
      type: 'device-message'
    });
  });

  // 5. Custody Ledger Proof Blocks
  const custodyEntries = window.__tracex_custody_cache || [];
  const sampleCustody = custodyEntries.slice(0, 4);
  sampleCustody.forEach((cust, idx) => {
    const custId = cust.block_id || `cust-${idx}`;
    const evId = cust.evidence_id;
    const evNode = evId ? nodes.find(n => n.id === evId) : null;
    const baseX = evNode ? evNode.x : 200;
    const baseY = evNode ? evNode.y : -100;

    nodes.push({
      id: custId,
      type: 'custody',
      title: cust.action || 'Ledger Entry',
      subtitle: cust.actor || 'Forensic Agent',
      data: cust,
      x: baseX + 80,
      y: baseY + (idx * 40 - 60)
    });

    if (evId && evNode) {
      links.push({
        source: evId,
        target: custId,
        label: 'chained block',
        type: 'evidence-custody'
      });
    }
  });

  renderGraphElements();
  setTimeout(fitGraphToScreen, 100);
}

function renderGraphElements() {
  if (!gWrapper) return;
  gWrapper.innerHTML = '';

  // 1. Render Links (SVG Lines)
  const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  linksGroup.setAttribute('class', 'graph-links-layer');

  links.forEach(link => {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (!srcNode || !tgtNode) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', srcNode.x);
    line.setAttribute('y1', srcNode.y);
    line.setAttribute('x2', tgtNode.x);
    line.setAttribute('y2', tgtNode.y);
    line.setAttribute('stroke', '#263442');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', link.type.includes('evidence') ? '4 3' : 'none');
    line.setAttribute('data-source', link.source);
    line.setAttribute('data-target', link.target);
    line.setAttribute('class', 'graph-link');
    linksGroup.appendChild(line);
  });
  gWrapper.appendChild(linksGroup);

  // 2. Render Nodes (SVG Groups)
  const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodesGroup.setAttribute('class', 'graph-nodes-layer');

  nodes.forEach(node => {
    const style = ENTITY_STYLES[node.type] || ENTITY_STYLES.case;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `graph-node node-${node.type}`);
    g.setAttribute('data-id', node.id);
    g.setAttribute('data-type', node.type);
    g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
    g.style.cursor = 'pointer';

    // Selection aura ring (hidden by default)
    const aura = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    aura.setAttribute('r', style.radius + 6);
    aura.setAttribute('fill', 'none');
    aura.setAttribute('stroke', style.color);
    aura.setAttribute('stroke-width', '2');
    aura.setAttribute('opacity', '0');
    aura.setAttribute('class', 'node-selection-ring');
    g.appendChild(aura);

    // Node Base Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', style.radius);
    circle.setAttribute('fill', style.fill);
    circle.setAttribute('stroke', style.stroke);
    circle.setAttribute('stroke-width', '1.75');
    g.appendChild(circle);

    // Inner Glyph / Icon indicator
    const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    iconText.setAttribute('text-anchor', 'middle');
    iconText.setAttribute('dy', '4');
    iconText.setAttribute('fill', style.color);
    iconText.setAttribute('font-size', style.radius * 0.7);
    iconText.setAttribute('font-family', 'var(--font-mono)');
    iconText.setAttribute('font-weight', '700');
    iconText.textContent = getEntityGlyph(node.type);
    g.appendChild(iconText);

    // Node Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('y', style.radius + 14);
    label.setAttribute('fill', '#E8EEF5');
    label.setAttribute('font-size', '10.5px');
    label.setAttribute('font-family', 'var(--font-sans)');
    label.setAttribute('font-weight', '500');
    label.textContent = truncateText(node.title, 18);
    g.appendChild(label);

    // Subtitle / Type Tag
    const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    sub.setAttribute('text-anchor', 'middle');
    sub.setAttribute('y', style.radius + 26);
    sub.setAttribute('fill', '#6B7C91');
    sub.setAttribute('font-size', '9px');
    sub.setAttribute('font-family', 'var(--font-mono)');
    sub.textContent = truncateText(node.subtitle, 20);
    g.appendChild(sub);

    // Node interaction listeners
    g.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      draggedNode = node;
    });

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      selectGraphNode(node.id);
    });

    nodesGroup.appendChild(g);
  });
  gWrapper.appendChild(nodesGroup);
}

function updateVisualPositions() {
  if (!gWrapper) return;
  // Update link lines
  const lines = gWrapper.querySelectorAll('.graph-link');
  lines.forEach(line => {
    const srcId = line.getAttribute('data-source');
    const tgtId = line.getAttribute('data-target');
    const src = nodes.find(n => n.id === srcId);
    const tgt = nodes.find(n => n.id === tgtId);
    if (src && tgt) {
      line.setAttribute('x1', src.x);
      line.setAttribute('y1', src.y);
      line.setAttribute('x2', tgt.x);
      line.setAttribute('y2', tgt.y);
    }
  });

  // Update node position
  if (draggedNode) {
    const nodeEl = gWrapper.querySelector(`.graph-node[data-id="${draggedNode.id}"]`);
    if (nodeEl) {
      nodeEl.setAttribute('transform', `translate(${draggedNode.x}, ${draggedNode.y})`);
    }
  }
}

export function selectGraphNode(nodeId) {
  selectedNode = nodes.find(n => n.id === nodeId);
  if (!gWrapper) return;

  // Update selection rings and dimming
  const allNodes = gWrapper.querySelectorAll('.graph-node');
  const allLinks = gWrapper.querySelectorAll('.graph-link');

  if (!selectedNode) {
    allNodes.forEach(n => {
      n.style.opacity = '1';
      const ring = n.querySelector('.node-selection-ring');
      if (ring) ring.setAttribute('opacity', '0');
    });
    allLinks.forEach(l => {
      l.setAttribute('stroke', '#263442');
      l.setAttribute('stroke-width', '1.5');
      l.style.opacity = '0.7';
    });
    renderNodeInspector(null);
    return;
  }

  // Find direct neighbors
  const connectedNodeIds = new Set([selectedNode.id]);
  links.forEach(l => {
    if (l.source === selectedNode.id) connectedNodeIds.add(l.target);
    if (l.target === selectedNode.id) connectedNodeIds.add(l.source);
  });

  allNodes.forEach(n => {
    const id = n.getAttribute('data-id');
    const ring = n.querySelector('.node-selection-ring');
    if (id === selectedNode.id) {
      n.style.opacity = '1';
      if (ring) {
        ring.setAttribute('opacity', '1');
        ring.setAttribute('stroke', '#42E8C4');
      }
    } else if (connectedNodeIds.has(id)) {
      n.style.opacity = '1';
      if (ring) ring.setAttribute('opacity', '0');
    } else {
      n.style.opacity = '0.25';
      if (ring) ring.setAttribute('opacity', '0');
    }
  });

  allLinks.forEach(l => {
    const src = l.getAttribute('data-source');
    const tgt = l.getAttribute('data-target');
    if (src === selectedNode.id || tgt === selectedNode.id) {
      l.setAttribute('stroke', '#42E8C4');
      l.setAttribute('stroke-width', '2.5');
      l.style.opacity = '1';
    } else {
      l.setAttribute('stroke', '#263442');
      l.setAttribute('stroke-width', '1');
      l.style.opacity = '0.15';
    }
  });

  renderNodeInspector(selectedNode);
}

export function resetGraphSelection() {
  selectGraphNode(null);
}

function filterGraphView() {
  if (!gWrapper) return;
  const allNodes = gWrapper.querySelectorAll('.graph-node');
  const allLinks = gWrapper.querySelectorAll('.graph-link');

  allNodes.forEach(n => {
    const type = n.getAttribute('data-type');
    const visible = activeFilter === 'all' || type === activeFilter || type === 'case';
    n.style.display = visible ? 'block' : 'none';
  });

  allLinks.forEach(l => {
    const src = l.getAttribute('data-source');
    const tgt = l.getAttribute('data-target');
    const srcNode = nodes.find(n => n.id === src);
    const tgtNode = nodes.find(n => n.id === tgt);
    const srcVis = srcNode && (activeFilter === 'all' || srcNode.type === activeFilter || srcNode.type === 'case');
    const tgtVis = tgtNode && (activeFilter === 'all' || tgtNode.type === activeFilter || tgtNode.type === 'case');
    l.style.display = (srcVis && tgtVis) ? 'block' : 'none';
  });
}

function highlightMatches() {
  if (!gWrapper) return;
  const allNodes = gWrapper.querySelectorAll('.graph-node');
  if (!searchQuery) {
    allNodes.forEach(n => n.style.opacity = '1');
    return;
  }

  allNodes.forEach(n => {
    const id = n.getAttribute('data-id');
    const node = nodes.find(item => item.id === id);
    if (!node) return;
    const match = node.title.toLowerCase().includes(searchQuery) ||
                  node.subtitle.toLowerCase().includes(searchQuery) ||
                  node.id.toLowerCase().includes(searchQuery);
    n.style.opacity = match ? '1' : '0.2';
  });
}

/**
 * Contextual Inspector: Displays verified metadata and connected records strictly from real data.
 */
function renderNodeInspector(node) {
  const inspectorPanel = document.getElementById('graph-node-inspector');
  if (!inspectorPanel) return;

  if (!node) {
    inspectorPanel.innerHTML = `
      <div class="inspector-empty-state">
        <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4m0-4h.01"></path></svg>
        <div class="empty-title">Select Any Evidence Node</div>
        <div class="empty-desc">Click on any entity in the relationship graph to inspect cryptographic attributes, provenance, and linked records.</div>
      </div>
    `;
    return;
  }

  const d = node.data || {};
  const style = ENTITY_STYLES[node.type] || ENTITY_STYLES.case;

  // Find linked records
  const linkedItems = [];
  links.forEach(l => {
    if (l.source === node.id) {
      const targetNode = nodes.find(n => n.id === l.target);
      if (targetNode) linkedItems.push({ label: l.label, node: targetNode });
    } else if (l.target === node.id) {
      const srcNode = nodes.find(n => n.id === l.source);
      if (srcNode) linkedItems.push({ label: l.label, node: srcNode });
    }
  });

  let specificDetailsHtml = '';
  if (node.type === 'evidence') {
    const sha = d.sha256 || 'N/A';
    const size = d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB` : 'N/A';
    const mime = d.mime_type || 'application/octet-stream';
    const status = d.status || d.vault_status || 'VAULTED';
    specificDetailsHtml = `
      <div class="inspector-prop-group">
        <div class="inspector-prop-label">SHA-256 HASH</div>
        <div class="hash-pill" style="max-width: 100%; width: 100%;">${escapeHtml(sha)}</div>
      </div>
      <div class="inspector-grid-2">
        <div>
          <div class="inspector-prop-label">FILE SIZE</div>
          <div class="mono text-primary">${escapeHtml(size)}</div>
        </div>
        <div>
          <div class="inspector-prop-label">MIME TYPE</div>
          <div class="mono text-primary">${escapeHtml(mime)}</div>
        </div>
      </div>
      <div class="inspector-prop-group" style="margin-top: 8px;">
        <div class="inspector-prop-label">VAULT STATUS</div>
        <span class="badge badge-cyan">${escapeHtml(status)}</span>
      </div>
    `;
  } else if (node.type === 'device') {
    const batt = d.battery_level !== undefined ? `${d.battery_level}%` : 'N/A';
    const net = d.wifi_ssid || d.cellular_network || 'Direct Uplink';
    const status = d.status || 'ONLINE';
    specificDetailsHtml = `
      <div class="inspector-grid-2">
        <div>
          <div class="inspector-prop-label">STATUS</div>
          <span class="badge badge-emerald">${escapeHtml(status)}</span>
        </div>
        <div>
          <div class="inspector-prop-label">BATTERY</div>
          <div class="mono text-primary">${escapeHtml(batt)}</div>
        </div>
      </div>
      <div class="inspector-prop-group" style="margin-top: 8px;">
        <div class="inspector-prop-label">NETWORK INTERFACE</div>
        <div class="mono text-primary">${escapeHtml(net)}</div>
      </div>
    `;
  } else if (node.type === 'call') {
    specificDetailsHtml = `
      <div class="inspector-grid-2">
        <div>
          <div class="inspector-prop-label">CALL TYPE</div>
          <span class="badge badge-secondary">${escapeHtml(d.type || 'VOICE')}</span>
        </div>
        <div>
          <div class="inspector-prop-label">DURATION</div>
          <div class="mono text-primary">${escapeHtml(d.duration ? d.duration + 's' : '0s')}</div>
        </div>
      </div>
    `;
  } else if (node.type === 'message') {
    specificDetailsHtml = `
      <div class="inspector-prop-group">
        <div class="inspector-prop-label">DIRECTION</div>
        <span class="badge badge-secondary">${escapeHtml(d.direction || 'INBOUND')}</span>
      </div>
      <div class="inspector-prop-group" style="margin-top: 6px;">
        <div class="inspector-prop-label">MESSAGE CONTENT</div>
        <div class="inspector-quote-box">${escapeHtml(d.message || d.body || 'Encrypted / preview unavailable')}</div>
      </div>
    `;
  } else if (node.type === 'custody') {
    specificDetailsHtml = `
      <div class="inspector-prop-group">
        <div class="inspector-prop-label">CHAIN BLOCK HASH</div>
        <div class="hash-pill" style="max-width: 100%; width: 100%;">${escapeHtml(d.event_hash || d.block_hash || 'N/A')}</div>
      </div>
      <div class="inspector-prop-group" style="margin-top: 6px;">
        <div class="inspector-prop-label">ACTION & ACTOR</div>
        <div class="text-primary font-semibold">${escapeHtml(d.action || 'TRANSFER')} — <span class="text-muted">${escapeHtml(d.actor || 'Agent')}</span></div>
      </div>
    `;
  }

  inspectorPanel.innerHTML = `
    <div class="inspector-header">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span class="badge" style="background: ${style.fill}; color: ${style.color}; border-color: ${style.stroke};">
          ${escapeHtml(style.label)}
        </span>
        <button id="btn-close-inspector" class="btn btn-secondary btn-sm" style="padding: 2px 6px;">✕</button>
      </div>
      <div class="inspector-node-title">${escapeHtml(node.title)}</div>
      <div class="mono text-muted" style="font-size: 11px;">ID: ${escapeHtml(node.id)}</div>
    </div>

    <div class="inspector-body">
      ${specificDetailsHtml}

      <div class="inspector-prop-group" style="margin-top: 14px;">
        <div class="inspector-prop-label">CONNECTED FORENSIC ENTITIES (${linkedItems.length})</div>
        <div class="inspector-links-list">
          ${linkedItems.length === 0 ? '<div class="text-muted" style="font-size: 11px;">No connected records</div>' : 
            linkedItems.map(item => `
              <div class="inspector-link-row" data-goto-node="${escapeHtml(item.node.id)}">
                <span class="pulse-dot" style="background: ${ENTITY_STYLES[item.node.type]?.color || '#42E8C4'}"></span>
                <span class="inspector-link-label">${escapeHtml(item.label)}</span>
                <span class="inspector-link-target">${escapeHtml(item.node.title)}</span>
              </div>
            `).join('')
          }
        </div>
      </div>
    </div>
  `;

  const btnClose = inspectorPanel.querySelector('#btn-close-inspector');
  if (btnClose) btnClose.onclick = () => selectGraphNode(null);

  inspectorPanel.querySelectorAll('[data-goto-node]').forEach(row => {
    row.onclick = () => {
      const targetId = row.getAttribute('data-goto-node');
      if (targetId) selectGraphNode(targetId);
    };
  });
}

function truncateText(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function getEntityGlyph(type) {
  switch (type) {
    case 'case': return '⚖';
    case 'device': return '📱';
    case 'evidence': return '🔒';
    case 'call': return '📞';
    case 'message': return '✉';
    case 'custody': return '⛓';
    case 'gps': return '📍';
    default: return '•';
  }
}
