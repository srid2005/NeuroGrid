// app.js — NeuroGrid main entry point (ES module)
import Store          from './core/store.js';
import Router         from './core/router.js';
import Events         from './core/events.js';
import { initGalaxy, destroyGalaxy }          from './views/galaxy.js';
import { initCube, destroyCube, enterLinkMode, exitLinkMode, resetCubeCamera, rebuildCubeScene } from './views/cube.js';
import { initNodeWb, destroyNodeWb, setNodeTool, setNodeColor, setNodeWidth, undoNodeWb, redoNodeWb, clearNodeWb } from './views/node-wb.js';
import { initEdgeWb, destroyEdgeWb, setEdgeTool, setEdgeColor, setEdgeWidth, undoEdgeWb, redoEdgeWb } from './views/edge-wb.js';
import { initModalBindings, openAddSubjectModal, openAddNodeModal, openAddEdgeModal, openConfirmModal } from './ui/modal.js';

/* ── Auth guard ─────────────────────────── */
if (sessionStorage.getItem('ng_auth') !== '1') {
  window.location.href = 'login.html';
}

/* ── Make Store available globally for router ── */
window.__store = Store;

/* ── Seed GATE subjects on first launch ──── */
Store.seedIfEmpty();

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
initModalBindings();

let galaxyInited = false;
let cubeInited   = false;

/* ════════════════════════════════════════════
   SCREEN TRANSITIONS
════════════════════════════════════════════ */
Events.on('screen:change', ({ to, from }) => {

  // Clean up outgoing screens
  if (from === 'cube'   && to !== 'nodeWb' && to !== 'edgeWb') {
    destroyCube();
    cubeInited = false;
    exitLinkMode();
    updateLinkModeUI(false);
  }
  if (from === 'nodeWb') destroyNodeWb();
  if (from === 'edgeWb') destroyEdgeWb();

  const { subjectId, nodeId, edgeId } = Router.context;

  // Initialize incoming screen
  if (to === 'galaxy') {
    if (!galaxyInited) {
      initGalaxy(document.getElementById('galaxy-container'));
      galaxyInited = true;
    }
  }

  if (to === 'cube' && subjectId) {
    destroyCube();
    const container = document.getElementById('cube-container');
    // Clear container
    container.innerHTML = '';
    initCube(container, subjectId);
    cubeInited = true;
  }

  if (to === 'nodeWb' && nodeId) {
    initNodeWb(nodeId);
  }

  if (to === 'edgeWb' && edgeId) {
    initEdgeWb(edgeId);
  }
});

/* ── Navigate to galaxy on boot ─────────── */
Router.goGalaxy();

/* ════════════════════════════════════════════
   GALAXY BUTTONS
════════════════════════════════════════════ */
document.getElementById('btnAddSubject').addEventListener('click', openAddSubjectModal);

/* ════════════════════════════════════════════
   CUBE BUTTONS
════════════════════════════════════════════ */
document.getElementById('btnBackGalaxy').addEventListener('click', () => {
  Router.goGalaxy();
});

document.getElementById('btnResetCube').addEventListener('click', resetCubeCamera);

document.getElementById('btnAddNode').addEventListener('click', () => {
  const { subjectId } = Router.context;
  if (!subjectId) return;
  openAddNodeModal(subjectId);
});

const btnLinkMode = document.getElementById('btnLinkMode');
document.getElementById('btnLinkMode').addEventListener('click', () => {
  enterLinkMode();
  updateLinkModeUI(true);
});

document.getElementById('btnCancelLink').addEventListener('click', () => {
  exitLinkMode();
  updateLinkModeUI(false);
});

function updateLinkModeUI(active) {
  document.getElementById('linkModeBanner').style.display = active ? 'flex' : 'none';
  btnLinkMode.classList.toggle('active', active);
}

/* ── Link mode events ───────────────────── */
Events.on('linkmode:exit',  () => updateLinkModeUI(false));

Events.on('linkmode:second', ({ fromId, toId, subjectId }) => {
  updateLinkModeUI(false);
  openAddEdgeModal({ fromId, toId, subjectId }, () => {
    rebuildCubeScene(subjectId);
  });
});

/* ════════════════════════════════════════════
   NODE WHITEBOARD TOOLBAR
════════════════════════════════════════════ */
// Tool buttons
document.getElementById('nodeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('nodeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setNodeTool(btn.dataset.tool);
  });
});

// Color picker
document.getElementById('nodeColorPicker').addEventListener('input', e => setNodeColor(e.target.value));

// Stroke size
document.getElementById('nodeToolbar').querySelectorAll('.stroke-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('nodeToolbar').querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setNodeWidth(parseInt(btn.dataset.size));
  });
});

// Undo / Redo / Clear
document.getElementById('nodeUndo').addEventListener('click', undoNodeWb);
document.getElementById('nodeRedo').addEventListener('click', redoNodeWb);
document.getElementById('nodeClear').addEventListener('click', () => {
  openConfirmModal({
    title:       'Clear Canvas',
    message:     'Remove all drawings on this whiteboard? This cannot be undone.',
    confirmText: 'Clear',
    onConfirm:   clearNodeWb,
  });
});

// Back to cube from node WB
document.getElementById('btnBackFromNode').addEventListener('click', () => {
  const { subjectId } = Router.context;
  Router.goCube(subjectId);
});

// Delete node
document.getElementById('btnDeleteNode').addEventListener('click', () => {
  const { nodeId, subjectId } = Router.context;
  if (!nodeId) return;
  const node = Store.getNode(nodeId);
  openConfirmModal({
    title:       'Delete Node',
    message:     `Delete <strong>${node?.label}</strong>? All connections to this node will also be removed.`,
    confirmText: 'Delete',
    onConfirm: () => {
      Store.deleteNode(nodeId);
      Events.emit('nodes:changed', { subjectId });
      Events.emit('subjects:changed');
      Router.goCube(subjectId);
    },
  });
});

/* ════════════════════════════════════════════
   EDGE WHITEBOARD TOOLBAR
════════════════════════════════════════════ */
document.getElementById('edgeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('edgeToolbar').querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setEdgeTool(btn.dataset.tool);
  });
});

document.getElementById('edgeColorPicker').addEventListener('input', e => setEdgeColor(e.target.value));

document.getElementById('edgeToolbar').querySelectorAll('.stroke-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('edgeToolbar').querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setEdgeWidth(parseInt(btn.dataset.size));
  });
});

document.getElementById('edgeUndo').addEventListener('click', undoEdgeWb);
document.getElementById('edgeRedo').addEventListener('click', redoEdgeWb);

document.getElementById('btnBackFromEdge').addEventListener('click', () => {
  const { subjectId } = Router.context;
  Router.goCube(subjectId);
});

document.getElementById('btnDeleteEdge').addEventListener('click', () => {
  const { edgeId, subjectId } = Router.context;
  if (!edgeId) return;
  openConfirmModal({
    title:       'Remove Link',
    message:     'Remove this concept connection? The whiteboard notes will be lost.',
    confirmText: 'Remove',
    onConfirm: () => {
      Store.deleteEdge(edgeId);
      Events.emit('nodes:changed', { subjectId });
      Events.emit('subjects:changed');
      Router.goCube(subjectId);
    },
  });
});

/* ════════════════════════════════════════════
   TOPBAR
════════════════════════════════════════════ */
document.getElementById('btnLogout').addEventListener('click', () => {
  sessionStorage.removeItem('ng_auth');
  window.location.href = 'login.html';
});

/* ════════════════════════════════════════════
   GLOBAL KEYBOARD
════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    exitLinkMode();
    updateLinkModeUI(false);
  }
});

/* ════════════════════════════════════════════
   CONTEXT MENU (right-click on galaxy/cube)
════════════════════════════════════════════ */
const ctxMenu = document.getElementById('ctxMenu');

document.addEventListener('contextmenu', e => {
  const isGalaxy = document.getElementById('screen-galaxy').classList.contains('active');
  const isCube   = document.getElementById('screen-cube').classList.contains('active');

  if (!isGalaxy && !isCube) return;
  e.preventDefault();

  const items = isGalaxy
    ? [{ label: '+ Add Subject', action: openAddSubjectModal }]
    : [{ label: '+ Add Node', action: () => {
          const { subjectId } = Router.context;
          if (subjectId) openAddNodeModal(subjectId);
        }
      }];

  ctxMenu.innerHTML = items.map((item, i) =>
    `<div class="ctx-item" data-idx="${i}">${item.label}</div>`
  ).join('');

  ctxMenu.style.display = 'block';
  ctxMenu.style.left = `${Math.min(e.clientX, window.innerWidth  - 180)}px`;
  ctxMenu.style.top  = `${Math.min(e.clientY, window.innerHeight - 80)}px`;

  ctxMenu.querySelectorAll('.ctx-item').forEach((el, i) => {
    el.addEventListener('click', () => { items[i].action(); ctxMenu.style.display = 'none'; });
  });
});

document.addEventListener('click', () => { ctxMenu.style.display = 'none'; });
