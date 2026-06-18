/* ═══════════════════════════════════════════
   EDGE WHITEBOARD — per-edge canvas
═══════════════════════════════════════════ */
import { getEdge, updateEdge, getNode } from '../core/store.js';
import { openModal } from '../ui/modal.js';

let _edgeId=null, _canvas=null, _ctx=null;
let _drawing=false, _tool='pen', _color='#A78BFA', _size=2;
let _history=[], _redoStack=[];

export function initEdgeWb(edgeId) {
  _edgeId = edgeId;
  const edge = getEdge(edgeId);
  if (!edge) return;

  const fromNode = getNode(edge.fromNodeId);
  const toNode   = getNode(edge.toNodeId);

  // Update panel labels
  document.getElementById('edgeFromLabel').textContent = fromNode?.name || '?';
  document.getElementById('edgeToLabel').textContent   = toNode?.name   || '?';
  document.getElementById('edgeRelLabel').textContent  = edge.label || '—';
  document.getElementById('edgeLabelInput').value = edge.label || '';
  document.getElementById('edgeNotes').value = edge.notes || '';

  document.getElementById('edgeLabelInput').oninput = e => {
    updateEdge(_edgeId, { label: e.target.value });
    document.getElementById('edgeRelLabel').textContent = e.target.value || '—';
  };
  document.getElementById('edgeNotes').oninput = e => updateEdge(_edgeId, { notes: e.target.value });

  // Canvas
  _canvas = document.getElementById('edgeCanvas');
  _ctx    = _canvas.getContext('2d');
  resizeCanvas();
  if (edge.canvasData) {
    const img = new Image();
    img.onload = () => _ctx.drawImage(img,0,0);
    img.src = edge.canvasData;
  } else {
    clearCanvas();
  }

  _canvas.addEventListener('pointerdown', onDown);
  _canvas.addEventListener('pointermove', onMove);
  _canvas.addEventListener('pointerup',   onUp);
  _canvas.addEventListener('pointerleave',onUp);
  window.addEventListener('resize', resizeCanvas);
  setupToolbar();
}

function resizeCanvas() {
  if (!_canvas) return;
  const wrap = _canvas.parentElement;
  const data = _canvas.toDataURL();
  _canvas.width  = wrap.clientWidth;
  _canvas.height = wrap.clientHeight;
  if (_history.length) {
    const img = new Image(); img.onload=()=>_ctx.drawImage(img,0,0); img.src=data;
  } else { clearCanvas(); }
}
function clearCanvas() {
  if (!_ctx||!_canvas) return;
  _ctx.fillStyle='#0A0B0E';
  _ctx.fillRect(0,0,_canvas.width,_canvas.height);
}
function setupToolbar() {
  document.querySelectorAll('#edgeWbToolbar .tool-btn[data-tool]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#edgeWbToolbar .tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      _tool=btn.dataset.tool;
    });
  });
  document.querySelectorAll('#edgeWbToolbar .stroke-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#edgeWbToolbar .stroke-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      _size=+btn.dataset.size;
    });
  });
  document.getElementById('edgeColorPicker')?.addEventListener('input',e=>{_color=e.target.value;});
  document.getElementById('edgeUndoBtn')?.addEventListener('click',undo);
  document.getElementById('edgeRedoBtn')?.addEventListener('click',redo);
  document.getElementById('edgeClearBtn')?.addEventListener('click',()=>{
    openModal({
      title:'Clear Canvas',body:'<p style="color:var(--text-muted);font-size:13px">Clear all drawing?</p>',
      confirmText:'Clear',confirmDanger:true,onConfirm:()=>{clearCanvas();saveCanvas();}
    });
  });
}
function onDown(e){_drawing=true;saveSnapshot();_ctx.beginPath();_ctx.moveTo(e.offsetX,e.offsetY);}
function onMove(e){
  if(!_drawing) return;
  _ctx.lineWidth=_tool==='eraser'?_size*6:_size;
  _ctx.lineCap='round';_ctx.lineJoin='round';
  _ctx.strokeStyle=_tool==='eraser'?'#0A0B0E':_color;
  _ctx.lineTo(e.offsetX,e.offsetY);_ctx.stroke();
}
function onUp(){_drawing=false;saveCanvas();}
function saveSnapshot(){_history.push(_canvas.toDataURL());if(_history.length>40)_history.shift();_redoStack=[];}
function undo(){if(!_history.length)return;_redoStack.push(_canvas.toDataURL());const p=_history.pop();const img=new Image();img.onload=()=>{clearCanvas();_ctx.drawImage(img,0,0);};img.src=p;}
function redo(){if(!_redoStack.length)return;_history.push(_canvas.toDataURL());const n=_redoStack.pop();const img=new Image();img.onload=()=>{clearCanvas();_ctx.drawImage(img,0,0);};img.src=n;}
function saveCanvas(){updateEdge(_edgeId,{canvasData:_canvas.toDataURL('image/jpeg',0.7)});}

export function destroyEdgeWb(){
  if(_canvas){
    _canvas.removeEventListener('pointerdown',onDown);
    _canvas.removeEventListener('pointermove',onMove);
    _canvas.removeEventListener('pointerup',onUp);
    _canvas.removeEventListener('pointerleave',onUp);
  }
  window.removeEventListener('resize',resizeCanvas);
  _canvas=null;_ctx=null;
}
