/* ═══════════════════════════════════════════
   GALAXY — 3-D subject cloud (Three.js)
   FIXES:
   • Free drag of subject cubes (persisted via updateSubject)
   • CSS2DObject DOM cleanup before scene.remove (no duplicate labels)
   • Click vs drag discrimination via _mouseDownPos
   • Rotation paused for the cube being dragged
═══════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getSubjects, createSubject, deleteSubject, updateSubject, PALETTE } from '../core/store.js';
import { emit } from '../core/events.js';
import { openModal } from '../ui/modal.js';

let renderer, labelRenderer, scene, camera, controls, animId;
let _wsId = null;
let cubes = [];   // { mesh, subjectId, label }
const raycaster  = new THREE.Raycaster();
const pointer    = new THREE.Vector2();
let hovered      = null;
let ctxTarget    = null;

// ── drag state ─────────────────────────────────────────────────────────────
let dragging      = null;   // cube entry being dragged
let _mouseDownPos = null;
const dragPlane   = new THREE.Plane();
const dragOffset  = new THREE.Vector3();

// ── Subject position (default spherical layout) ────────────────────────────
function subjectPosition(idx, total) {
  if (total <= 1) return new THREE.Vector3(0, 0, 0);
  const φ = Math.acos(1 - 2*(idx+0.5)/total);
  const θ = Math.PI * (1 + Math.sqrt(5)) * idx;
  const r = 5 + Math.min(total*0.4, 8);
  return new THREE.Vector3(
    r * Math.sin(φ) * Math.cos(θ),
    r * Math.cos(φ),
    r * Math.sin(φ) * Math.sin(θ)
  );
}

// ── CSS2D cleanup helper (prevents duplicate labels) ──────────────────────
function removeCSS2DObjects(object) {
  object.traverse(child => {
    if (child.isCSS2DObject && child.element && child.element.parentNode) {
      child.element.parentNode.removeChild(child.element);
    }
  });
}

export function initGalaxy(wsId) {
  _wsId = wsId;
  const container = document.getElementById('galaxy-container');
  container.innerHTML = '';
  cubes = []; dragging = null; _mouseDownPos = null;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0A0B0E, 1);
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
  container.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0A0B0E, 0.018);

  camera = new THREE.PerspectiveCamera(55, container.clientWidth/container.clientHeight, 0.1, 500);
  camera.position.set(0, 4, 20);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dLight.position.set(10, 20, 10);
  scene.add(dLight);
  const pLight = new THREE.PointLight(0x7C3AED, 2, 50);
  pLight.position.set(0, 10, 0);
  scene.add(pLight);

  addStars();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance   = 4;
  controls.maxDistance   = 60;

  rebuildScene();

  renderer.domElement.addEventListener('pointermove',  onPointerMove);
  renderer.domElement.addEventListener('pointerdown',  onPointerDown);
  renderer.domElement.addEventListener('pointerup',    onPointerUp);
  renderer.domElement.addEventListener('click',        onClick);
  renderer.domElement.addEventListener('contextmenu',  onContextMenu);
  window.addEventListener('resize', onResize);

  if (animId) cancelAnimationFrame(animId);
  animate();
}

function addStars() {
  const geo = new THREE.BufferGeometry();
  const cnt = 800;
  const pos = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt*3; i++) pos[i] = (Math.random()-0.5)*300;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x8B8FA8, size: 0.15, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(geo, mat));
}

export function rebuildScene() {
  // FIX: explicitly remove CSS2DObject DOM elements before removing meshes
  cubes.forEach(c => {
    removeCSS2DObjects(c.mesh);
    scene.remove(c.mesh);
  });
  cubes = [];

  const subjects = getSubjects(_wsId);
  subjects.forEach((sub, idx) => {
    // FIX: use stored position if the subject was dragged previously
    const storedPos = sub.pos;
    const pos = storedPos
      ? new THREE.Vector3(storedPos.x, storedPos.y, storedPos.z)
      : subjectPosition(idx, subjects.length);

    const col = parseInt(sub.color.replace('#',''), 16);

    const geo  = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const mat  = new THREE.MeshStandardMaterial({
      color: col, transparent: true, opacity: 0.85,
      roughness: 0.3, metalness: 0.5,
      emissive: col, emissiveIntensity: 0.15
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.userData = { subjectId: sub.id, color: col, baseEmissive: 0.15 };
    scene.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })
    );
    mesh.add(edges);

    const div = document.createElement('div');
    div.className = 'subject-label';
    div.innerHTML = `<div class="subject-label-inner" style="color:${sub.color};border-color:${sub.color}40">${sub.name}</div>`;
    const lbl = new CSS2DObject(div);
    lbl.position.set(0, -1.4, 0);
    mesh.add(lbl);

    cubes.push({ mesh, subjectId: sub.id, label: lbl });
  });
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const t = Date.now()*0.001;
  cubes.forEach((c, i) => {
    // FIX: pause rotation for the cube being dragged
    if (dragging && dragging.subjectId === c.subjectId) return;
    c.mesh.rotation.x = Math.sin(t*0.4 + i)*0.12;
    c.mesh.rotation.y = t*0.3 + i*1.2;
    if (c.mesh === hovered) {
      c.mesh.material.emissiveIntensity = 0.5 + Math.sin(t*4)*0.2;
      c.mesh.scale.setScalar(1 + Math.sin(t*3)*0.02);
    } else {
      c.mesh.material.emissiveIntensity = 0.15;
      c.mesh.scale.setScalar(1);
    }
  });
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// ── Pointer helpers ────────────────────────────────────────────────────────
function getPointerNDC(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
    y: -((e.clientY - rect.top)  / rect.height) * 2 + 1
  };
}

function getIntersected(e) {
  const n = getPointerNDC(e);
  pointer.set(n.x, n.y);
  raycaster.setFromCamera(pointer, camera);
  const meshes = cubes.map(c => c.mesh);
  const hits   = raycaster.intersectObjects(meshes, false);
  return hits.length ? hits[0].object : null;
}

// ── Drag handlers ──────────────────────────────────────────────────────────
function onPointerDown(e) {
  if (e.button !== 0) return;
  _mouseDownPos = { x: e.clientX, y: e.clientY };
  const mesh = getIntersected(e);
  if (!mesh) return;
  const entry = cubes.find(c => c.mesh === mesh);
  if (!entry) return;
  // begin drag
  dragging = entry;
  controls.enabled = false;
  e.stopPropagation();
  const normal = new THREE.Vector3().subVectors(camera.position, mesh.position).normalize();
  dragPlane.setFromNormalAndCoplanarPoint(normal, mesh.position);
  const ndc = getPointerNDC(e);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const ip = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, ip);
  dragOffset.subVectors(ip, mesh.position);
}

function onPointerMove(e) {
  if (dragging) {
    const ndc = getPointerNDC(e);
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, target);
    dragging.mesh.position.copy(target.sub(dragOffset));
    // persist position immediately so it survives rebuilds
    const p = dragging.mesh.position;
    updateSubject(dragging.subjectId, { pos: { x: p.x, y: p.y, z: p.z } });
    return;
  }
  hovered = getIntersected(e);
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';
}

function onPointerUp() {
  dragging = null;
  controls.enabled = true;
}

function onClick(e) {
  // FIX: suppress click if mouse moved more than 5 px (it was a drag)
  if (_mouseDownPos) {
    const dx = e.clientX - _mouseDownPos.x;
    const dy = e.clientY - _mouseDownPos.y;
    if (Math.sqrt(dx*dx + dy*dy) > 5) return;
  }
  const mesh = getIntersected(e);
  if (!mesh) return;
  const { subjectId } = mesh.userData;
  emit('nav:subject', { wsId: _wsId, subjectId });
}

function onContextMenu(e) {
  e.preventDefault();
  const mesh = getIntersected(e);
  if (!mesh) return;
  ctxTarget = mesh.userData.subjectId;
  showCtxMenu(e.clientX, e.clientY);
}

function showCtxMenu(x, y) {
  const menu = document.getElementById('ctxMenu');
  menu.style.cssText = `display:block;left:${x}px;top:${y}px`;
  menu.innerHTML = `
    <div class="ctx-item" id="ctxEnter">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      Enter Subject
    </div>
    <div class="ctx-sep"></div>
    <div class="ctx-item danger" id="ctxDelete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
      Delete Subject
    </div>`;
  menu.querySelector('#ctxEnter').onclick = () => {
    hideCtxMenu();
    emit('nav:subject', { wsId: _wsId, subjectId: ctxTarget });
  };
  menu.querySelector('#ctxDelete').onclick = () => {
    hideCtxMenu();
    const sub = getSubjects(_wsId).find(s => s.id === ctxTarget);
    openModal({
      title: 'Delete Subject',
      body: `<p style="color:var(--text-muted);font-size:13px">Delete <strong>${sub?.name||'this subject'}</strong> and all its nodes? This cannot be undone.</p>`,
      confirmText: 'Delete', confirmDanger: true,
      onConfirm: () => { deleteSubject(ctxTarget); rebuildScene(); }
    });
  };
}
function hideCtxMenu() { document.getElementById('ctxMenu').style.display='none'; }
document.addEventListener('click', hideCtxMenu);

function onResize() {
  const c = document.getElementById('galaxy-container');
  if (!c || !renderer) return;
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
  labelRenderer.setSize(c.clientWidth, c.clientHeight);
}

export function openAddSubjectModal(wsId) {
  let chosenColor = PALETTE[Math.floor(Math.random()*PALETTE.length)];
  const swatches = PALETTE.map(c =>
    `<button class="color-swatch${c===chosenColor?' selected':''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');

  openModal({
    title: 'Add Subject',
    body: `
      <div class="form-group">
        <label class="form-label">Subject Name</label>
        <input class="form-input" id="subNameInput" placeholder="e.g. Quantum Physics" autofocus/>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatch-grid">${swatches}</div>
      </div>`,
    confirmText: 'Add Subject',
    onConfirm: () => {
      const name = document.getElementById('subNameInput')?.value?.trim();
      if (!name) return false;
      createSubject(wsId, name, chosenColor);
      rebuildScene();
    }
  });

  setTimeout(() => {
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch[data-color]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        chosenColor = btn.dataset.color;
      });
    });
  }, 0);
}

export function destroyGalaxy() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  labelRenderer = null;
  scene = null; camera = null; controls = null;
  cubes = []; hovered = null; dragging = null;
  const c = document.getElementById('galaxy-container');
  if (c) c.innerHTML = '';
  window.removeEventListener('resize', onResize);
}
