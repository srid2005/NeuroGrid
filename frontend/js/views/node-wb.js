// node-wb.js — Konva whiteboard for a concept node
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';

const K = () => window.Konva;

let stage, bgLayer, mainLayer, uiLayer, transformer;
let currentTool  = 'select';
let currentColor = '#8B5CF6';
let currentWidth = 2;
let isPainting   = false;
let activeShape  = null;
let rectStart    = null;

// Undo/redo stacks (array of serialised states)
let undoStack = [];
let redoStack = [];

let _nodeId = null;
let saveTimer = null;

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
export function initNodeWb(nodeId) {
  _nodeId = nodeId;
  const wrap = document.getElementById('nodeCanvasWrap');

  // Destroy previous instance
  if (stage) { stage.destroy(); stage = null; }

  const W = wrap.clientWidth  || 800;
  const H = wrap.clientHeight || 600;

  stage = new (K().Stage)({ container: 'nodeCanvas', width: W, height: H });

  bgLayer   = new (K().Layer)();
  mainLayer = new (K().Layer)();
  uiLayer   = new (K().Layer)();

  stage.add(bgLayer, mainLayer, uiLayer);

  drawDotGrid(bgLayer, W, H);

  transformer = new (K().Transformer)({
    borderStroke: '#8B5CF6',
    anchorStroke: '#8B5CF6',
    anchorFill:   '#18181B',
    anchorSize:   7,
    rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
  });
  uiLayer.add(transformer);

  // Load persisted whiteboard data
  const node = Store.getNode(nodeId);
  if (node?.whiteboardData) restoreState(node.whiteboardData);

  pushUndo(); // baseline state

  bindEvents();
  populateSidebar(nodeId);

  window.addEventListener('resize', () => onWbResize(wrap));
}

/* ── Dot grid background ────────────────── */
function drawDotGrid(layer, W, H) {
  layer.destroyChildren();
  layer.add(new (K().Rect)({
    x: 0, y: 0, width: W, height: H,
    fill: '#09090B', listening: false,
  }));
  const gap = 24, dotR = 0.8, dotColor = '#27272A';
  for (let x = gap; x < W; x += gap) {
    for (let y = gap; y < H; y += gap) {
      layer.add(new (K().Circle)({
        x, y, radius: dotR, fill: dotColor, listening: false,
      }));
    }
  }
  layer.batchDraw();
}

/* ════════════════════════════════════════════
   TOOL EVENTS
════════════════════════════════════════════ */
function bindEvents() {
  // ── Zoom (scroll wheel) ──────────────────
  stage.on('wheel', e => {
    e.evt.preventDefault();
    const by = 1.08;
    const ptr = stage.getPointerPosition();
    const old = stage.scaleX();
    const nw  = e.evt.deltaY < 0 ? old * by : old / by;
    const clamped = Math.max(0.15, Math.min(4, nw));
    stage.scale({ x: clamped, y: clamped });
    stage.position({
      x: ptr.x - (ptr.x - stage.x()) * (clamped / old),
      y: ptr.y - (ptr.y - stage.y()) * (clamped / old),
    });
    stage.batchDraw();
  });

  // ── Pointer down ─────────────────────────
  stage.on('mousedown touchstart', e => {
    const pos = getScaledPos();
    if (!pos) return;

    if (currentTool === 'pen') startPen(pos);
    if (currentTool === 'rect') startRect(pos);
    if (currentTool === 'eraser') startErase(e);
    if (currentTool === 'text')  addText(pos);

    if (currentTool === 'select') {
      if (e.target === stage) { transformer.nodes([]); uiLayer.batchDraw(); }
    }
  });

  // ── Pointer move ─────────────────────────
  stage.on('mousemove touchmove', e => {
    if (!isPainting) return;
    e.evt.preventDefault();
    const pos = getScaledPos();
    if (!pos) return;
    if (currentTool === 'pen')    continuePen(pos);
    if (currentTool === 'rect')   continueRect(pos);
  });

  // ── Pointer up ───────────────────────────
  stage.on('mouseup touchend', () => {
    if (isPainting) { isPainting = false; activeShape = null; rectStart = null; pushUndo(); scheduleSave(); }
  });

  // ── Click on shape (select) ───────────────
  stage.on('click tap', e => {
    if (currentTool !== 'select') return;
    if (e.target === stage) return;
    transformer.nodes([e.target]);
    uiLayer.batchDraw();
  });

  // ── Delete key ────────────────────────────
  window.addEventListener('keydown', onKeyDown);
}

function getScaledPos() {
  const pos = stage.getPointerPosition();
  if (!pos) return null;
  const s = stage.scaleX();
  return { x: (pos.x - stage.x()) / s, y: (pos.y - stage.y()) / s };
}

/* ── Pen tool ───────────────────────────── */
function startPen(pos) {
  isPainting = true;
  activeShape = new (K().Line)({
    points: [pos.x, pos.y],
    stroke: currentColor,
    strokeWidth: currentWidth,
    tension: 0.4,
    lineCap: 'round',
    lineJoin: 'round',
    globalCompositeOperation: 'source-over',
    draggable: true,
  });
  mainLayer.add(activeShape);
}

function continuePen(pos) {
  activeShape.points(activeShape.points().concat([pos.x, pos.y]));
  mainLayer.batchDraw();
}

/* ── Rect tool ──────────────────────────── */
function startRect(pos) {
  isPainting = true;
  rectStart  = { ...pos };
  activeShape = new (K().Rect)({
    x: pos.x, y: pos.y, width: 0, height: 0,
    stroke: currentColor, strokeWidth: currentWidth,
    fill: currentColor.replace(/ff$/i, '22') || 'transparent',
    cornerRadius: 4,
    draggable: true,
  });
  mainLayer.add(activeShape);
}

function continueRect(pos) {
  activeShape.width(pos.x  - rectStart.x);
  activeShape.height(pos.y - rectStart.y);
  mainLayer.batchDraw();
}

/* ── Text tool ──────────────────────────── */
function addText(pos) {
  const text = new (K().Text)({
    x: pos.x, y: pos.y,
    text: 'Double-click to edit',
    fontSize: 14,
    fill: currentColor,
    fontFamily: 'Inter, system-ui, sans-serif',
    draggable: true,
  });
  mainLayer.add(text);
  mainLayer.batchDraw();
  pushUndo();
  scheduleSave();

  // Inline editing on dblclick
  text.on('dblclick dbltap', () => {
    text.hide();
    const pos2 = stage.container().getBoundingClientRect();
    const apos = text.absolutePosition();
    const ta   = document.createElement('textarea');
    Object.assign(ta.style, {
      position:   'fixed',
      left:       (pos2.left + apos.x * stage.scaleX()) + 'px',
      top:        (pos2.top  + apos.y * stage.scaleY()) + 'px',
      minWidth:   '120px',
      minHeight:  '28px',
      fontSize:   (14 * stage.scaleX()) + 'px',
      border:     '1px solid #8B5CF6',
      borderRadius: '4px',
      padding:    '2px 4px',
      background: '#18181B',
      color:      currentColor,
      fontFamily: 'Inter, system-ui, sans-serif',
      outline:    'none',
      zIndex:     '999',
    });
    ta.value = text.text();
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const finish = () => {
      text.text(ta.value || ' ');
      text.show();
      ta.remove();
      mainLayer.batchDraw();
      pushUndo(); scheduleSave();
    };
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') finish(); });
    ta.addEventListener('blur', finish);
  });

  // Select on click
  text.on('click tap', () => {
    if (currentTool !== 'select') return;
    transformer.nodes([text]);
    uiLayer.batchDraw();
  });
}

/* ── Eraser ─────────────────────────────── */
function startErase(e) {
  if (e.target !== stage) {
    e.target.destroy();
    mainLayer.batchDraw();
    pushUndo(); scheduleSave();
  }
}

/* ════════════════════════════════════════════
   UNDO / REDO
════════════════════════════════════════════ */
function getState() {
  return mainLayer.getChildren().map(n => ({
    cls: n.getClassName(),
    attrs: n.getAttrs(),
  }));
}

function applyState(state) {
  mainLayer.destroyChildren();
  state.forEach(({ cls, attrs }) => {
    const Shape = K()[cls];
    if (!Shape) return;
    const shape = new Shape({ ...attrs, draggable: true });
    mainLayer.add(shape);
    if (cls === 'Text') {
      shape.on('dblclick dbltap', () => addText(shape.position())); // reattach
    }
  });
  transformer.nodes([]);
  mainLayer.batchDraw();
  uiLayer.batchDraw();
}

function pushUndo() {
  undoStack.push(getState());
  redoStack = [];
  if (undoStack.length > 60) undoStack.shift();
}

export function undoNodeWb() {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  applyState(undoStack[undoStack.length - 1]);
  scheduleSave();
}

export function redoNodeWb() {
  if (!redoStack.length) return;
  const state = redoStack.pop();
  undoStack.push(state);
  applyState(state);
  scheduleSave();
}

export function clearNodeWb() {
  pushUndo();
  mainLayer.destroyChildren();
  mainLayer.batchDraw();
  scheduleSave();
}

/* ════════════════════════════════════════════
   SAVE / RESTORE
════════════════════════════════════════════ */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!_nodeId) return;
    Store.updateNode(_nodeId, { whiteboardData: getState() });
  }, 800);
}

function restoreState(data) {
  applyState(data);
}

/* ════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════ */
function populateSidebar(nodeId) {
  const node    = Store.getNode(nodeId);
  const subject = Store.getSubject(node?.subjectId);
  if (!node) return;

  // Info card
  const badge = document.getElementById('nodeSubjectBadge');
  badge.textContent = subject?.label || '?';
  badge.style.background = (subject?.color || '#8B5CF6') + '22';
  badge.style.color       = subject?.color || '#8B5CF6';
  badge.style.border      = `1px solid ${subject?.color || '#8B5CF6'}44`;

  document.getElementById('nodeTitle').textContent = node.label;
  document.getElementById('nodeUnit').textContent  = node.unit ? `Unit: ${node.unit}` : '';

  // Notes
  const notesEl = document.getElementById('nodeNotesInput');
  notesEl.value = node.notes || '';
  notesEl.oninput = () => {
    Store.updateNode(nodeId, { notes: notesEl.value });
  };

  // Connections
  renderConnList(nodeId);
}

function renderConnList(nodeId) {
  const list  = document.getElementById('nodeConnList');
  const edges = Store.getNodeEdges(nodeId);
  list.innerHTML = '';

  if (!edges.length) {
    list.innerHTML = '<div class="conn-empty">No connections yet.<br>Use Link Mode in the cube.</div>';
    return;
  }

  edges.forEach(edge => {
    const otherId   = edge.fromId === nodeId ? edge.toId : edge.fromId;
    const otherNode = Store.getNode(otherId);
    const otherSubj = Store.getSubject(otherNode?.subjectId);
    if (!otherNode) return;

    const item = document.createElement('div');
    item.className = 'conn-item';
    item.innerHTML = `
      <div class="conn-dot" style="background:${otherSubj?.color || '#8B5CF6'}"></div>
      <div class="conn-info">
        <div class="conn-name">${otherNode.label}</div>
        <div class="conn-rel">${edge.relationship}</div>
      </div>
      ${edge.isCross ? `<span class="conn-cross">${otherSubj?.label}</span>` : ''}
    `;
    item.addEventListener('click', () => Router.goEdgeWb(edge.id));
    list.appendChild(item);
  });
}

/* ════════════════════════════════════════════
   PUBLIC SETTERS
════════════════════════════════════════════ */
export function setNodeTool(tool) {
  currentTool = tool;
  if (tool !== 'select') transformer.nodes([]);
  uiLayer.batchDraw();
  stage.draggable(tool === 'pan');
}

export function setNodeColor(color) { currentColor = color; }
export function setNodeWidth(w)     { currentWidth = w; }

/* ════════════════════════════════════════════
   KEYBOARD
════════════════════════════════════════════ */
function onKeyDown(e) {
  if (Router.current !== 'nodeWb') return;
  if (document.activeElement?.tagName === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoNodeWb(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redoNodeWb(); }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    transformer.nodes().forEach(n => n.destroy());
    transformer.nodes([]);
    mainLayer.batchDraw();
    pushUndo(); scheduleSave();
  }
}

/* ════════════════════════════════════════════
   RESIZE
════════════════════════════════════════════ */
function onWbResize(wrap) {
  if (!stage) return;
  stage.width(wrap.clientWidth);
  stage.height(wrap.clientHeight);
  drawDotGrid(bgLayer, wrap.clientWidth, wrap.clientHeight);
}

export function destroyNodeWb() {
  window.removeEventListener('keydown', onKeyDown);
  if (stage) { stage.destroy(); stage = null; }
  undoStack = []; redoStack = [];
}
