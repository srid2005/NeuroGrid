// cube.js — Three.js cube interior view
import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';

let scene, camera, renderer, labelRenderer, controls;
let animId = null;

let nodeMeshes  = [];   // { mesh, nodeId }
let edgeMidMeshes = []; // { mesh, edgeId }

// Link mode state
let linkMode  = false;
let linkFirst = null;   // nodeId of first selected node

const CUBE_HALF = 1.0;
const NODE_R    = 0.10;
const GHOST_R   = 0.07;

/* ════════════════════════════════════════════
   INIT / DESTROY
════════════════════════════════════════════ */
export function initCube(container, subjectId) {
  clearScene();
  if (scene) { destroyCube(); }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09090B);
  scene.fog = new THREE.FogExp2(0x09090B, 0.06);

  // Stars (subtle background)
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(3000).map(() => (Math.random() - 0.5) * 50);
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.3 })));

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const d = new THREE.DirectionalLight(0xffffff, 0.5);
  d.position.set(5, 8, 5);
  scene.add(d);

  const W = container.clientWidth, H = container.clientHeight;
  camera = new THREE.PerspectiveCamera(55, W / H, 0.01, 100);
  camera.position.set(0, 0.5, 3.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  container.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance   = 1.2;
  controls.maxDistance   = 6;

  buildCubeScene(subjectId);

  renderer.domElement.addEventListener('click', e => onCubeClick(e, subjectId));
  window.addEventListener('resize', () => onCubeResize(container));
  Events.on('nodes:changed', () => rebuildCubeScene(subjectId));

  startCubeLoop();
}

export function destroyCube() {
  stopCubeLoop();
  Events.off('nodes:changed', () => {});
  linkMode  = false;
  linkFirst = null;
  nodeMeshes = [];
  edgeMidMeshes = [];
}

function clearScene() {
  nodeMeshes = [];
  edgeMidMeshes = [];
}

/* ════════════════════════════════════════════
   SCENE BUILDER
════════════════════════════════════════════ */
function buildCubeScene(subjectId) {
  const subject = Store.getSubject(subjectId);
  if (!subject) return;

  // ── Wireframe cube ────────────────────────
  const geo   = new THREE.BoxGeometry(CUBE_HALF*2, CUBE_HALF*2, CUBE_HALF*2);
  const edges = new THREE.EdgesGeometry(geo);
  const color = new THREE.Color(subject.color || '#8B5CF6');
  scene.add(new THREE.LineSegments(edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 })
  ));

  // ── Grid planes (subtle reference) ────────
  const gridMat = new THREE.LineBasicMaterial({ color: 0x27272A, transparent: true, opacity: 0.4 });
  [-CUBE_HALF, 0, CUBE_HALF].forEach(yOff => {
    const g = new THREE.PlaneGeometry(CUBE_HALF*2, CUBE_HALF*2, 4, 4);
    const e2 = new THREE.EdgesGeometry(g);
    const l  = new THREE.LineSegments(e2, gridMat);
    l.rotation.x = Math.PI / 2;
    l.position.y = yOff;
    scene.add(l);
  });

  const nodes = Store.getNodes(subjectId);
  const edges2 = Store.getSubjectEdges(subjectId);

  // ── Nodes ─────────────────────────────────
  nodes.forEach(node => addNodeMesh(node, subject.color));

  // ── Ghost nodes (cross-subject) ───────────
  const crossEdges = edges2.filter(e => e.isCross);
  const ghostIds   = new Set();
  crossEdges.forEach(e => {
    const gId = Store.getNode(e.fromId)?.subjectId === subjectId ? e.toId : e.fromId;
    ghostIds.add(gId);
  });
  ghostIds.forEach(gId => {
    const gNode = Store.getNode(gId);
    const gSubj = Store.getSubject(gNode?.subjectId);
    if (!gNode || !gSubj) return;
    addGhostMesh(gNode, gSubj.color, gSubj.label);
  });

  // ── Edge lines ─────────────────────────────
  edges2.forEach(edge => addEdgeLine(edge, subject));
}

function rebuildCubeScene(subjectId) {
  // Clear meshes
  nodeMeshes = [];
  edgeMidMeshes = [];
  scene.clear();
  buildCubeScene(subjectId);
}

/* ── Node mesh ──────────────────────────── */
function addNodeMesh(node, subjectColor) {
  const [x, y, z] = node.position || [0, 0, 0];
  const color = new THREE.Color(subjectColor || '#8B5CF6');

  const geo  = new THREE.SphereGeometry(NODE_R, 20, 20);
  const mat  = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35,
    roughness: 0.3, metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.userData = { nodeId: node.id };
  scene.add(mesh);
  nodeMeshes.push({ mesh, nodeId: node.id });

  // Glow ring
  const ringGeo = new THREE.TorusGeometry(NODE_R * 1.6, 0.008, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  const ring    = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  mesh.add(ring);

  // Label
  const div = document.createElement('div');
  div.className = 'node-label';
  div.innerHTML = `<div class="node-label-inner">${node.label}</div>`;
  const label = new CSS2DObject(div);
  label.position.set(0, NODE_R * 2.2, 0);
  mesh.add(label);
}

/* ── Ghost mesh (cross-subject node) ────── */
function addGhostMesh(node, color, subjectLabel) {
  const [x, y, z] = node.position || [0, 0, 0];
  // Place ghost at edge of cube
  const pos = clampToSurface(x, y, z);

  const geo  = new THREE.SphereGeometry(GHOST_R, 12, 12);
  const mat  = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.35,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pos.x, pos.y, pos.z);
  scene.add(mesh);

  const div = document.createElement('div');
  div.className = 'node-label';
  div.innerHTML = `<div class="node-label-inner" style="opacity:0.5;font-style:italic">${subjectLabel}:${node.label}</div>`;
  const label = new CSS2DObject(div);
  label.position.set(0, GHOST_R * 2.5, 0);
  mesh.add(label);
}

/* ── Edge line ─────────────────────────── */
function addEdgeLine(edge, currentSubject) {
  const fromNode = Store.getNode(edge.fromId);
  const toNode   = Store.getNode(edge.toId);
  if (!fromNode || !toNode) return;

  const fromPos = fromNode.position || [0, 0, 0];
  let   toPos   = toNode.position   || [0, 0, 0];

  // If cross-subject, clamp toPos to cube surface
  if (edge.isCross) {
    const clamped = clampToSurface(...toPos);
    toPos = [clamped.x, clamped.y, clamped.z];
  }

  const points = [
    new THREE.Vector3(...fromPos),
    new THREE.Vector3(...toPos),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = edge.isCross
    ? new THREE.LineDashedMaterial({ color: 0xF59E0B, dashSize: 0.08, gapSize: 0.04, transparent: true, opacity: 0.7 })
    : new THREE.LineBasicMaterial({ color: new THREE.Color(currentSubject.color), transparent: true, opacity: 0.6 });
  const line = new THREE.Line(geo, mat);
  if (edge.isCross) line.computeLineDistances();
  scene.add(line);

  // Invisible midpoint sphere for click detection
  const mid = new THREE.Vector3(
    (fromPos[0] + toPos[0]) / 2,
    (fromPos[1] + toPos[1]) / 2,
    (fromPos[2] + toPos[2]) / 2,
  );
  const midGeo  = new THREE.SphereGeometry(0.06, 8, 8);
  const midMat  = new THREE.MeshBasicMaterial({ visible: false });
  const midMesh = new THREE.Mesh(midGeo, midMat);
  midMesh.position.copy(mid);
  midMesh.userData = { edgeId: edge.id };
  scene.add(midMesh);
  edgeMidMeshes.push({ mesh: midMesh, edgeId: edge.id });
}

/* ── Helper: clamp to cube surface ──────── */
function clampToSurface(x, y, z) {
  const S = CUBE_HALF * 0.95;
  return {
    x: Math.max(-S, Math.min(S, x)),
    y: Math.max(-S, Math.min(S, y)),
    z: Math.max(-S, Math.min(S, z)),
  };
}

/* ════════════════════════════════════════════
   CLICK HANDLING
════════════════════════════════════════════ */
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

function onCubeClick(e, subjectId) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const allMeshes = [...nodeMeshes.map(n => n.mesh), ...edgeMidMeshes.map(m => m.mesh)];
  const hits = raycaster.intersectObjects(allMeshes);

  if (hits.length === 0) return;
  const obj = hits[0].object;

  // ── Link mode ─────────────────────────────
  if (linkMode) {
    const nm = nodeMeshes.find(n => n.mesh === obj);
    if (!nm) return;

    if (!linkFirst) {
      linkFirst = nm.nodeId;
      obj.material.emissiveIntensity = 1.0;
      Events.emit('linkmode:first', { nodeId: nm.nodeId });
    } else {
      if (nm.nodeId !== linkFirst) {
        Events.emit('linkmode:second', { fromId: linkFirst, toId: nm.nodeId, subjectId });
      }
      exitLinkMode();
    }
    return;
  }

  // ── Normal click — node ───────────────────
  const nm = nodeMeshes.find(n => n.mesh === obj);
  if (nm) { Router.goNodeWb(nm.nodeId); return; }

  // ── Normal click — edge midpoint ──────────
  const em = edgeMidMeshes.find(m => m.mesh === obj);
  if (em) { Router.goEdgeWb(em.edgeId); }
}

/* ════════════════════════════════════════════
   LINK MODE
════════════════════════════════════════════ */
export function enterLinkMode() {
  linkMode  = true;
  linkFirst = null;
  Events.emit('linkmode:enter');
}

export function exitLinkMode() {
  linkMode  = false;
  linkFirst = null;
  Events.emit('linkmode:exit');
}

/* ════════════════════════════════════════════
   LOOP + RESIZE
════════════════════════════════════════════ */
function startCubeLoop() {
  if (animId !== null) return;
  function tick() {
    animId = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  tick();
}

function stopCubeLoop() {
  if (animId !== null) cancelAnimationFrame(animId);
  animId = null;
}

function onCubeResize(container) {
  const W = container.clientWidth, H = container.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
  labelRenderer.setSize(W, H);
}

export function resetCubeCamera() {
  camera?.position.set(0, 0.5, 3.2);
  controls?.reset();
}

export { rebuildCubeScene };
