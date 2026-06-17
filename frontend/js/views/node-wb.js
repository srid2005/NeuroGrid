// node-wb.js v2 — Fixed Konva timing, light theme, all tools working
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';

const K = () => window.Konva;
let stage, bgLayer, mainLayer, uiLayer, transformer;
let currentTool='select', currentColor='#7C3AED', currentWidth=2;
let isPainting=false, activeShape=null, rectStart=null;
let undoStack=[], redoStack=[], _nodeId=null, saveTimer=null;

export function initNodeWb(nodeId) {
  _nodeId = nodeId;
  // Double rAF ensures DOM has fully laid out before measuring
  requestAnimationFrame(() => requestAnimationFrame(() => _setup(nodeId)));
}

function _setup(nodeId) {
  const wrap = document.getElementById('nodeCanvasWrap');
  if (!wrap) return;
  if (stage) { stage.destroy(); stage = null; }

  const W = wrap.clientWidth  || window.innerWidth  - 268;
  const H = wrap.clientHeight || window.innerHeight - 52 - 48;

  stage = new (K().Stage)({ container: 'nodeCanvas', width: W, height: H });
  bgLayer   = new (K().Layer)();
  mainLayer = new (K().Layer)();
  uiLayer   = new (K().Layer)();
  stage.add(bgLayer, mainLayer, uiLayer);

  drawGrid(W, H);

  transformer = new (K().Transformer)({
    borderStroke: '#7C3AED', anchorStroke: '#7C3AED',
    anchorFill: '#fff', anchorSize: 8,
    rotationSnaps: [0,45,90,135,180,225,270,315],
  });
  uiLayer.add(transformer);

  const node = Store.getNode(nodeId);
  if (node?.whiteboardData?.length) restoreState(node.whiteboardData);
  undoStack = [getState()]; redoStack = [];

  bindEvents();
  populateSidebar(nodeId);
  window.addEventListener('resize', () => onResize(wrap));
}

/* ── Grid ─────────────────────── */
function drawGrid(W, H) {
  bgLayer.destroyChildren();
  bgLayer.add(new (K().Rect)({ x:0, y:0, width:W, height:H, fill:'#F7F7F8', listening:false }));
  const gap=28, c='#E0E0E4';
  for (let x=gap; x<W; x+=gap)
    for (let y=gap; y<H; y+=gap)
      bgLayer.add(new (K().Circle)({ x, y, radius:1, fill:c, listening:false }));
  bgLayer.batchDraw();
}

/* ── Events ────────────────────── */
function bindEvents() {
  // Zoom
  stage.on('wheel', e => {
    e.evt.preventDefault();
    const by=1.08, ptr=stage.getPointerPosition(), old=stage.scaleX();
    const nw=Math.max(0.1, Math.min(5, e.evt.deltaY<0 ? old*by : old/by));
    stage.scale({x:nw,y:nw});
    stage.position({ x:ptr.x-(ptr.x-stage.x())*(nw/old), y:ptr.y-(ptr.y-stage.y())*(nw/old) });
    stage.batchDraw();
  });

  stage.on('mousedown touchstart', e => {
    const pos = scaledPos(); if (!pos) return;
    if (currentTool==='pen')    { startPen(pos); }
    if (currentTool==='rect')   { startRect(pos); }
    if (currentTool==='circle') { startCircle(pos); }
    if (currentTool==='text')   { addText(pos); }
    if (currentTool==='eraser') { eraseTarget(e); }
    if (currentTool==='select' && e.target===stage) { transformer.nodes([]); uiLayer.batchDraw(); }
  });

  stage.on('mousemove touchmove', e => {
    if (!isPainting) return;
    e.evt.preventDefault();
    const pos = scaledPos(); if (!pos) return;
    if (currentTool==='pen')    continuePen(pos);
    if (currentTool==='rect')   continueRect(pos);
    if (currentTool==='circle') continueCircle(pos);
  });

  stage.on('mouseup touchend', () => {
    if (isPainting) { isPainting=false; activeShape=null; rectStart=null; pushUndo(); scheduleSave(); }
  });

  stage.on('click tap', e => {
    if (currentTool!=='select' || e.target===stage) return;
    transformer.nodes([e.target]); uiLayer.batchDraw();
  });

  window.addEventListener('keydown', onKey);
}

function scaledPos() {
  const p=stage.getPointerPosition(); if (!p) return null;
  const s=stage.scaleX();
  return { x:(p.x-stage.x())/s, y:(p.y-stage.y())/s };
}

/* ── Tools ─────────────────────── */
function startPen(pos) {
  isPainting=true;
  activeShape = new (K().Line)({
    points:[pos.x,pos.y], stroke:currentColor, strokeWidth:currentWidth,
    tension:0.4, lineCap:'round', lineJoin:'round', draggable:true,
  });
  mainLayer.add(activeShape);
}
function continuePen(pos) { activeShape.points(activeShape.points().concat([pos.x,pos.y])); mainLayer.batchDraw(); }

function startRect(pos) {
  isPainting=true; rectStart={...pos};
  activeShape = new (K().Rect)({
    x:pos.x, y:pos.y, width:0, height:0,
    stroke:currentColor, strokeWidth:currentWidth,
    fill:currentColor+'18', cornerRadius:4, draggable:true,
  });
  mainLayer.add(activeShape);
}
function continueRect(pos) { activeShape.width(pos.x-rectStart.x); activeShape.height(pos.y-rectStart.y); mainLayer.batchDraw(); }

function startCircle(pos) {
  isPainting=true; rectStart={...pos};
  activeShape = new (K().Ellipse)({
    x:pos.x, y:pos.y, radiusX:0, radiusY:0,
    stroke:currentColor, strokeWidth:currentWidth, fill:currentColor+'18', draggable:true,
  });
  mainLayer.add(activeShape);
}
function continueCircle(pos) {
  activeShape.radiusX(Math.abs(pos.x-rectStart.x));
  activeShape.radiusY(Math.abs(pos.y-rectStart.y));
  mainLayer.batchDraw();
}

function addText(pos) {
  const text = new (K().Text)({
    x:pos.x, y:pos.y, text:'Double-click to edit',
    fontSize:14, fill:currentColor,
    fontFamily:'Inter, system-ui, sans-serif', draggable:true,
  });
  mainLayer.add(text); mainLayer.batchDraw();
  pushUndo(); scheduleSave();

  text.on('dblclick dbltap', () => {
    text.hide(); mainLayer.batchDraw();
    const cRect=stage.container().getBoundingClientRect();
    const ap=text.absolutePosition();
    const sc=stage.scaleX();
    const ta=document.createElement('textarea');
    Object.assign(ta.style, {
      position:'fixed', left:(cRect.left+ap.x)+'px', top:(cRect.top+ap.y)+'px',
      minWidth:'120px', fontSize:(14*sc)+'px', border:'1px solid #7C3AED',
      borderRadius:'4px', padding:'2px 6px', background:'#fff',
      color:currentColor, fontFamily:'Inter,system-ui,sans-serif',
      outline:'none', zIndex:'999', boxShadow:'0 2px 8px rgba(0,0,0,0.12)',
    });
    ta.value=text.text(); document.body.appendChild(ta); ta.focus(); ta.select();
    const done=()=>{ text.text(ta.value||' '); text.show(); ta.remove(); mainLayer.batchDraw(); pushUndo(); scheduleSave(); };
    ta.addEventListener('keydown', e=>{ if(e.key==='Escape') done(); });
    ta.addEventListener('blur', done);
  });
  text.on('click tap', () => { if(currentTool==='select'){ transformer.nodes([text]); uiLayer.batchDraw(); } });
}

function eraseTarget(e) {
  if (e.target!==stage) { e.target.destroy(); mainLayer.batchDraw(); pushUndo(); scheduleSave(); }
}

/* ── Undo / Redo ──────────────── */
function getState() {
  return mainLayer.getChildren().map(n => ({ cls:n.getClassName(), attrs:n.getAttrs() }));
}
function applyState(state) {
  mainLayer.destroyChildren();
  state.forEach(({cls,attrs}) => {
    const S=K()[cls]; if(!S) return;
    const shape=new S({...attrs,draggable:true});
    mainLayer.add(shape);
    if (cls==='Text') {
      shape.on('dblclick dbltap', () => addText(shape.position()));
      shape.on('click tap', () => { if(currentTool==='select'){ transformer.nodes([shape]); uiLayer.batchDraw(); } });
    }
  });
  transformer.nodes([]); mainLayer.batchDraw(); uiLayer.batchDraw();
}
function pushUndo() { undoStack.push(getState()); redoStack=[]; if(undoStack.length>80) undoStack.shift(); }

export function undoNodeWb() { if(undoStack.length<=1) return; redoStack.push(undoStack.pop()); applyState(undoStack[undoStack.length-1]); scheduleSave(); }
export function redoNodeWb() { if(!redoStack.length) return; const s=redoStack.pop(); undoStack.push(s); applyState(s); scheduleSave(); }
export function clearNodeWb() { pushUndo(); mainLayer.destroyChildren(); mainLayer.batchDraw(); scheduleSave(); }

/* ── Save / Restore ───────────── */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ if(_nodeId) Store.updateNode(_nodeId,{whiteboardData:getState()}); }, 600);
}
function restoreState(data) { applyState(data); }

/* ── Sidebar ──────────────────── */
function populateSidebar(nodeId) {
  const node=Store.getNode(nodeId), subj=Store.getSubject(node?.subjectId);
  if (!node) return;
  const badge=document.getElementById('nodeSubjectBadge');
  badge.textContent=subj?.label||'?';
  badge.style.cssText=`background:${subj?.color||'#7C3AED'}15;color:${subj?.color||'#7C3AED'};border:1px solid ${subj?.color||'#7C3AED'}40;`;
  document.getElementById('nodeTitle').textContent=node.label;
  document.getElementById('nodeUnit').textContent=node.unitId?`Unit: ${Store.getUnit(node.unitId)?.name||''}` : '';
  const notesEl=document.getElementById('nodeNotesInput');
  notesEl.value=node.notes||'';
  notesEl.oninput=()=>Store.updateNode(nodeId,{notes:notesEl.value});
  renderConnList(nodeId);
}

function renderConnList(nodeId) {
  const list=document.getElementById('nodeConnList');
  const edges=Store.getNodeEdges(nodeId);
  list.innerHTML='';
  if (!edges.length) { list.innerHTML='<div class="conn-empty">No connections yet.<br>Use Link Mode in the cube view.</div>'; return; }
  edges.forEach(edge=>{
    const otherId=edge.fromId===nodeId?edge.toId:edge.fromId;
    const on=Store.getNode(otherId), os=Store.getSubject(on?.subjectId);
    if (!on) return;
    const item=document.createElement('div'); item.className='conn-item';
    item.innerHTML=`<div class="conn-dot" style="background:${os?.color||'#7C3AED'}"></div>
      <div class="conn-info"><div class="conn-name">${on.label}</div><div class="conn-rel">${edge.relationship}</div></div>
      ${edge.isCross?`<span class="conn-cross">${os?.label}</span>`:''}`;
    item.addEventListener('click',()=>Router.goEdgeWb(edge.id));
    list.appendChild(item);
  });
}

/* ── Public setters ───────────── */
export function setNodeTool(t)  { currentTool=t; if(t!=='select') transformer.nodes([]); uiLayer?.batchDraw(); }
export function setNodeColor(c) { currentColor=c; }
export function setNodeWidth(w) { currentWidth=w; }

function onKey(e) {
  if (Router.current!=='nodeWb') return;
  if (document.activeElement?.tagName==='TEXTAREA'||document.activeElement?.tagName==='INPUT') return;
  if ((e.ctrlKey||e.metaKey)&&e.key==='z') { e.preventDefault(); undoNodeWb(); }
  if ((e.ctrlKey||e.metaKey)&&(e.key==='y'||e.key==='Y')) { e.preventDefault(); redoNodeWb(); }
  if ((e.key==='Delete'||e.key==='Backspace')&&transformer) {
    transformer.nodes().forEach(n=>n.destroy()); transformer.nodes([]);
    mainLayer.batchDraw(); pushUndo(); scheduleSave();
  }
}

function onResize(wrap) {
  if (!stage) return;
  const W=wrap.clientWidth, H=wrap.clientHeight;
  stage.width(W); stage.height(H); drawGrid(W,H);
}

export function destroyNodeWb() {
  window.removeEventListener('keydown', onKey);
  if (stage) { stage.destroy(); stage=null; }
  undoStack=[]; redoStack=[];
}
