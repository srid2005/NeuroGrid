// edge-wb.js — Konva whiteboard for a concept link (edge)
import Store from '../core/store.js';
import Router from '../core/router.js';

const K = () => window.Konva;

let stage, bgLayer, mainLayer, uiLayer, transformer;
let currentTool  = 'select';
let currentColor = '#F59E0B';
let currentWidth = 2;
let isPainting   = false;
let activeShape  = null;

let undoStack = [];
let redoStack = [];
let _edgeId   = null;
let saveTimer  = null;

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
export function initEdgeWb(edgeId) {
  _edgeId = edgeId;
  const wrap = document.getElementById('edgeCanvasWrap');

  if (stage) { stage.destroy(); stage = null; }

  const W = wrap.clientWidth  || 800;
  const H = wrap.clientHeight || 600;

  stage = new (K().Stage)({ container: 'edgeCanvas', width: W, height: H });
  bgLayer   = new (K().Layer)();
  mainLayer = new (K().Layer)();
  uiLayer   = new (K().Layer)();
  stage.add(bgLayer, mainLayer, uiLayer);

  drawDotGrid(bgLayer, W, H);

  transformer = new (K().Transformer)({
    borderStroke: '#F59E0B',
    anchorStroke: '#F59E0B',
    anchorFill:   '#18181B',
    anchorSize:   7,
  });
  uiLayer.add(transformer);

  // Load persisted data or place initial sticky notes
  const edge = Store.getEdge(edgeId);
  if (edge?.whiteboardData) {
    restoreState(edge.whiteboardData);
  } else {
    placeInitialCards(edge, W, H);
  }

  pushUndo();
  bindEdgeEvents();
  populateEdgeSidebar(edgeId);
  window.addEventListener('resize', () => onEdgeResize(wrap));
}

/* ── Dot grid ───────────────────────────── */
function drawDotGrid(layer, W, H) {
  layer.destroyChildren();
  layer.add(new (K().Rect)({ x:0, y:0, width:W, height:H, fill:'#09090B', listening:false }));
  const gap = 24, dotColor = '#27272A';
  for (let x = gap; x < W; x += gap)
    for (let y = gap; y < H; y += gap)
      layer.add(new (K().Circle)({ x, y, radius: 0.8, fill: dotColor, listening: false }));
  layer.batchDraw();
}

/* ── Initial sticky notes for the two concepts ── */
function placeInitialCards(edge, W, H) {
  if (!edge) return;
  const fromNode = Store.getNode(edge.fromId);
  const toNode   = Store.getNode(edge.toId);
  const fromSubj = Store.getSubject(fromNode?.subjectId);
  const toSubj   = Store.getSubject(toNode?.subjectId);

  const cards = [
    { node: fromNode, subj: fromSubj, x: W * 0.15, y: H * 0.25 },
    { node: toNode,   subj: toSubj,   x: W * 0.55, y: H * 0.25 },
  ];

  cards.forEach(({ node, subj, x, y }) => {
    if (!node) return;
    const color = subj?.color || '#8B5CF6';
    const bg    = color + '18';
    const bdr   = color + '55';

    const rect = new (K().Rect)({
      x, y, width: 180, height: 120,
      fill: bg, stroke: bdr, strokeWidth: 1.5,
      cornerRadius: 10, draggable: true, shadowBlur: 12,
      shadowColor: color, shadowOpacity: 0.15,
    });

    const badge = new (K().Text)({
      x: x + 10, y: y + 10,
      text: subj?.label || '?',
      fontSize: 9, fill: color,
      fontStyle: 'bold', fontFamily: 'Inter, system-ui, sans-serif',
      letterSpacing: 1,
    });

    const title = new (K().Text)({
      x: x + 10, y: y + 26,
      text: node.label,
      fontSize: 13, fill: '#FAFAFA',
      fontStyle: 'bold', fontFamily: 'Inter, system-ui, sans-serif',
      width: 160,
    });

    const notes = new (K().Text)({
      x: x + 10, y: y + 50,
      text: node.notes || 'No notes yet.',
      fontSize: 11, fill: '#A1A1AA',
      fontFamily: 'Inter, system-ui, sans-serif',
      width: 160, lineHeight: 1.5,
    });

    mainLayer.add(rect, badge, title, notes);
  });

  // Arrow between cards
  const cx = W / 2;
  const arrow = new (K().Arrow)({
    points: [W * 0.36, H * 0.37, cx - 20, H * 0.37],
    pointerLength: 8, pointerWidth: 6,
    fill: '#F59E0B', stroke: '#F59E0B', strokeWidth: 1.5,
    draggable: true,
  });

  const relText = new (K().Text)({
    x: cx - 60, y: H * 0.37 - 18,
    text: edge.relationship || 'relates to',
    fontSize: 10, fill: '#F59E0B',
    fontStyle: 'bold', fontFamily: 'Inter, system-ui, sans-serif',
    draggable: true,
  });

  mainLayer.add(arrow, relText);
  mainLayer.batchDraw();
}

/* ════════════════════════════════════════════
   EVENTS
════════════════════════════════════════════ */
function bindEdgeEvents() {
  stage.on('wheel', e => {
    e.evt.preventDefault();
    const by = 1.08, ptr = stage.getPointerPosition(), old = stage.scaleX();
    const nw = Math.max(0.15, Math.min(4, e.evt.deltaY < 0 ? old * by : old / by));
    stage.scale({ x: nw, y: nw });
    stage.position({ x: ptr.x - (ptr.x - stage.x()) * (nw/old), y: ptr.y - (ptr.y - stage.y()) * (nw/old) });
    stage.batchDraw();
  });

  stage.on('mousedown touchstart', e => {
    const pos = getScaledPos();
    if (!pos) return;
    if (currentTool === 'pen')  startEdgePen(pos);
    if (currentTool === 'rect') startEdgeRect(pos);
    if (currentTool === 'text') addEdgeText(pos);
    if (currentTool === 'select' && e.target === stage) { transformer.nodes([]); uiLayer.batchDraw(); }
  });

  stage.on('mousemove touchmove', e => {
    if (!isPainting) return;
    e.evt.preventDefault();
    const pos = getScaledPos();
    if (currentTool === 'pen' && activeShape) {
      activeShape.points(activeShape.points().concat([pos.x, pos.y]));
      mainLayer.batchDraw();
    }
  });

  stage.on('mouseup touchend', () => {
    if (isPainting) { isPainting = false; activeShape = null; pushUndo(); scheduleSave(); }
  });

  stage.on('click tap', e => {
    if (currentTool !== 'select' || e.target === stage) return;
    transformer.nodes([e.target]);
    uiLayer.batchDraw();
  });
}

function getScaledPos() {
  const pos = stage.getPointerPosition();
  if (!pos) return null;
  const s = stage.scaleX();
  return { x: (pos.x - stage.x()) / s, y: (pos.y - stage.y()) / s };
}

function startEdgePen(pos) {
  isPainting  = true;
  activeShape = new (K().Line)({
    points: [pos.x, pos.y],
    stroke: currentColor, strokeWidth: currentWidth,
    tension: 0.4, lineCap: 'round', lineJoin: 'round',
    draggable: true,
  });
  mainLayer.add(activeShape);
}

function startEdgeRect(pos) {
  isPainting  = true;
  activeShape = new (K().Rect)({
    x: pos.x, y: pos.y, width: 0, height: 0,
    stroke: currentColor, strokeWidth: currentWidth,
    cornerRadius: 4, draggable: true,
  });
  mainLayer.add(activeShape);
}

function addEdgeText(pos) {
  const text = new (K().Text)({
    x: pos.x, y: pos.y,
    text: 'Note',
    fontSize: 13, fill: currentColor,
    fontFamily: 'Inter, system-ui, sans-serif',
    draggable: true,
  });
  mainLayer.add(text);
  mainLayer.batchDraw();
  pushUndo(); scheduleSave();
}

/* ════════════════════════════════════════════
   UNDO / REDO
════════════════════════════════════════════ */
function getState() {
  return mainLayer.getChildren().map(n => ({ cls: n.getClassName(), attrs: n.getAttrs() }));
}

function applyState(state) {
  mainLayer.destroyChildren();
  state.forEach(({ cls, attrs }) => {
    const Shape = K()[cls];
    if (Shape) mainLayer.add(new Shape({ ...attrs, draggable: true }));
  });
  transformer.nodes([]);
  mainLayer.batchDraw(); uiLayer.batchDraw();
}

function pushUndo() {
  undoStack.push(getState());
  redoStack = [];
  if (undoStack.length > 60) undoStack.shift();
}

export function undoEdgeWb() {
  if (undoStack.length <= 1) return;
  redoStack.push(undoStack.pop());
  applyState(undoStack[undoStack.length - 1]);
  scheduleSave();
}

export function redoEdgeWb() {
  if (!redoStack.length) return;
  undoStack.push(redoStack.pop());
  applyState(undoStack[undoStack.length - 1]);
  scheduleSave();
}

/* ════════════════════════════════════════════
   SAVE / RESTORE
════════════════════════════════════════════ */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!_edgeId) return;
    Store.updateEdge(_edgeId, { whiteboardData: getState() });
  }, 800);
}

function restoreState(data) { applyState(data); }

/* ════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════ */
function populateEdgeSidebar(edgeId) {
  const edge     = Store.getEdge(edgeId);
  const fromNode = Store.getNode(edge?.fromId);
  const toNode   = Store.getNode(edge?.toId);
  const fromSubj = Store.getSubject(fromNode?.subjectId);
  const toSubj   = Store.getSubject(toNode?.subjectId);

  const stylePill = (el, node, subj) => {
    el.textContent = `${node?.label || '?'}`;
    el.style.borderLeft = `3px solid ${subj?.color || '#8B5CF6'}`;
    el.style.color = subj?.color || '#8B5CF6';
  };

  stylePill(document.getElementById('edgeFromPill'), fromNode, fromSubj);
  stylePill(document.getElementById('edgeToPill'),   toNode,   toSubj);

  const relBadge = document.getElementById('edgeRelBadge');
  relBadge.innerHTML = `<span class="rel-badge">${edge?.relationship || 'relates to'}</span>`;

  document.getElementById('edgeFromNotes').textContent = fromNode?.notes || 'No notes.';
  document.getElementById('edgeToNotes').textContent   = toNode?.notes   || 'No notes.';

  const notesEl = document.getElementById('edgeNotesInput');
  notesEl.value = edge?.notes || '';
  notesEl.oninput = () => Store.updateEdge(edgeId, { notes: notesEl.value });
}

/* ════════════════════════════════════════════
   PUBLIC SETTERS
════════════════════════════════════════════ */
export function setEdgeTool(tool)  { currentTool = tool; }
export function setEdgeColor(c)    { currentColor = c; }
export function setEdgeWidth(w)    { currentWidth = w; }

function onEdgeResize(wrap) {
  if (!stage) return;
  stage.width(wrap.clientWidth);
  stage.height(wrap.clientHeight);
  drawDotGrid(bgLayer, wrap.clientWidth, wrap.clientHeight);
}

export function destroyEdgeWb() {
  if (stage) { stage.destroy(); stage = null; }
  undoStack = []; redoStack = [];
}
