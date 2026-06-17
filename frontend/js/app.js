// app.js v2 — Main entry point
import Store          from './core/store.js';
import Router         from './core/router.js';
import Events         from './core/events.js';
import { initHome, destroyHome }           from './views/home.js';
import { initGalaxy, destroyGalaxy }       from './views/galaxy.js';
import { initCube, destroyCube, enterLinkMode, exitLinkMode, resetCubeCamera, rebuildCubeScene } from './views/cube.js';
import { initSubcube, destroySubcube }     from './views/subcube.js';
import { initNodeWb, destroyNodeWb, setNodeTool, setNodeColor, setNodeWidth, undoNodeWb, redoNodeWb, clearNodeWb } from './views/node-wb.js';
import { initEdgeWb, destroyEdgeWb, setEdgeTool, setEdgeColor, setEdgeWidth, undoEdgeWb, redoEdgeWb } from './views/edge-wb.js';
import { initModalBindings, openAddSubjectModal, openAddNodeModal, openAddUnitModal, openAddEdgeModal, openConfirmModal, openCrossLinkModal } from './ui/modal.js';

/* ── Auth guard ─────────────────────────── */
if (sessionStorage.getItem('ng_auth') !== '1') window.location.href = 'login.html';

window.__store = Store;
initModalBindings();
document.addEventListener('click', () => { document.getElementById('ctxMenu').style.display='none'; });

/* ════════════════════════════════════════════
   SCREEN TRANSITIONS
════════════════════════════════════════════ */
Events.on('screen:change', ({ to, from }) => {
  if (from==='galaxy')  destroyGalaxy();
  if (from==='cube')    { destroyCube(); exitLinkMode(); updateLinkUI(false); }
  if (from==='subcube') destroySubcube();
  if (from==='nodeWb')  destroyNodeWb();
  if (from==='edgeWb')  destroyEdgeWb();

  const { workspaceId, subjectId, unitId, nodeId, edgeId } = Router.context;

  if (to==='home')    initHome();
  if (to==='galaxy')  { setTimeout(()=>initGalaxy(document.getElementById('galaxy-container'), workspaceId), 0); }
  if (to==='cube')    { const c=document.getElementById('cube-container'); c.innerHTML=''; setTimeout(()=>initCube(c, subjectId), 0); }
  if (to==='subcube') { const c=document.getElementById('subcube-container'); c.innerHTML=''; setTimeout(()=>initSubcube(c, unitId), 0); }
  if (to==='nodeWb')  initNodeWb(nodeId);
  if (to==='edgeWb')  initEdgeWb(edgeId);
});

/* ── Start at home ───────────────────────── */
Router.goHome();

/* ════════════════════════════════════════════
   HOME
════════════════════════════════════════════ */
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.removeItem('ng_auth'); window.location.href='login.html'; });

/* ════════════════════════════════════════════
   GALAXY
════════════════════════════════════════════ */
document.getElementById('btnBackHome').addEventListener('click', () => Router.goHome());
document.getElementById('btnAddSubject').addEventListener('click', () => openAddSubjectModal(Router.context.workspaceId));

/* ════════════════════════════════════════════
   CUBE
════════════════════════════════════════════ */
document.getElementById('btnBackGalaxy').addEventListener('click', () => Router.goGalaxy(Router.context.workspaceId));
document.getElementById('btnResetCube').addEventListener('click', resetCubeCamera);
document.getElementById('btnAddNode').addEventListener('click', () => openAddNodeModal({subjectId:Router.context.subjectId, unitId:null}));
document.getElementById('btnAddUnit').addEventListener('click', () => openAddUnitModal(Router.context.subjectId));

const btnLinkMode = document.getElementById('btnLinkMode');
btnLinkMode.addEventListener('click', () => { enterLinkMode(); updateLinkUI(true); });
document.getElementById('btnCancelLink').addEventListener('click', () => { exitLinkMode(); updateLinkUI(false); });

function updateLinkUI(active) {
  document.getElementById('linkModeBanner').style.display = active?'flex':'none';
  btnLinkMode.classList.toggle('active', active);
}

Events.on('linkmode:exit', () => updateLinkUI(false));
Events.on('linkmode:second', ({ fromId, toId, subjectId }) => {
  updateLinkUI(false);
  openAddEdgeModal({ fromId, toId, subjectId }, () => rebuildCubeScene(subjectId));
});

/* ════════════════════════════════════════════
   SUBCUBE
════════════════════════════════════════════ */
document.getElementById('btnBackCubeFromSub').addEventListener('click', () => Router.goCube(Router.context.subjectId));
document.getElementById('btnResetSubcube').addEventListener('click', () => {});
document.getElementById('btnAddNodeInSub').addEventListener('click', () => openAddNodeModal({subjectId:Router.context.subjectId, unitId:Router.context.unitId}));

/* ════════════════════════════════════════════
   NODE WHITEBOARD TOOLBAR
════════════════════════════════════════════ */
document.getElementById('nodeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('nodeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); setNodeTool(btn.dataset.tool);
  });
});
document.getElementById('nodeColorPicker').addEventListener('input', e => setNodeColor(e.target.value));
document.getElementById('nodeToolbar').querySelectorAll('.stroke-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('nodeToolbar').querySelectorAll('.stroke-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); setNodeWidth(parseInt(btn.dataset.size));
  });
});
document.getElementById('nodeUndo').addEventListener('click', undoNodeWb);
document.getElementById('nodeRedo').addEventListener('click', redoNodeWb);
document.getElementById('nodeClear').addEventListener('click', () => openConfirmModal({
  title:'Clear Canvas', message:'Remove all drawings on this whiteboard?', confirmText:'Clear', onConfirm: clearNodeWb
}));
document.getElementById('btnBackFromNode').addEventListener('click', () => {
  const { subjectId, unitId } = Router.context;
  unitId ? Router.goSubcube(unitId) : Router.goCube(subjectId);
});
document.getElementById('btnDeleteNode').addEventListener('click', () => {
  const { nodeId, subjectId, unitId } = Router.context;
  const node = Store.getNode(nodeId);
  openConfirmModal({ title:'Delete Node', message:`Delete "<b>${node?.label}</b>"? All connections will be removed.`, confirmText:'Delete',
    onConfirm: () => {
      Store.deleteNode(nodeId); Events.emit('nodes:changed',{subjectId}); Events.emit('subjects:changed');
      unitId ? Router.goSubcube(unitId) : Router.goCube(subjectId);
    }
  });
});

/* ════════════════════════════════════════════
   EDGE WHITEBOARD TOOLBAR
════════════════════════════════════════════ */
document.getElementById('edgeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('edgeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); setEdgeTool(btn.dataset.tool);
  });
});
document.getElementById('edgeColorPicker').addEventListener('input', e => setEdgeColor(e.target.value));
document.getElementById('edgeToolbar').querySelectorAll('.stroke-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('edgeToolbar').querySelectorAll('.stroke-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); setEdgeWidth(parseInt(btn.dataset.size));
  });
});
document.getElementById('edgeUndo').addEventListener('click', undoEdgeWb);
document.getElementById('edgeRedo').addEventListener('click', redoEdgeWb);
document.getElementById('btnBackFromEdge').addEventListener('click', () => {
  const { subjectId } = Router.context; Router.goCube(subjectId);
});

/* ════════════════════════════════════════════
   GLOBAL KEYBOARD
════════════════════════════════════════════ */
document.addEventListener('keydown', e => { if (e.key==='Escape') { exitLinkMode(); updateLinkUI(false); } });
