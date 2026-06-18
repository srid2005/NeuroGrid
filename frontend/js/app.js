/* ═══════════════════════════════════════════
   APP — main orchestrator
═══════════════════════════════════════════ */
import { initModal } from './ui/modal.js';
import { showScreen } from './core/router.js';
import { on, emit } from './core/events.js';
import {
  getCurrentUser, loginUser, registerUser, logoutUser,
  getWorkspace, getSubject, getUnit, getNode
} from './core/store.js';

import { renderHome } from './views/home.js';
import { initGalaxy, destroyGalaxy, rebuildScene as rebuildGalaxy, openAddSubjectModal } from './views/galaxy.js';
import { initCube,   destroyCube,   rebuildCubeScene, setLinkMode, openAddUnitModal, openAddNodeModal } from './views/cube.js';
import { initSubcube, destroySubcube, rebuildSubcubeScene, setSubLinkMode, openAddSubNodeModal } from './views/subcube.js';
import { initNodeWb, destroyNodeWb } from './views/node-wb.js';
import { initEdgeWb, destroyEdgeWb } from './views/edge-wb.js';

// ── Nav state ──────────────────────────────────────────────────────────────
let _wsId=null, _subjectId=null, _unitId=null, _nodeId=null, _edgeId=null;

// ── Boot ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initModal();
  setupAuthForms();

  const user = getCurrentUser();
  if (user) {
    goHome();
  } else {
    document.getElementById('authScreen').style.display = 'flex';
  }
});

// ── Auth ───────────────────────────────────────────────────────────────────
function setupAuthForms() {
  const authScreen = document.getElementById('authScreen');
  const loginForm  = document.getElementById('loginForm');
  const regForm    = document.getElementById('regForm');
  const showReg    = document.getElementById('showRegister');
  const showLogin  = document.getElementById('showLogin');

  showReg?.addEventListener('click',  () => { loginForm.style.display='none'; regForm.style.display='block'; });
  showLogin?.addEventListener('click',() => { regForm.style.display='none';   loginForm.style.display='block'; });

  document.getElementById('loginBtn')?.addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPass').value;
    const { error } = loginUser(email, pass);
    if (error) { showAuthError('loginError', error); return; }
    authScreen.style.display = 'none';
    goHome();
  });

  document.getElementById('registerBtn')?.addEventListener('click', () => {
    const email = document.getElementById('regEmail').value.trim();
    const pass  = document.getElementById('regPass').value;
    if (!email||!pass) { showAuthError('regError','Fill in all fields'); return; }
    const { error, user } = registerUser(email, pass);
    if (error) { showAuthError('regError', error); return; }
    loginUser(email, pass);
    authScreen.style.display = 'none';
    goHome();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    logoutUser();
    location.reload();
  });
}
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent=msg; el.style.display='block'; }
}

// ── Navigation ─────────────────────────────────────────────────────────────
function goHome() {
  // Destroy active 3D views
  destroyGalaxy(); destroyCube(); destroySubcube();
  destroyNodeWb(); destroyEdgeWb();
  _wsId=null; _subjectId=null; _unitId=null; _nodeId=null; _edgeId=null;
  setBreadcrumb([{ label:'Workspaces' }]);
  renderHome();
  showScreen('home');
  updateTopbarUser();
}

on('nav:workspace', ({ wsId }) => {
  destroyGalaxy(); destroyCube(); destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  _wsId=wsId; _subjectId=null; _unitId=null;
  const ws = getWorkspace(wsId);
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label: ws?.name||'Workspace', active:true }
  ]);
  // FIX: showScreen BEFORE init so container has non-zero dimensions for Three.js
  showScreen('galaxy');
  setupGalaxyHUD();
  initGalaxy(wsId);
});

on('nav:subject', ({ wsId, subjectId }) => {
  destroyCube(); destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  _wsId=wsId; _subjectId=subjectId; _unitId=null;
  const ws  = getWorkspace(wsId);
  const sub = getSubject(subjectId);
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:()=>on_backToGalaxy() },
    { label:sub?.name||'Subject', active:true }
  ]);
  // FIX: showScreen BEFORE init so container has non-zero dimensions for Three.js
  showScreen('cube');
  setupCubeHUD(wsId, subjectId);
  initCube(wsId, subjectId);
});

on('nav:unit', ({ wsId, subjectId, unitId }) => {
  destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  _wsId=wsId; _subjectId=subjectId; _unitId=unitId;
  const ws   = getWorkspace(wsId);
  const sub  = getSubject(subjectId);
  const unit = getUnit(unitId);
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:()=>on_backToGalaxy() },
    { label:sub?.name||'Subject', click:()=>on_backToCube() },
    { label:unit?.name||'SubCube', active:true }
  ]);
  // FIX: showScreen BEFORE init so container has non-zero dimensions for Three.js
  showScreen('subcube');
  setupSubcubeHUD(wsId, subjectId, unitId);
  initSubcube(wsId, subjectId, unitId);
});

on('nav:node', ({ wsId, subjectId, unitId, nodeId }) => {
  destroyNodeWb(); destroyEdgeWb();
  _wsId=wsId; _subjectId=subjectId; _unitId=unitId; _nodeId=nodeId;
  const ws   = getWorkspace(wsId);
  const sub  = getSubject(subjectId);
  const unit = unitId ? getUnit(unitId) : null;
  const node = getNode(nodeId);
  // FIX: breadcrumb subcube back link — showScreen before init
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:()=>on_backToGalaxy() },
    { label:sub?.name||'Subject', click:()=>on_backToCube() },
    ...(unit ? [{ label:unit.name, click:()=>on_backToSubcube() }] : []),
    { label:node?.name||'Node', active:true }
  ]);
  // FIX: showScreen BEFORE init so canvas container has non-zero dimensions
  showScreen('node-wb');
  setupNodeWbHUD();
  initNodeWb(wsId, subjectId, unitId, nodeId);
});

on('nav:edge', ({ wsId, subjectId, unitId, edgeId }) => {
  destroyEdgeWb();
  _edgeId=edgeId;
  // FIX: showScreen BEFORE init
  showScreen('edge-wb');
  setupEdgeWbHUD();
  initEdgeWb(edgeId);
});

function on_backToGalaxy() {
  destroyCube(); destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  const ws = getWorkspace(_wsId);
  const wsN = ws?.name||'WS';
  setBreadcrumb([{ label:'Workspaces', click:goHome }, { label:wsN, active:true }]);
  // FIX: showScreen BEFORE init
  showScreen('galaxy');
  setupGalaxyHUD();
  initGalaxy(_wsId);
}
function on_backToCube() {
  destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  const ws=getWorkspace(_wsId); const sub=getSubject(_subjectId);
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:on_backToGalaxy },
    { label:sub?.name||'Subject', active:true }
  ]);
  // FIX: showScreen BEFORE init
  showScreen('cube');
  setupCubeHUD(_wsId, _subjectId);
  initCube(_wsId, _subjectId);
}

function on_backToSubcube() {
  destroyNodeWb(); destroyEdgeWb();
  const ws   = getWorkspace(_wsId);
  const sub  = getSubject(_subjectId);
  const unit = getUnit(_unitId);
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:on_backToGalaxy },
    { label:sub?.name||'Subject', click:on_backToCube },
    { label:unit?.name||'SubCube', active:true }
  ]);
  // FIX: showScreen BEFORE init
  showScreen('subcube');
  setupSubcubeHUD(_wsId, _subjectId, _unitId);
  initSubcube(_wsId, _subjectId, _unitId);
}

// ── HUD wiring ─────────────────────────────────────────────────────────────
function setupGalaxyHUD() {
  const btn = document.getElementById('addSubjectBtn');
  if (btn) btn.onclick = () => openAddSubjectModal(_wsId);
  document.getElementById('galaxyBackBtn').onclick = goHome;
}

function setupCubeHUD(wsId, subjectId) {
  document.getElementById('addUnitBtn').onclick     = () => openAddUnitModal(wsId, subjectId);
  document.getElementById('addCubeNodeBtn').onclick = () => openAddNodeModal(wsId, subjectId, null);
  document.getElementById('cubeLinkBtn').onclick    = () => {
    const btn = document.getElementById('cubeLinkBtn');
    const active = btn.classList.toggle('active');
    if (!active) { setLinkMode(false); }
    else {
      // FIX: null source — two-phase handled in cube.js onClick (first click sets source)
      setLinkMode(true, null);
    }
  };
  document.getElementById('cubeBackBtn').onclick = on_backToGalaxy;
  document.getElementById('cancelLinkBtn').onclick = () => {
    setLinkMode(false);
    document.getElementById('cubeLinkBtn')?.classList.remove('active');
  };
}

function setupSubcubeHUD(wsId, subjectId, unitId) {
  document.getElementById('addSubNodeBtn').onclick = () => openAddSubNodeModal(wsId, subjectId, unitId);
  document.getElementById('subcubeLinkBtn').onclick = () => {
    const btn = document.getElementById('subcubeLinkBtn');
    const active = btn.classList.toggle('active');
    // FIX: actually activate link mode (was only toggling CSS class before)
    if (active) setSubLinkMode(true, null);
    else         setSubLinkMode(false);
  };
  document.getElementById('subcubeBackBtn').onclick = on_backToCube;
  document.getElementById('cancelSubLinkBtn').onclick = () => {
    setSubLinkMode(false);
    document.getElementById('subcubeLinkBtn')?.classList.remove('active');
  };
}

// FIX: Wire node-wb back button with proper SPA navigation (was using history.back())
function setupNodeWbHUD() {
  const btn = document.getElementById('nodeWbBackBtn');
  if (btn) {
    // Replace any existing listener by cloning
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      if (_unitId) on_backToSubcube();
      else on_backToCube();
    });
  }
}

// FIX: Wire edge-wb back button with proper SPA navigation (was using history.back())
function setupEdgeWbHUD() {
  const btn = document.getElementById('edgeWbBackBtn');
  if (btn) {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      if (_nodeId) {
        // Navigate back to the node whiteboard
        emit('nav:node', { wsId: _wsId, subjectId: _subjectId, unitId: _unitId, nodeId: _nodeId });
      } else if (_unitId) {
        on_backToSubcube();
      } else {
        on_backToCube();
      }
    });
  }
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────
function setBreadcrumb(items) {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = items.map((item, i) => {
    const isLast = i===items.length-1;
    let html = `<span class="bc-item${item.active?' active':''}" ${item.click?'data-idx="'+i+'"':''}>${item.label}</span>`;
    if (!isLast) html += `<span class="bc-sep">›</span>`;
    return html;
  }).join('');
  bc.querySelectorAll('[data-idx]').forEach(el => {
    const idx = +el.dataset.idx;
    if (items[idx]?.click) el.addEventListener('click', items[idx].click);
  });
}

function updateTopbarUser() {
  const user = getCurrentUser();
  const el   = document.getElementById('topbarUser');
  if (el && user) el.textContent = user.email;
}
