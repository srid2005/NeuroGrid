// galaxy.js v2 — Light theme, shaded cube faces, CRUD context menu
import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';
import { openAddSubjectModal, openEditSubjectModal, openConfirmModal } from '../ui/modal.js';

let scene, camera, renderer, labelRenderer, controls;
let animId=null, cubeGroups=new Map(), hitMeshes=[], linkLines=[];
let hovered=null;
const CS=1.2; // cube size

export function initGalaxy(container, workspaceId) {
  if(renderer){ destroyGalaxy(); }

  // Scene — light background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xF0F1F3);
  scene.fog = new THREE.FogExp2(0xF0F1F3, 0.012);

  // Floating particles
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(3000);
  for(let i=0;i<3000;i++) pPos[i]=(Math.random()-0.5)*80;
  pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({color:0xC4C4CC,size:0.06,transparent:true,opacity:0.7})));

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff,0.8));
  const dl = new THREE.DirectionalLight(0xffffff,0.6);
  dl.position.set(10,20,15); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0x8888ff,0.3);
  dl2.position.set(-10,-5,-15); scene.add(dl2);

  const W=container.clientWidth, H=container.clientHeight;
  camera = new THREE.PerspectiveCamera(55,W/H,0.1,300);
  camera.position.set(0,5,18);

  renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setSize(W,H); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  container.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W,H);
  labelRenderer.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none;';
  container.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.06;
  controls.minDistance=4; controls.maxDistance=60;
  controls.autoRotate=true; controls.autoRotateSpeed=0.35;

  rebuildGalaxy(workspaceId);

  renderer.domElement.addEventListener('click', e=>onGalaxyClick(e,workspaceId));
  renderer.domElement.addEventListener('mousemove', onGalaxyHover);
  renderer.domElement.addEventListener('contextmenu', e=>onGalaxyCtx(e,workspaceId));
  window.addEventListener('resize',()=>onResize(container));
  Events.on('subjects:changed', ()=>rebuildGalaxy(workspaceId));

  startLoop();
}

export function destroyGalaxy() {
  stopLoop();
  Events.off('subjects:changed',()=>{});
  cubeGroups.clear(); hitMeshes=[]; linkLines=[];
}

/* ── Build scene ───────────────────────────── */
function rebuildGalaxy(workspaceId) {
  cubeGroups.forEach(g=>scene.remove(g));
  cubeGroups.clear(); hitMeshes=[]; linkLines.forEach(l=>scene.remove(l)); linkLines=[];
  const subjects = Store.getSubjects(workspaceId);
  subjects.forEach(s=>{ const g=buildCube(s); scene.add(g); cubeGroups.set(s.id,g); });
  buildLinks();
}

function buildCube(subj) {
  const group = new THREE.Group();
  const [px,py,pz] = subj.position||[0,0,0];
  group.position.set(px,py,pz);

  const color = new THREE.Color(subj.color||'#7C3AED');

  // Shaded faces (6 materials, different opacity per face for depth)
  const faceGeo = new THREE.BoxGeometry(CS,CS,CS);
  const faceOpacities = [0.20, 0.12, 0.28, 0.08, 0.22, 0.14]; // +x,-x,+y,-y,+z,-z
  const faceMats = faceOpacities.map(o=>
    new THREE.MeshLambertMaterial({color, transparent:true, opacity:o, side:THREE.FrontSide})
  );
  group.add(new THREE.Mesh(faceGeo, faceMats));

  // Wireframe edges
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CS,CS,CS));
  const edgeMat = new THREE.LineBasicMaterial({color, linewidth:1.5});
  const wire    = new THREE.LineSegments(edgeGeo, edgeMat);
  group.add(wire);

  // Center glow sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.15,16,16),
    new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.8})
  );
  group.add(sphere);

  // Invisible hit mesh
  const hitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(CS*1.15,CS*1.15,CS*1.15),
    new THREE.MeshBasicMaterial({visible:false})
  );
  hitMesh.userData = {subjectId:subj.id, wire, edgeMat, origColor:color.clone()};
  group.add(hitMesh); hitMeshes.push(hitMesh);

  // Label
  const div = document.createElement('div');
  div.className='subject-label';
  div.innerHTML=`<div class="subject-label-inner" style="color:${subj.color}">${subj.label}<span style="font-weight:400;margin-left:4px;color:#71717A;font-size:9px">${subj.name}</span></div>`;
  const lbl = new CSS2DObject(div);
  lbl.position.set(0,CS*0.82,0); group.add(lbl);

  group.userData={subjectId:subj.id};
  return group;
}

function buildLinks() {
  Store.getSubjectPairs().forEach(([aId,bId])=>{
    const ga=cubeGroups.get(aId), gb=cubeGroups.get(bId);
    if(!ga||!gb) return;
    const pts=[ga.position.clone(),gb.position.clone()];
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    const mat=new THREE.LineDashedMaterial({color:0x7C3AED,dashSize:0.35,gapSize:0.2,transparent:true,opacity:0.35});
    const ln=new THREE.Line(geo,mat); ln.computeLineDistances();
    scene.add(ln); linkLines.push(ln);
  });
}

/* ── Interaction ───────────────────────────── */
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
function getPtr(e,el){ const r=el.getBoundingClientRect(); mouse.x=((e.clientX-r.left)/r.width)*2-1; mouse.y=-((e.clientY-r.top)/r.height)*2+1; }

function onGalaxyClick(e, workspaceId) {
  getPtr(e,renderer.domElement); raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(hitMeshes);
  if(hits.length>0){ controls.autoRotate=false; Router.goCube(hits[0].object.userData.subjectId); }
}

function onGalaxyHover(e) {
  getPtr(e,renderer.domElement); raycaster.setFromCamera(mouse,camera);
  if(hovered){ hovered.userData.edgeMat.color.copy(hovered.userData.origColor); hovered=null; renderer.domElement.style.cursor='default'; }
  const hits=raycaster.intersectObjects(hitMeshes);
  if(hits.length>0){ hovered=hits[0].object; hovered.userData.edgeMat.color.set(0x000000); renderer.domElement.style.cursor='pointer'; }
}

function onGalaxyCtx(e, workspaceId) {
  e.preventDefault();
  getPtr(e,renderer.domElement); raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(hitMeshes);
  const subjectId = hits.length>0 ? hits[0].object.userData.subjectId : null;

  const items = subjectId ? [
    {icon:'✏️', label:'Edit Subject',  action:()=>openEditSubjectModal(subjectId)},
    {sep:true},
    {icon:'🗑️', label:'Delete Subject', danger:true, action:()=>openConfirmModal({
      title:'Delete Subject', confirmText:'Delete',
      message:`Delete "<b>${Store.getSubject(subjectId)?.name}</b>"? All units and nodes inside will also be removed.`,
      onConfirm:()=>{ Store.deleteSubject(subjectId); Events.emit('subjects:changed'); }
    })},
  ] : [
    {icon:'➕', label:'Add Subject', action:()=>openAddSubjectModal(workspaceId)},
  ];
  showCtxMenu(e.clientX, e.clientY, items);
}

/* ── Loop ──────────────────────────────────── */
function startLoop() {
  if(animId!==null) return;
  function tick(){ animId=requestAnimationFrame(tick); controls.update(); renderer.render(scene,camera); labelRenderer.render(scene,camera); }
  tick();
}
function stopLoop() { if(animId!==null) cancelAnimationFrame(animId); animId=null; }
function onResize(c) { const W=c.clientWidth,H=c.clientHeight; camera.aspect=W/H; camera.updateProjectionMatrix(); renderer.setSize(W,H); labelRenderer.setSize(W,H); }

/* ── Context menu helper ───────────────────── */
function showCtxMenu(x,y,items) {
  const el=document.getElementById('ctxMenu');
  el.innerHTML=items.map((it,i)=>it.sep?`<div class="ctx-sep"></div>`:
    `<div class="ctx-item${it.danger?' danger':''}" data-i="${i}">${it.icon||''} ${it.label}</div>`
  ).join('');
  el.style.display='block'; el.style.left=`${Math.min(x,window.innerWidth-180)}px`; el.style.top=`${Math.min(y,window.innerHeight-100)}px`;
  el.querySelectorAll('.ctx-item').forEach(el2=>{ const i=+el2.dataset.i; if(!isNaN(i)&&items[i]) el2.addEventListener('click',()=>{items[i].action?.(); el.style.display='none';}); });
}

export {rebuildGalaxy};
