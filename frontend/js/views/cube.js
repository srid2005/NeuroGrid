/* ═══════════════════════════════════════════
   CUBE — subject interior (units as sub-cubes)
   FIX: workspace isolation, free object movement,
        link mode fixed, cross-layer links
═══════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  getSubject, getUnits, createUnit, deleteUnit,
  getNodes, createNode, deleteNode,
  getEdges, createEdge, deleteEdge,
  getCrossEdgesForNode, getNode, getAllNodesForWorkspace,
  PALETTE, uid
} from '../core/store.js';
import { emit } from '../core/events.js';
import { openModal } from '../ui/modal.js';
import { openCrossLinkModal } from './cross-link.js';

let renderer, labelRenderer, scene, camera, controls, animId;
let _wsId = null, _subjectId = null;
let unitMeshes = [];   // { mesh, unitId }
let nodeMeshes = [];   // { mesh, nodeId }
let edgeLines  = [];
let linkMode   = false;
let linkSource = null;
let dragging   = null;
let dragPlane  = new THREE.Plane();
let dragOffset = new THREE.Vector3();
let hovered    = null;
let ctxTarget  = null;
const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();
const _mouse    = new THREE.Vector2();

// ── unit grid positions ────────────────────────────────────────────────────
function unitPosition(idx, total) {
  const cols = Math.ceil(Math.sqrt(total));
  const row  = Math.floor(idx / cols);
  const col  = idx % cols;
  const spacing = 5;
  const offX = -((cols-1)*spacing)/2;
  const offZ = -((Math.ceil(total/cols)-1)*spacing)/2;
  return new THREE.Vector3(offX + col*spacing, 0, offZ + row*spacing);
}

// ── node positions on a unit cube face ────────────────────────────────────
function nodePosition(idx, total, unitPos) {
  const r     = 1.8;
  const angle = (idx / Math.max(total,1)) * Math.PI * 2;
  return new THREE.Vector3(
    unitPos.x + r * Math.cos(angle),
    unitPos.y + 1.5 + (idx % 2) * 0.6,
    unitPos.z + r * Math.sin(angle)
  );
}

export function initCube(wsId, subjectId) {
  _wsId = wsId; _subjectId = subjectId;
  linkMode = false; linkSource = null;
  const container = document.getElementById('cube-container');
  container.innerHTML = '';
  unitMeshes = []; nodeMeshes = []; edgeLines = [];

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0A0B0E, 1);
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
  container.appendChild(labelRenderer.domElement);

  scene  = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0A0B0E, 0.012);

  camera = new THREE.PerspectiveCamera(55, container.clientWidth/container.clientHeight, 0.1, 500);
  camera.position.set(0, 10, 22);

  const aL = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(aL);
  const dL = new THREE.DirectionalLight(0xffffff, 0.8);
  dL.position.set(8, 16, 8);
  scene.add(dL);
  addStars();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance   = 3;
  controls.maxDistance   = 80;

  rebuildCubeScene();

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup',   onPointerUp);
  renderer.domElement.addEventListener('click',       onClick);
  renderer.domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', onResize);

  if (animId) cancelAnimationFrame(animId);
  animate();
}

function addStars() {
  const geo = new THREE.BufferGeometry();
  const cnt = 600;
  const pos = new Float32Array(cnt*3);
  for (let i=0;i<cnt*3;i++) pos[i]=(Math.random()-0.5)*250;
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color:0x4B4F66, size:0.1, transparent:true, opacity:0.7 })));
}

export function rebuildCubeScene() {
  // Clear old objects
  unitMeshes.forEach(u => scene.remove(u.group));
  nodeMeshes.forEach(n => scene.remove(n.group));
  edgeLines.forEach(l => scene.remove(l));
  unitMeshes=[]; nodeMeshes=[]; edgeLines=[];

  const sub   = getSubject(_subjectId);
  const units = getUnits(_subjectId);

  // Units
  units.forEach((unit, idx) => {
    const pos = unitPosition(idx, units.length);
    addUnitMesh(unit, pos);
  });

  // Nodes on this subject (no unitId)
  const nodes = getNodes(_subjectId, null);
  const unitCount = units.length;
  nodes.forEach((node, idx) => {
    // Use stored position or calculate default
    const p = node.pos || { x: (idx%4-1.5)*3, y: unitCount>0?0:-0.5, z: Math.floor(idx/4)*3-2 };
    addNodeMesh(node, new THREE.Vector3(p.x, p.y, p.z));
  });

  // Edges
  rebuildEdgeLines();
}

function addUnitMesh(unit, pos) {
  const col = parseInt(unit.color.replace('#',''),16);
  const group = new THREE.Group();
  group.position.copy(pos);

  // Main box
  const geo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
  const mat = new THREE.MeshStandardMaterial({
    color: col, transparent: true, opacity: 0.75,
    roughness: 0.3, metalness: 0.6,
    emissive: col, emissiveIntensity: 0.12
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // Edges wireframe
  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 })
  );
  group.add(wire);

  // Label
  const div = document.createElement('div');
  div.className = 'unit-label';
  div.innerHTML = `<div class="unit-label-inner" style="color:${unit.color};border-color:${unit.color}33">${unit.name}</div>`;
  const lbl = new CSS2DObject(div);
  lbl.position.set(0,-1.6,0);
  group.add(lbl);

  group.userData = { unitId: unit.id, type:'unit', color: col, isUnit: true };
  mesh.userData  = { unitId: unit.id, type:'unit', color: col, isUnit: true };
  scene.add(group);
  unitMeshes.push({ group, mesh, unitId: unit.id, pos });
}

function addNodeMesh(node, pos) {
  const col = parseInt(node.color.replace('#',''),16);
  const group = new THREE.Group();
  group.position.copy(pos);

  const geo = new THREE.SphereGeometry(0.55, 20, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.2, metalness: 0.6,
    emissive: col, emissiveIntensity: 0.25
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // Glow ring
  const ringGeo = new THREE.RingGeometry(0.65, 0.75, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI/2;
  group.add(ring);

  // Label
  const div = document.createElement('div');
  div.className = 'node-label';
  div.innerHTML = `<div class="node-label-inner">${node.name}</div>`;
  const lbl = new CSS2DObject(div);
  lbl.position.set(0, 0.9, 0);
  group.add(lbl);

  group.userData = { nodeId: node.id, type:'node', color: col };
  mesh.userData  = { nodeId: node.id, type:'node', color: col };
  scene.add(group);
  nodeMeshes.push({ group, mesh, nodeId: node.id });
}

function rebuildEdgeLines() {
  edgeLines.forEach(l => scene.remove(l));
  edgeLines = [];
  const edges = getEdges(_subjectId, null);
  edges.forEach(edge => {
    const fromM = nodeMeshes.find(m => m.nodeId === edge.fromNodeId);
    const toM   = nodeMeshes.find(m => m.nodeId === edge.toNodeId);
    if (!fromM || !toM) return;
    const points = [fromM.group.position.clone(), toM.group.position.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xA78BFA, transparent: true, opacity: 0.7, linewidth: 2 }));
    line.userData = { edgeId: edge.id };
    scene.add(line);
    edgeLines.push(line);
  });
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (!renderer || !scene || !camera) return;
  const t = Date.now()*0.001;
  unitMeshes.forEach((u,i) => {
    u.group.rotation.y = t*0.15 + i*0.8;
    if (u.mesh === hovered) u.mesh.material.emissiveIntensity = 0.4 + Math.sin(t*4)*0.15;
    else u.mesh.material.emissiveIntensity = 0.12;
  });
  nodeMeshes.forEach((n,i) => {
    n.group.position.y += Math.sin(t*1.5+i)*0.0015;
    if (n.mesh === hovered || (linkMode && n.nodeId === linkSource)) {
      n.mesh.material.emissiveIntensity = 0.6 + Math.sin(t*5)*0.2;
      n.group.scale.setScalar(1.12);
    } else {
      n.mesh.material.emissiveIntensity = 0.25;
      n.group.scale.setScalar(1);
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
    x: ((e.clientX-rect.left)/rect.width)*2-1,
    y:-((e.clientY-rect.top)/rect.height)*2+1
  };
}
function getIntersected(e, meshList) {
  const n = getPointerNDC(e);
  pointer.set(n.x, n.y);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshList, false);
  return hits.length ? hits[0] : null;
}
function allPickable() {
  return [
    ...unitMeshes.map(u=>u.mesh),
    ...nodeMeshes.map(n=>n.mesh)
  ];
}

function onPointerMove(e) {
  const hit = getIntersected(e, allPickable());
  hovered = hit ? hit.object : null;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';

  // Drag
  if (dragging) {
    controls.enabled = false;
    const n = getPointerNDC(e);
    raycaster.setFromCamera(new THREE.Vector2(n.x,n.y), camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, target);
    dragging.group.position.copy(target.sub(dragOffset));
    // Persist position
    if (dragging.nodeId) {
      const p = dragging.group.position;
      import('../core/store.js').then(s=>s.updateNode(dragging.nodeId,{pos:{x:p.x,y:p.y,z:p.z}}));
    }
    rebuildEdgeLines();
  }
}

let _mouseDownPos = null;
function onPointerDown(e) {
  if (e.button !== 0) return;
  _mouseDownPos = { x: e.clientX, y: e.clientY };
  if (linkMode) return;
  const hit = getIntersected(e, nodeMeshes.map(n=>n.mesh));
  if (!hit) return;
  const nodeEntry = nodeMeshes.find(n=>n.mesh===hit.object);
  if (!nodeEntry) return;
  e.stopPropagation();
  dragging = nodeEntry;
  controls.enabled = false;
  // Build drag plane facing camera
  const n = new THREE.Vector3().subVectors(camera.position, nodeEntry.group.position).normalize();
  dragPlane.setFromNormalAndCoplanarPoint(n, nodeEntry.group.position);
  const pointerNDC = getPointerNDC(e);
  raycaster.setFromCamera(new THREE.Vector2(pointerNDC.x, pointerNDC.y), camera);
  const ip = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, ip);
  dragOffset.subVectors(ip, nodeEntry.group.position);
}

function onPointerUp(e) {
  dragging = null;
  controls.enabled = true;
}

function onClick(e) {
  // Only fire click if mouse didn't move (drag prevention)
  if (_mouseDownPos) {
    const dx = e.clientX - _mouseDownPos.x;
    const dy = e.clientY - _mouseDownPos.y;
    if (Math.sqrt(dx*dx+dy*dy) > 5) return;
  }
  const hit = getIntersected(e, allPickable());
  if (!hit) return;
  const obj = hit.object;

  if (linkMode) {
    // Link mode: picking second node
    if (!obj.userData.nodeId) return;
    const toId = obj.userData.nodeId;
    if (toId === linkSource) return;
    createEdge(_wsId, _subjectId, null, linkSource, toId, '');
    setLinkMode(false);
    rebuildEdgeLines();
    return;
  }

  if (obj.userData.unitId) {
    emit('nav:unit', { wsId: _wsId, subjectId: _subjectId, unitId: obj.userData.unitId });
    return;
  }
  if (obj.userData.nodeId) {
    emit('nav:node', { wsId: _wsId, subjectId: _subjectId, unitId: null, nodeId: obj.userData.nodeId });
  }
}

function onContextMenu(e) {
  e.preventDefault();
  if (dragging) return;
  const hit = getIntersected(e, allPickable());
  if (!hit) return;
  ctxTarget = hit.object.userData;
  showCtxMenu(e.clientX, e.clientY);
}

function showCtxMenu(x, y) {
  const menu = document.getElementById('ctxMenu');
  const isUnit = !!ctxTarget.unitId;
  const isNode = !!ctxTarget.nodeId;
  menu.style.cssText = `display:block;left:${x}px;top:${y}px`;
  menu.innerHTML = '';

  if (isUnit) {
    menu.innerHTML = `
      <div class="ctx-item" id="ctxEnter">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        Enter SubCube
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" id="ctxDelete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        Delete SubCube
      </div>`;
    menu.querySelector('#ctxEnter').onclick = () => {
      hideCtxMenu();
      emit('nav:unit', { wsId: _wsId, subjectId: _subjectId, unitId: ctxTarget.unitId });
    };
    menu.querySelector('#ctxDelete').onclick = () => {
      hideCtxMenu();
      openModal({
        title: 'Delete SubCube',
        body: `<p style="color:var(--text-muted);font-size:13px">Delete this subcube and all its nodes?</p>`,
        confirmText: 'Delete', confirmDanger: true,
        onConfirm: () => { deleteUnit(ctxTarget.unitId); rebuildCubeScene(); }
      });
    };
  } else if (isNode) {
    menu.innerHTML = `
      <div class="ctx-item" id="ctxOpen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
        Open Node
      </div>
      <div class="ctx-item" id="ctxLink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Link to Node
      </div>
      <div class="ctx-item" id="ctxCrossLink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M4 6h16M4 12h16M4 18h7"/><path d="M15 15l3 3 3-3"/><path d="M18 18V9"/></svg>
        Cross-Layer Link
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" id="ctxDelete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        Delete Node
      </div>`;
    menu.querySelector('#ctxOpen').onclick = () => {
      hideCtxMenu();
      emit('nav:node', { wsId: _wsId, subjectId: _subjectId, unitId: null, nodeId: ctxTarget.nodeId });
    };
    menu.querySelector('#ctxLink').onclick = () => {
      hideCtxMenu();
      setLinkMode(true, ctxTarget.nodeId);
    };
    menu.querySelector('#ctxCrossLink').onclick = () => {
      hideCtxMenu();
      openCrossLinkModal(_wsId, ctxTarget.nodeId, () => rebuildCubeScene());
    };
    menu.querySelector('#ctxDelete').onclick = () => {
      hideCtxMenu();
      openModal({
        title: 'Delete Node',
        body: `<p style="color:var(--text-muted);font-size:13px">Delete this node and all its connections?</p>`,
        confirmText: 'Delete', confirmDanger: true,
        onConfirm: () => { deleteNode(ctxTarget.nodeId); rebuildCubeScene(); }
      });
    };
  }
}
function hideCtxMenu() { document.getElementById('ctxMenu').style.display='none'; }
document.addEventListener('click', hideCtxMenu);

export function setLinkMode(active, sourceNodeId) {
  linkMode   = active;
  linkSource = sourceNodeId || null;
  const banner = document.getElementById('linkModeBanner');
  if (banner) banner.style.display = active ? 'flex' : 'none';
}

export function openAddUnitModal(wsId, subjectId) {
  let chosenColor = PALETTE[Math.floor(Math.random()*PALETTE.length)];
  const swatches = PALETTE.map(c=>
    `<button class="color-swatch${c===chosenColor?' selected':''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  openModal({
    title: 'Add SubCube',
    body: `
      <div class="form-group">
        <label class="form-label">SubCube Name</label>
        <input class="form-input" id="unitNameInput" placeholder="e.g. Chapter 3" autofocus/>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatch-grid">${swatches}</div>
      </div>`,
    confirmText: 'Add SubCube',
    onConfirm: () => {
      const name = document.getElementById('unitNameInput')?.value?.trim();
      if (!name) return false;
      createUnit(wsId, subjectId, name, chosenColor);
      rebuildCubeScene();
    }
  });
  setTimeout(() => {
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch[data-color]').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        chosenColor = btn.dataset.color;
      });
    });
  }, 0);
}

export function openAddNodeModal(wsId, subjectId, unitId) {
  let chosenColor = PALETTE[Math.floor(Math.random()*PALETTE.length)];
  const swatches = PALETTE.map(c=>
    `<button class="color-swatch${c===chosenColor?' selected':''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  openModal({
    title: unitId ? 'Add Node to SubCube' : 'Add Node',
    body: `
      <div class="form-group">
        <label class="form-label">Node Name</label>
        <input class="form-input" id="nodeNameInput" placeholder="e.g. Introduction" autofocus/>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatch-grid">${swatches}</div>
      </div>`,
    confirmText: 'Add Node',
    onConfirm: () => {
      const name = document.getElementById('nodeNameInput')?.value?.trim();
      if (!name) return false;
      const spreadPos = { x: (Math.random()-0.5)*10, y: 1, z: (Math.random()-0.5)*10 };
      createNode(wsId, subjectId, unitId||null, name, chosenColor, spreadPos);
      rebuildCubeScene();
    }
  });
  setTimeout(() => {
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch[data-color]').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        chosenColor = btn.dataset.color;
      });
    });
  }, 0);
}

function onResize() {
  const c = document.getElementById('cube-container');
  if (!c||!renderer) return;
  camera.aspect = c.clientWidth/c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth,c.clientHeight);
  labelRenderer.setSize(c.clientWidth,c.clientHeight);
}

export function destroyCube() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  labelRenderer = null;
  scene = null; camera = null; controls = null;
  unitMeshes = []; nodeMeshes = []; edgeLines = [];
  linkMode = false; linkSource = null; dragging = null; hovered = null;
  const c = document.getElementById('cube-container');
  if (c) c.innerHTML='';
  window.removeEventListener('resize', onResize);
}
