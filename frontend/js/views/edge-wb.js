// edge-wb.js v2 — 3-panel: From-node WB | Edge notes | To-node WB
import Store from '../core/store.js';
import Router from '../core/router.js';

const K = () => window.Konva;

// Three Konva stages: left (from), center (edge notes), right (to)
let stageFrom, stageEdge, stageTo;
let mainFrom, mainEdge, mainTo;
let currentTool='select', currentColor='#D97706', currentWidth=2;
let isPainting=false, activeShape=null;
let undoStack=[], redoStack=[], _edgeId=null, saveTimer=null;

export function initEdgeWb(edgeId) {
  _edgeId = edgeId;
  requestAnimationFrame(() => requestAnimationFrame(() => _setup(edgeId)));
}

function _setup(edgeId) {
  const edge     = Store.getEdge(edgeId);
  const fromNode = Store.getNode(edge?.fromId);
  const toNode   = Store.getNode(edge?.toId);
  const fromSubj = Store.getSubject(fromNode?.subjectId);
  const toSubj   = Store.getSubject(toNode?.subjectId);
  if (!edge) return;

  // Destroy previous stages
  [stageFrom, stageEdge, stageTo].forEach(s => s?.destroy());

  // ── Left panel: FROM node whiteboard (read-only) ─────────────────────
  const leftWrap  = document.getElementById('edgeFromCanvas');
  const rightWrap = document.getElementById('edgeToCanvas');
  const midWrap   = document.getElementById('edgeMidCanvas');
  if (!leftWrap || !rightWrap || !midWrap) return;

  const LW=leftWrap.clientWidth||280,  LH=leftWrap.clientHeight||400;
  const RW=rightWrap.clientWidth||280, RH=rightWrap.clientHeight||400;
  const MW=midWrap.clientWidth||360,   MH=midWrap.clientHeight||400;

  stageFrom = buildReadonlyStage('edgeFromCanvas', LW, LH, fromNode?.whiteboardData, fromSubj?.color||'#7C3AED');
  stageTo   = buildReadonlyStage('edgeToCanvas',   RW, RH, toNode?.whiteboardData,   toSubj?.color||'#10B981');

  // ── Center panel: Edge notes (editable) ──────────────────────────────
  stageEdge = new (K().Stage)({ container:'edgeMidCanvas', width:MW, height:MH });
  const bgLayer   = new (K().Layer)();
  mainEdge        = new (K().Layer)();
  const uiLayer   = new (K().Layer)();
  stageEdge.add(bgLayer, mainEdge, uiLayer);
  drawGrid(bgLayer, MW, MH);

  const tr = new (K().Transformer)({ borderStroke:'#D97706', anchorStroke:'#D97706', anchorFill:'#fff', anchorSize:7 });
  uiLayer.add(tr);

  // Restore or place initial connection card
  if (edge.whiteboardData?.length) {
    applyState(edge.whiteboardData, mainEdge);
  } else {
    placeConnCard(edge, fromNode, toNode, fromSubj, toSubj, MW, MH);
  }
  undoStack=[getEdgeState()]; redoStack=[];

  // Edge stage events
  stageEdge.on('wheel', e => {
    e.evt.preventDefault();
    const by=1.08, ptr=stageEdge.getPointerPosition(), old=stageEdge.scaleX();
    const nw=Math.max(0.1,Math.min(5,e.evt.deltaY<0?old*by:old/by));
    stageEdge.scale({x:nw,y:nw});
    stageEdge.position({x:ptr.x-(ptr.x-stageEdge.x())*(nw/old),y:ptr.y-(ptr.y-stageEdge.y())*(nw/old)});
    stageEdge.batchDraw();
  });
  stageEdge.on('mousedown touchstart', e => {
    const pos=edgeScaledPos(); if(!pos) return;
    if(currentTool==='pen')  { isPainting=true; activeShape=new (K().Line)({points:[pos.x,pos.y],stroke:currentColor,strokeWidth:currentWidth,tension:0.4,lineCap:'round',lineJoin:'round',draggable:true}); mainEdge.add(activeShape); }
    if(currentTool==='rect') { isPainting=true; activeShape=new (K().Rect)({x:pos.x,y:pos.y,width:0,height:0,stroke:currentColor,strokeWidth:currentWidth,fill:currentColor+'18',cornerRadius:4,draggable:true}); mainEdge.add(activeShape); }
    if(currentTool==='text') { addEdgeText(pos); }
    if(currentTool==='eraser'&&e.target!==stageEdge) { e.target.destroy(); mainEdge.batchDraw(); pushEdgeUndo(); scheduleSave(); }
    if(currentTool==='select'&&e.target===stageEdge) { tr.nodes([]); uiLayer.batchDraw(); }
  });
  stageEdge.on('mousemove touchmove', e => {
    if(!isPainting||!activeShape) return; e.evt.preventDefault();
    const pos=edgeScaledPos(); if(!pos) return;
    if(currentTool==='pen') { activeShape.points(activeShape.points().concat([pos.x,pos.y])); mainEdge.batchDraw(); }
    if(currentTool==='rect') { activeShape.width(pos.x-activeShape.x()); activeShape.height(pos.y-activeShape.y()); mainEdge.batchDraw(); }
  });
  stageEdge.on('mouseup touchend', () => { if(isPainting){ isPainting=false; activeShape=null; pushEdgeUndo(); scheduleSave(); } });
  stageEdge.on('click tap', e => { if(currentTool==='select'&&e.target!==stageEdge){ tr.nodes([e.target]); uiLayer.batchDraw(); } });

  // Populate sidebar
  populateEdgeSidebar(edge, fromNode, toNode, fromSubj, toSubj);

  window.addEventListener('resize', ()=>onEdgeResize(leftWrap,rightWrap,midWrap));
  window.addEventListener('keydown', onEdgeKey);
}

/* ── Read-only node stage ─────── */
function buildReadonlyStage(containerId, W, H, whiteboardData, color) {
  const s = new (K().Stage)({ container:containerId, width:W, height:H });
  const bg = new (K().Layer)();
  const ml = new (K().Layer)();
  s.add(bg, ml);

  // Light grid background
  bg.add(new (K().Rect)({x:0,y:0,width:W,height:H,fill:'#F7F7F8',listening:false}));
  const gap=24, c='#E0E0E4';
  for(let x=gap;x<W;x+=gap) for(let y=gap;y<H;y+=gap) bg.add(new (K().Circle)({x,y,radius:0.9,fill:c,listening:false}));
  bg.batchDraw();

  if (whiteboardData?.length) {
    whiteboardData.forEach(({cls,attrs})=>{
      const S=K()[cls]; if(!S) return;
      const shape=new S({...attrs,draggable:false,listening:false});
      ml.add(shape);
    });
    ml.batchDraw();
  } else {
    // Placeholder
    ml.add(new (K().Text)({x:W/2-60,y:H/2-20,text:'No drawings yet',fontSize:12,fill:'#A1A1AA',fontFamily:'Inter,system-ui,sans-serif',align:'center',width:120,listening:false}));
    ml.batchDraw();
  }
  return s;
}

/* ── Initial connection card ───── */
function placeConnCard(edge, fromNode, toNode, fromSubj, toSubj, W, H) {
  const relText = new (K().Text)({
    x:W/2-100, y:H/2-14, text:`"${edge.relationship}"`,
    fontSize:14, fill:'#D97706', fontStyle:'bold italic',
    fontFamily:'Inter,system-ui,sans-serif', width:200, align:'center', draggable:true,
  });
  const line = new (K().Line)({
    points:[W*0.2, H/2+10, W*0.8, H/2+10],
    stroke:'#D97706', strokeWidth:1.5, draggable:true,
    dash:[8,4], opacity:0.6,
  });
  const hint = new (K().Text)({
    x:W/2-100, y:H/2+30, text:'Add notes or drawings here',
    fontSize:11, fill:'#A1A1AA', fontFamily:'Inter,system-ui,sans-serif',
    width:200, align:'center', draggable:true,
  });
  mainEdge.add(line, relText, hint); mainEdge.batchDraw();
}

function addEdgeText(pos) {
  const t=new (K().Text)({x:pos.x,y:pos.y,text:'Note',fontSize:13,fill:currentColor,fontFamily:'Inter,system-ui,sans-serif',draggable:true});
  mainEdge.add(t); mainEdge.batchDraw(); pushEdgeUndo(); scheduleSave();
}

/* ── Undo/Redo ─────────────────── */
function getEdgeState() { return mainEdge.getChildren().map(n=>({cls:n.getClassName(),attrs:n.getAttrs()})); }
function applyState(state,layer) {
  layer.destroyChildren();
  state.forEach(({cls,attrs})=>{ const S=K()[cls]; if(S) layer.add(new S({...attrs,draggable:true})); });
  layer.batchDraw();
}
function pushEdgeUndo() { undoStack.push(getEdgeState()); redoStack=[]; if(undoStack.length>60) undoStack.shift(); }

export function undoEdgeWb() { if(undoStack.length<=1) return; redoStack.push(undoStack.pop()); applyState(undoStack[undoStack.length-1], mainEdge); scheduleSave(); }
export function redoEdgeWb() { if(!redoStack.length) return; const s=redoStack.pop(); undoStack.push(s); applyState(s, mainEdge); scheduleSave(); }

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ if(_edgeId&&mainEdge) Store.updateEdge(_edgeId,{whiteboardData:getEdgeState()}); }, 600);
}

/* ── Sidebar ──────────────────── */
function populateEdgeSidebar(edge, fromNode, toNode, fromSubj, toSubj) {
  const fp=document.getElementById('edgeFromPill'), tp=document.getElementById('edgeToPill');
  if(fp){ fp.textContent=fromNode?.label||'?'; fp.style.borderLeft=`3px solid ${fromSubj?.color||'#7C3AED'}`; fp.style.color=fromSubj?.color||'#7C3AED'; }
  if(tp){ tp.textContent=toNode?.label||'?';   tp.style.borderLeft=`3px solid ${toSubj?.color||'#10B981'}`; tp.style.color=toSubj?.color||'#10B981'; }
  const rb=document.getElementById('edgeRelBadge');
  if(rb) rb.innerHTML=`<span class="rel-badge">${edge?.relationship||'relates to'}</span>`;
  const fn=document.getElementById('edgeFromNotes'), tn=document.getElementById('edgeToNotes');
  if(fn) fn.textContent=fromNode?.notes||'No notes.';
  if(tn) tn.textContent=toNode?.notes||'No notes.';
  const ni=document.getElementById('edgeNotesInput');
  if(ni){ ni.value=edge?.notes||''; ni.oninput=()=>Store.updateEdge(_edgeId,{notes:ni.value}); }
}

/* ── Helpers ──────────────────── */
function edgeScaledPos() {
  const p=stageEdge.getPointerPosition(); if(!p) return null;
  const s=stageEdge.scaleX();
  return {x:(p.x-stageEdge.x())/s,y:(p.y-stageEdge.y())/s};
}
function drawGrid(layer,W,H) {
  layer.destroyChildren();
  layer.add(new (K().Rect)({x:0,y:0,width:W,height:H,fill:'#F7F7F8',listening:false}));
  const gap=28,c='#E0E0E4';
  for(let x=gap;x<W;x+=gap) for(let y=gap;y<H;y+=gap) layer.add(new (K().Circle)({x,y,radius:1,fill:c,listening:false}));
  layer.batchDraw();
}

function onEdgeKey(e) {
  if(Router.current!=='edgeWb') return;
  if(document.activeElement?.tagName==='TEXTAREA') return;
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){ e.preventDefault(); undoEdgeWb(); }
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||e.key==='Y')){ e.preventDefault(); redoEdgeWb(); }
}

function onEdgeResize(lw,rw,mw) {
  if(stageFrom) { stageFrom.width(lw.clientWidth); stageFrom.height(lw.clientHeight); }
  if(stageTo)   { stageTo.width(rw.clientWidth);   stageTo.height(rw.clientHeight); }
  if(stageEdge) { stageEdge.width(mw.clientWidth); stageEdge.height(mw.clientHeight); }
}

export function setEdgeTool(t)  { currentTool=t; }
export function setEdgeColor(c) { currentColor=c; }
export function setEdgeWidth(w) { currentWidth=w; }

export function destroyEdgeWb() {
  [stageFrom,stageEdge,stageTo].forEach(s=>s?.destroy());
  stageFrom=stageEdge=stageTo=null; mainEdge=null;
  undoStack=[]; redoStack=[];
  window.removeEventListener('keydown', onEdgeKey);
}
