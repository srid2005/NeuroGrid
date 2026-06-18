/* ═══════════════════════════════════════════
   CROSS-LINK — link nodes across layers/subjects
═══════════════════════════════════════════ */
import {
  getAllNodesForWorkspace, getNode, getSubject, getUnit,
  createCrossEdge, getCrossEdgesForNode, deleteCrossEdge,
  getSubjects, getUnits
} from '../core/store.js';
import { openModal } from '../ui/modal.js';

export function openCrossLinkModal(wsId, fromNodeId, onDone) {
  const fromNode = getNode(fromNodeId);
  if (!fromNode) return;

  // Build node list grouped by subject > unit
  const allNodes = getAllNodesForWorkspace(wsId).filter(n => n.id !== fromNodeId);
  const subjects = getSubjects(wsId);

  let selectedNodeId = null;

  // Group nodes
  const grouped = {};
  allNodes.forEach(node => {
    const sub = getSubject(node.subjectId);
    if (!sub) return;
    const subKey = sub.id;
    if (!grouped[subKey]) grouped[subKey] = { sub, byUnit: {} };
    const uKey = node.unitId || '__cube__';
    if (!grouped[subKey].byUnit[uKey]) grouped[subKey].byUnit[uKey] = [];
    grouped[subKey].byUnit[uKey].push(node);
  });

  let listHTML = '';
  Object.values(grouped).forEach(({ sub, byUnit }) => {
    listHTML += `<div class="node-picker-group">${esc(sub.name)}</div>`;
    Object.entries(byUnit).forEach(([uKey, nodes]) => {
      if (uKey !== '__cube__') {
        const unit = getUnit(uKey);
        if (unit) listHTML += `<div class="node-picker-group" style="padding-left:16px;font-size:8px;color:var(--text-dim)">↳ ${esc(unit.name)}</div>`;
      }
      nodes.forEach(node => {
        listHTML += `
          <div class="node-picker-item" data-node-id="${node.id}">
            <div class="node-picker-dot" style="background:${node.color}"></div>
            <span>${esc(node.name)}</span>
            ${node.unitId ? `<span style="font-size:9px;color:var(--text-dim);margin-left:auto">subcube</span>` : ''}
          </div>`;
      });
    });
  });

  if (!listHTML) listHTML = '<div class="conn-empty">No other nodes in this workspace yet</div>';

  openModal({
    title: 'Cross-Layer Link',
    body: `
      <div style="margin-bottom:12px">
        <div class="form-label">From Node</div>
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
          <div style="width:8px;height:8px;border-radius:50%;background:${fromNode.color}"></div>
          <span style="font-size:13px;font-weight:600">${esc(fromNode.name)}</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Link To Node</label>
        <div class="node-picker-list" id="crossLinkList">${listHTML}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Relationship Label (optional)</label>
        <input class="form-input" id="crossLinkLabel" placeholder="e.g. prerequisite, related, extends"/>
      </div>`,
    confirmText: 'Create Link',
    onConfirm: () => {
      if (!selectedNodeId) return false;
      const label = document.getElementById('crossLinkLabel')?.value?.trim() || 'cross-link';
      createCrossEdge(wsId, fromNodeId, selectedNodeId, label);
      if (onDone) onDone();
    }
  });

  setTimeout(() => {
    document.querySelectorAll('.node-picker-item[data-node-id]').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.node-picker-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        selectedNodeId = item.dataset.nodeId;
      });
    });
  }, 0);
}

function esc(s='') {
  return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}
