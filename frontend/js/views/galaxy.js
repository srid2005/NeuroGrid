// galaxy.js — Three.js galaxy view
import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';

let scene, camera, renderer, labelRenderer, controls;
let animId = null;
let cubeGroups = new Map();   // subjectId → THREE.Group
let hitMeshes  = [];          // invisible meshes for click detection
let linkLines  = [];          // cross-subject link lines
let stars;

const CUBE_SIZE = 1.3;
const HOVER_COLOR = 0xffffff;

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
export function initGalaxy(container) {
  // ── Scene ────────────────────────────────
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09090B);
  scene.fog = new THREE.FogExp2(0x09090B, 0.018);

  // ── Stars ────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(6000);
  for (let i = 0; i < 6000; i++) starPos[i] = (Math.random() - 0.5) * 120;
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 }));
  scene.add(stars);

  // ── Ambient light ────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  // ── Camera ───────────────────────────────
  const W = container.clientWidth, H = container.clientHeight;
  camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 300);
  camera.position.set(0, 5, 16);

  // ── WebGL Renderer ───────────────────────
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // ── CSS2D Renderer (labels) ───────────────
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W, H);
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  container.appendChild(labelRenderer.domElement);

  // ── Orbit Controls ────────────────────────
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor  = 0.06;
  controls.minDistance    = 4;
  controls.maxDistance    = 40;
  controls.autoRotate     = true;
  controls.autoRotateSpeed = 0.4;

  // ── Load data ────────────────────────────
  rebuildScene();

  // ── Events ───────────────────────────────
  renderer.domElement.addEventListener('click', onGalaxyClick);
  renderer.domElement.addEventListener('mousemove', onGalaxyHover);
  window.addEventListener('resize', () => onGalaxyResize(container));

  Events.on('subjects:changed', rebuildScene);

  // ── Start loop ───────────────────────────
  startLoop();
}

export function destroyGalaxy() {
  stopLoop();
  Events.off('subjects:changed', rebuildScene);
}

/* ════════════════════════════════════════════
   SCENE BUILDER
════════════════════════════════════════════ */
function rebuildScene() {
  // Remove old cubes
  cubeGroups.forEach(g => scene.remove(g));
  cubeGroups.clear();
  hitMeshes = [];

  // Remove old link lines
  linkLines.forEach(l => scene.remove(l));
  linkLines = [];

  const subjects = Store.getSubjects();
  subjects.forEach((subj, i) => {
    const group = buildSubjectCube(subj, i, subjects.length);
    scene.add(group);
    cubeGroups.set(subj.id, group);
  });

  buildGalaxyLinks(subjects);
}

function buildSubjectCube(subj, index, total) {
  const group = new THREE.Group();

  // Compute circle position (store sets it, but we use stored value)
  const [px, py, pz] = subj.position || [
    Math.cos((index / total) * Math.PI * 2) * (3 + total * 0.7),
    (index % 2 === 0 ? 0.4 : -0.4),
    Math.sin((index / total) * Math.PI * 2) * (3 + total * 0.7),
  ];
  group.position.set(px, py, pz);

  // Wireframe cube
  const geo   = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const edges = new THREE.EdgesGeometry(geo);
  const color = new THREE.Color(subj.color || '#8B5CF6');
  const mat   = new THREE.LineBasicMaterial({ color, linewidth: 1.5 });
  const wire  = new THREE.LineSegments(edges, mat);
  group.add(wire);

  // Glowing inner sphere
  const sphereGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const sphereMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
  const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
  group.add(sphere);

  // Invisible hit mesh
  const hitGeo  = new THREE.BoxGeometry(CUBE_SIZE * 1.1, CUBE_SIZE * 1.1, CUBE_SIZE * 1.1);
  const hitMat  = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.userData = { subjectId: subj.id, wire, mat, color: color.clone() };
  group.add(hitMesh);
  hitMeshes.push(hitMesh);

  // CSS2D Label
  const div = document.createElement('div');
  div.className = 'subject-label';
  div.innerHTML = `<div class="subject-label-inner" style="color:${subj.color}">${subj.label}</div>`;
  const label = new CSS2DObject(div);
  label.position.set(0, CUBE_SIZE * 0.75, 0);
  group.add(label);

  group.userData = { subjectId: subj.id };
  return group;
}

function buildGalaxyLinks(subjects) {
  const pairs = Store.getSubjectPairs();
  pairs.forEach(([aId, bId]) => {
    const ga = cubeGroups.get(aId);
    const gb = cubeGroups.get(bId);
    if (!ga || !gb) return;

    const points = [ga.position.clone(), gb.position.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: 0x6366f1, dashSize: 0.3, gapSize: 0.2,
      transparent: true, opacity: 0.5,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    scene.add(line);
    linkLines.push(line);
  });
}

/* ════════════════════════════════════════════
   INTERACTION
════════════════════════════════════════════ */
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
let   hovered   = null;

function getPointer(e, el) {
  const rect = el.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
}

function onGalaxyClick(e) {
  getPointer(e, renderer.domElement);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(hitMeshes);
  if (hits.length > 0) {
    const { subjectId } = hits[0].object.userData;
    controls.autoRotate = false;
    Router.goCube(subjectId);
  }
}

function onGalaxyHover(e) {
  getPointer(e, renderer.domElement);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(hitMeshes);

  if (hovered) {
    hovered.userData.mat.color.copy(hovered.userData.color);
    hovered = null;
    renderer.domElement.style.cursor = 'default';
  }

  if (hits.length > 0) {
    hovered = hits[0].object;
    hovered.userData.mat.color.set(HOVER_COLOR);
    renderer.domElement.style.cursor = 'pointer';
  }
}

/* ════════════════════════════════════════════
   LOOP + RESIZE
════════════════════════════════════════════ */
function startLoop() {
  if (animId !== null) return;
  function tick() {
    animId = requestAnimationFrame(tick);
    controls.update();
    stars.rotation.y += 0.00015;
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  tick();
}

function stopLoop() {
  if (animId !== null) cancelAnimationFrame(animId);
  animId = null;
}

function onGalaxyResize(container) {
  const W = container.clientWidth, H = container.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
  labelRenderer.setSize(W, H);
}

export { rebuildScene as refreshGalaxy };
