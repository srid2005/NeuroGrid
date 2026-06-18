/* ═══════════════════════════════════════════
   APP — main orchestrator
═══════════════════════════════════════════ */
import { initModal } from './ui/modal.js';
import { showScreen } from './core/router.js';
import { on } from './core/events.js';
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
  initGalaxy(wsId);
  showScreen('galaxy');
  setupGalaxyHUD();
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
  initCube(wsId, subjectId);
  showScreen('cube');
  setupCubeHUD(wsId, subjectId);
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
  initSubcube(wsId, subjectId, unitId);
  showScreen('subcube');
  setupSubcubeHUD(wsId, subjectId, unitId);
});

on('nav:node', ({ wsId, subjectId, unitId, nodeId }) => {
  destroyNodeWb(); destroyEdgeWb();
  _wsId=wsId; _subjectId=subjectId; _unitId=unitId; _nodeId=nodeId;
  const ws   = getWorkspace(wsId);
  const sub  = getSubject(subjectId);
  const unit = unitId ? getUnit(unitId) : null;
  const node = getNode(nodeId);
  const backFn = unitId
    ? () => { destroySubcube(); initSubcube(wsId,subjectId,unitId); showScreen('subcube'); }
    : () => on_backToCube();
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:()=>on_backToGalaxy() },
    { label:sub?.name||'Subject', click:()=>on_backToCube() },
    ...(unit ? [{ label:unit.name, click:()=>{ destroySubcube(); initSubcube(wsId,subjectId,unitId); showScreen('subcube'); setupSubcubeHUD(wsId,subjectId,unitId); } }] : []),
    { label:node?.name||'Node', active:true }
  ]);
  initNodeWb(wsId, subjectId, unitId, nodeId);
  showScreen('node-wb');
});

on('nav:edge', ({ wsId, subjectId, unitId, edgeId }) => {
  destroyEdgeWb();
  _edgeId=edgeId;
  initEdgeWb(edgeId);
  showScreen('edge-wb');
});

function on_backToGalaxy() {
  destroyCube(); destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  const ws = getWorkspace(_wsId);
  initGalaxy(_wsId);
  showScreen('galaxy');
  setupGalaxyHUD();
  const wsN = ws?.name||'WS';
  setBreadcrumb([{ label:'Workspaces', click:goHome }, { label:wsN, active:true }]);
}
function on_backToCube() {
  destroySubcube(); destroyNodeWb(); destroyEdgeWb();
  const ws=getWorkspace(_wsId); const sub=getSubject(_subjectId);
  initCube(_wsId, _subjectId);
  showScreen('cube');
  setupCubeHUD(_wsId, _subjectId);
  setBreadcrumb([
    { label:'Workspaces', click:goHome },
    { label:ws?.name||'WS', click:on_backToGalaxy },
    { label:sub?.name||'Subject', active:true }
  ]);
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
      // wait for first node click in cube.js onClick linkMode
      setLinkMode(true, null); // will be set properly on first click
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
    btn.classList.toggle('active');
  };
  document.getElementById('subcubeBackBtn').onclick = on_backToCube;
  document.getElementById('cancelSubLinkBtn').onclick = () => {
    setSubLinkMode(false);
    document.getElementById('subcubeLinkBtn')?.classList.remove('active');
  };
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
