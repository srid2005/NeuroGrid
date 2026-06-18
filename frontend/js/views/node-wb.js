/* ═══════════════════════════════════════════
   NODE WHITEBOARD — per-node canvas + sidebar
═══════════════════════════════════════════ */
import {
  getNode, updateNode, getSubject, getUnit,
  getEdges, getEdge, deleteEdge,
  getCrossEdgesForNode, deleteCrossEdge, getNode as gn,
  getAllNodesForWorkspace
} from '../core/store.js';
import { emit } from '../core/events.js';
import { openModal } from '../ui/modal.js';
import { openCrossLinkModal } from './cross-link.js';

let _wsId=null, _subjectId=null, _unitId=null, _nodeId=null;
let _canvas=null, _ctx=null;
let _drawing=false, _tool='pen', _color='#A78BFA', _size=2;
let _history=[], _redoStack=[];

export function initNodeWb(wsId, subjectId, unitId, nodeId) {
  _wsId=wsId; _subjectId=subjectId; _unitId=unitId; _nodeId=nodeId;

  const node = getNode(nodeId);
  if (!node) return;

  // Update toolbar breadcrumb title
  document.getElementById('nodeWbTitle').textContent = node.name;

  // Setup canvas
  _canvas = document.getElementById('nodeCanvas');
  _ctx    = _canvas.getContext('2d');
  resizeCanvas();
  if (node.canvasData) {
    const img = new Image();
    img.onload = () => _ctx.drawImage(img, 0, 0);
    img.src = node.canvasData;
  } else {
    clearCanvas();
  }

  // Setup sidebar
  renderNodeSidebar(node);

  // Canvas events
  _canvas.addEventListener('pointerdown', onDown);
  _canvas.addEventListener('pointermove', onMove);
  _canvas.addEventListener('pointerup',   onUp);
  _canvas.addEventListener('pointerleave',onUp);
  window.addEventListener('resize', resizeCanvas);

  // Toolbar events
  setupToolbar();
}

function resizeCanvas() {
  if (!_canvas) return;
  const wrap = _canvas.parentElement;
  const data = _canvas.toDataURL();
  _canvas.width  = wrap.clientWidth;
  _canvas.height = wrap.clientHeight;
  if (_history.length) {
    const img = new Image();
    img.onload = () => _ctx.drawImage(img, 0, 0);
    img.src = data;
  } else {
    clearCanvas();
  }
}

function clearCanvas() {
  if (!_ctx || !_canvas) return;
  _ctx.fillStyle = '#0A0B0E';
  _ctx.fillRect(0, 0, _canvas.width, _canvas.height);
}

function setupToolbar() {
  document.querySelectorAll('#nodeWbToolbar .tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#nodeWbToolbar .tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      _tool = btn.dataset.tool;
      _canvas.style.cursor = _tool==='eraser'?'cell':'crosshair';
    });
  });
  document.querySelectorAll('#nodeWbToolbar .stroke-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#nodeWbToolbar .stroke-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      _size = +btn.dataset.size;
    });
  });
  const cp = document.getElementById('nodeColorPicker');
  if (cp) cp.addEventListener('input', e => { _color = e.target.value; });
  document.getElementById('nodeUndoBtn')?.addEventListener('click', undo);
  document.getElementById('nodeRedoBtn')?.addEventListener('click', redo);
  document.getElementById('nodeClearBtn')?.addEventListener('click', () => {
    openModal({
      title:'Clear Canvas',
      body:'<p style="color:var(--text-muted);font-size:13px">Clear all drawing on this canvas?</p>',
      confirmText:'Clear',confirmDanger:true,
      onConfirm:()=>{ clearCanvas(); saveCanvas(); }
    });
  });
}

function onDown(e) {
  _drawing = true;
  saveSnapshot();
  _ctx.beginPath();
  _ctx.moveTo(e.offsetX, e.offsetY);
}
function onMove(e) {
  if (!_drawing) return;
  _ctx.lineWidth   = _tool==='eraser' ? _size*6 : _size;
  _ctx.lineCap     = 'round';
  _ctx.lineJoin    = 'round';
  _ctx.strokeStyle = _tool==='eraser' ? '#0A0B0E' : _color;
  _ctx.lineTo(e.offsetX, e.offsetY);
  _ctx.stroke();
}
function onUp() {
  _drawing = false;
  saveCanvas();
}
function saveSnapshot() {
  _history.push(_canvas.toDataURL());
  if (_history.length > 40) _history.shift();
  _redoStack = [];
}
function undo() {
  if (!_history.length) return;
  _redoStack.push(_canvas.toDataURL());
  const prev = _history.pop();
  const img = new Image();
  img.onload = () => { clearCanvas(); _ctx.drawImage(img,0,0); };
  img.src = prev;
}
function redo() {
  if (!_redoStack.length) return;
  _history.push(_canvas.toDataURL());
  const next = _redoStack.pop();
  const img = new Image();
  img.onload = () => { clearCanvas(); _ctx.drawImage(img,0,0); };
  img.src = next;
}
function saveCanvas() {
  updateNode(_nodeId, { canvasData: _canvas.toDataURL('image/jpeg', 0.7) });
}

function renderNodeSidebar(node) {
  const sub  = getSubject(node.subjectId);
  const unit = node.unitId ? getUnit(node.unitId) : null;

  // Badge + title
  document.getElementById('nicBadge').style.cssText = `background:${node.color}22;color:${node.color};border:1px solid ${node.color}44`;
  document.getElementById('nicBadge').textContent   = sub?.name || 'Node';
  document.getElementById('nicTitle').textContent   = node.name;
  document.getElementById('nicUnit').textContent    = unit ? `SubCube: ${unit.name}` : 'Subject level';

  // Notes
  const notesEl = document.getElementById('nodeNotes');
  notesEl.value = node.notes || '';
  notesEl.oninput = () => updateNode(_nodeId, { notes: notesEl.value });

  // Connections
  renderConnections(node);
}

function renderConnections(node) {
  const list = document.getElementById('connList');
  list.innerHTML = '';

  // Same-layer edges
  const edges = getEdges(node.subjectId, node.unitId);
  const myEdges = edges.filter(e => e.fromNodeId===node.id || e.toNodeId===node.id);
  myEdges.forEach(edge => {
    const otherId = edge.fromNodeId===node.id ? edge.toNodeId : edge.fromNodeId;
    const other   = getNode(otherId);
    if (!other) return;
    const item = makeConnItem(other, edge.label||'linked', false, () => {
      openModal({
        title:'Remove Connection',
        body:`<p style="color:var(--text-muted);font-size:13px">Remove link to <strong>${esc(other.name)}</strong>?</p>`,
        confirmText:'Remove',confirmDanger:true,
        onConfirm:()=>{ deleteEdge(edge.id); renderConnections(getNode(_nodeId)); }
      });
    });
    list.appendChild(item);
  });

  // Cross-layer edges
  const crossEdges = getCrossEdgesForNode(node.id);
  crossEdges.forEach(edge => {
    const otherId = edge.fromNodeId===node.id ? edge.toNodeId : edge.fromNodeId;
    const other   = getNode(otherId);
    if (!other) return;
    const item = makeConnItem(other, edge.label||'cross-link', true, () => {
      openModal({
        title:'Remove Cross-Link',
        body:`<p style="color:var(--text-muted);font-size:13px">Remove cross-layer link to <strong>${esc(other.name)}</strong>?</p>`,
        confirmText:'Remove',confirmDanger:true,
        onConfirm:()=>{ deleteCrossEdge(edge.id); renderConnections(getNode(_nodeId)); }
      });
    });
    list.appendChild(item);
  });

  if (!list.children.length) {
    list.innerHTML = '<div class="conn-empty">No connections yet.<br>Right-click a node in 3D to link.</div>';
  }

  // Add cross link button
  const addCross = document.getElementById('addCrossLinkBtn');
  if (addCross) {
    addCross.onclick = () => openCrossLinkModal(_wsId, _nodeId, () => renderConnections(getNode(_nodeId)));
  }
}

function makeConnItem(node, label, isCross, onDelete) {
  const div = document.createElement('div');
  div.className = 'conn-item';
  div.innerHTML = `
    <div class="conn-dot" style="background:${node.color}"></div>
    <div class="conn-info">
      <div class="conn-name">${esc(node.name)}</div>
      <div class="conn-rel">${esc(label)}</div>
    </div>
    ${isCross?'<span class="conn-cross">cross</span>':''}
    <button class="btn-icon danger-icon" title="Remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>`;
  div.querySelector('button').addEventListener('click', e => { e.stopPropagation(); onDelete(); });
  return div;
}

export function destroyNodeWb() {
  if (_canvas) {
    _canvas.removeEventListener('pointerdown', onDown);
    _canvas.removeEventListener('pointermove', onMove);
    _canvas.removeEventListener('pointerup',   onUp);
    _canvas.removeEventListener('pointerleave',onUp);
  }
  window.removeEventListener('resize', resizeCanvas);
  _canvas=null; _ctx=null; _drawing=false;
}

function esc(s=''){return String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));}
