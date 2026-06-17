// cube.js v2 — Sub-cubes (units), fixed node positioning, cross-cube linking, context menu
import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';
import { openAddNodeModal, openAddUnitModal, openEditNodeModal, openConfirmModal, openCrossLinkModal } from '../ui/modal.js';

let scene, camera, renderer, labelRenderer, controls;
let animId=null, nodeMeshes=[], unitMeshes=[], edgeMidMeshes=[];
let linkMode=false, linkFirst=null;
const CH=1.0; // cube half

export function initCube(container, subjectId) {
  if(renderer) destroyCube();
  container.innerHTML='';
  _buildScene(container, subjectId);
}

function _buildScene(container, subjectId) {
  scene=new THREE.Scene(); scene.background=new THREE.Color(0xF0F1F3);
  scene.fog=new THREE.FogExp2(0xF2F2F4,0.04);

  scene.add(new THREE.AmbientLight(0xffffff,0.9));
  const dl=new THREE.DirectionalLight(0xffffff,0.5); dl.position.set(5,8,5); scene.add(dl);
  const dl2=new THREE.DirectionalLight(0xaaaaff,0.25); dl2.position.set(-5,-4,-8); scene.add(dl2);

  const W=container.clientWidth||window.innerWidth, H=container.clientHeight||(window.innerHeight-52);
  camera=new THREE.PerspectiveCamera(55,W/H,0.01,100); camera.position.set(0,0.5,3.5);

  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(W,H); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  container.appendChild(renderer.domElement);

  labelRenderer=new CSS2DRenderer(); labelRenderer.setSize(W,H);
  labelRenderer.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none;';
  container.appendChild(labelRenderer.domElement);

  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=0.07; controls.minDistance=1.2; controls.maxDistance=7;

  _populateScene(subjectId);

  renderer.domElement.addEventListener('click', e=>onCubeClick(e,subjectId));
  renderer.domElement.addEventListener('contextmenu', e=>onCubeCtx(e,subjectId));
  window.addEventListener('resize',()=>onCubeResize(container));
  Events.on('nodes:changed',()=>rebuildCubeScene(subjectId));
  startCubeLoop();
}

function _populateScene(subjectId) {
  nodeMeshes=[]; unitMeshes=[]; edgeMidMeshes=[];
  const subj = Store.getSubject(subjectId);
  if(!subj) return;
  const color = new THREE.Color(subj.color||'#7C3AED');

  // Outer cube shell (shaded faces)
  const faceGeo=new THREE.BoxGeometry(CH*2,CH*2,CH*2);
  const fOps=[0.14,0.08,0.20,0.05,0.16,0.10];
  const fMats=fOps.map(o=>new THREE.MeshLambertMaterial({color,transparent:true,opacity:o,side:THREE.FrontSide}));
  scene.add(new THREE.Mesh(faceGeo,fMats));

  // Wireframe outer shell
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CH*2,CH*2,CH*2)),
    new THREE.LineBasicMaterial({color,transparent:true,opacity:0.4})
  ));

  // Grid floor
  const grid=new THREE.GridHelper(CH*2,8,0xCCCCCC,0xDDDDDD);
  grid.position.y=-CH; scene.add(grid);

  // Unit sub-cubes
  Store.getUnits(subjectId).forEach(u=>addUnitMesh(u));

  // Direct nodes (not in any unit)
  Store.getNodes({subjectId, unitId:null}).forEach(n=>addNodeMesh(n,subj.color));

  // Ghost nodes + edge lines
  Store.getSubjectEdges(subjectId).forEach(e=>drawEdgeLine(e,subj,true));
}

/* ── Unit sub-cube ─────────────────────────── */
function addUnitMesh(unit) {
  const [x,y,z]=unit.position||[0,0,0];
  const color=new THREE.Color(unit.color||'#7C3AED');
  const US=0.36; // unit sub-cube size

  const group=new THREE.Group(); group.position.set(x,y,z);

  // Shaded faces
  const fGeo=new THREE.BoxGeometry(US,US,US);
  const fMats=[0.22,0.14,0.30,0.10,0.25,0.18].map(o=>new THREE.MeshLambertMaterial({color,transparent:true,opacity:o}));
  group.add(new THREE.Mesh(fGeo,fMats));

  // Wireframe
  const wMat=new THREE.LineBasicMaterial({color,linewidth:1.5});
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(US,US,US)),wMat));

  // Hit mesh
  const hitMesh=new THREE.Mesh(new THREE.BoxGeometry(US*1.2,US*1.2,US*1.2),new THREE.MeshBasicMaterial({visible:false}));
  hitMesh.userData={unitId:unit.id, wMat, origColor:color.clone()};
  group.add(hitMesh); unitMeshes.push({mesh:hitMesh,unitId:unit.id});

  // Node count badge
  const nodeCount=Store.getNodes({subjectId:unit.subjectId,unitId:unit.id}).length;
  const div=document.createElement('div'); div.className='unit-label';
  div.innerHTML=`<div class="unit-label-inner" style="color:${unit.color}">${unit.name}<span style="opacity:0.6;font-size:9px;margin-left:3px">(${nodeCount})</span></div>`;
  const lbl=new CSS2DObject(div); lbl.position.set(0,US*0.85,0); group.add(lbl);

  scene.add(group);
}

/* ── Node sphere ───────────────────────────── */
function addNodeMesh(node,subjectColor) {
  const [x,y,z]=node.position||[0,0,0];
  const color=new THREE.Color(subjectColor||'#7C3AED');
  const geo=new THREE.SphereGeometry(0.09,20,20);
  const mat=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.2,roughness:0.4,metalness:0.05});
  const mesh=new THREE.Mesh(geo,mat); mesh.position.set(x,y,z);
  mesh.userData={nodeId:node.id};

  // Orbit ring
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.145,0.007,8,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.4}));
  ring.rotation.x=Math.PI/2; mesh.add(ring);

  // Label
  const div=document.createElement('div'); div.className='node-label';
  div.innerHTML=`<div class="node-label-inner">${node.label}</div>`;
  const lbl=new CSS2DObject(div); lbl.position.set(0,0.22,0); mesh.add(lbl);

  scene.add(mesh); nodeMeshes.push({mesh,nodeId:node.id});
}

/* ── Ghost + Edge ──────────────────────────── */
function drawEdgeLine(edge,currentSubject,addGhosts) {
  const fn=Store.getNode(edge.fromId), tn=Store.getNode(edge.toId);
  if(!fn||!tn) return;
  const sIds=new Set(Store.getNodes({subjectId:currentSubject.id}).map(n=>n.id));
  if(!sIds.has(edge.fromId)&&!sIds.has(edge.toId)) return;

  const fPos=fn.position||[0,0,0];
  let   tPos=tn.position||[0,0,0];

  if(edge.isCross) {
    const clamped=clampSurface(...tPos); tPos=[clamped.x,clamped.y,clamped.z];
    if(addGhosts) {
      const gs=Store.getSubject(tn.subjectId);
      addGhostNode(tn, gs?.color||'#999', gs?.label||'?', clamped);
    }
  }

  const pts=[new THREE.Vector3(...fPos),new THREE.Vector3(...tPos)];
  const mat=edge.isCross
    ? new THREE.LineDashedMaterial({color:0xD97706,dashSize:0.07,gapSize:0.04,transparent:true,opacity:0.65})
    : new THREE.LineBasicMaterial({color:new THREE.Color(currentSubject.color),transparent:true,opacity:0.55});
  const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat);
  if(edge.isCross) ln.computeLineDistances();
  scene.add(ln);

  // Midpoint click sphere
  const mid=new THREE.Vector3((fPos[0]+tPos[0])/2,(fPos[1]+tPos[1])/2,(fPos[2]+tPos[2])/2);
  const midM=new THREE.Mesh(new THREE.SphereGeometry(0.055,8,8),new THREE.MeshBasicMaterial({visible:false}));
  midM.position.copy(mid); midM.userData={edgeId:edge.id};
  scene.add(midM); edgeMidMeshes.push({mesh:midM,edgeId:edge.id});
}

function addGhostNode(node,color,subjectLabel,pos) {
  const mesh=new THREE.Mesh(
    new THREE.SphereGeometry(0.065,12,12),
    new THREE.MeshStandardMaterial({color:new THREE.Color(color),transparent:true,opacity:0.3,wireframe:true})
  );
  mesh.position.set(pos.x,pos.y,pos.z);
  const div=document.createElement('div'); div.className='node-label';
  div.innerHTML=`<div class="node-label-inner" style="opacity:0.5;font-style:italic">${subjectLabel}</div>`;
  const lbl=new CSS2DObject(div); lbl.position.set(0,0.2,0); mesh.add(lbl);
  scene.add(mesh);
}

function clampSurface(x,y,z,s=CH*0.93){ return {x:Math.max(-s,Math.min(s,x)),y:Math.max(-s,Math.min(s,y)),z:Math.max(-s,Math.min(s,z))}; }

/* ── Click ─────────────────────────────────── */
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();

function onCubeClick(e, subjectId) {
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1; mouse.y=-((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const allMeshes=[...nodeMeshes.map(n=>n.mesh),...unitMeshes.map(u=>u.mesh),...edgeMidMeshes.map(m=>m.mesh)];
  const hits=raycaster.intersectObjects(allMeshes);
  if(!hits.length) return;
  const obj=hits[0].object;

  // Link mode
  if(linkMode) {
    const nm=nodeMeshes.find(n=>n.mesh===obj);
    if(!nm) return;
    if(!linkFirst) { linkFirst=nm.nodeId; obj.material.emissiveIntensity=0.9; Events.emit('linkmode:first',{nodeId:nm.nodeId}); }
    else if(nm.nodeId!==linkFirst) { Events.emit('linkmode:second',{fromId:linkFirst,toId:nm.nodeId,subjectId}); exitLinkMode(); }
    return;
  }

  // Normal
  const nm=nodeMeshes.find(n=>n.mesh===obj);
  if(nm) { Router.goNodeWb(nm.nodeId); return; }
  const um=unitMeshes.find(u=>u.mesh===obj);
  if(um) { Router.goSubcube(um.unitId); return; }
  const em=edgeMidMeshes.find(m=>m.mesh===obj);
  if(em) { Router.goEdgeWb(em.edgeId); }
}

function onCubeCtx(e, subjectId) {
  e.preventDefault();
  const r=renderer.domElement.getBoundingClientRect();
  mouse.x=((e.clientX-r.left)/r.width)*2-1; mouse.y=-((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects([...nodeMeshes.map(n=>n.mesh),...unitMeshes.map(u=>u.mesh)]);
  const obj=hits.length>0?hits[0].object:null;
  const nm=obj?nodeMeshes.find(n=>n.mesh===obj):null;
  const um=obj?unitMeshes.find(u=>u.mesh===obj):null;

  let items;
  if(nm) {
    const node=Store.getNode(nm.nodeId);
    items=[
      {icon:'📄',label:'Open Whiteboard',action:()=>Router.goNodeWb(nm.nodeId)},
      {icon:'✏️',label:'Edit Node',action:()=>openEditNodeModal(nm.nodeId)},
      {sep:true},
      {icon:'🗑️',label:'Delete Node',danger:true,action:()=>openConfirmModal({
        title:'Delete Node',confirmText:'Delete',
        message:`Delete "<b>${node?.label}</b>"? All connections will be removed.`,
        onConfirm:()=>{ Store.deleteNode(nm.nodeId); Events.emit('nodes:changed',{subjectId}); Events.emit('subjects:changed'); }
      })},
    ];
  } else if(um) {
    const unit=Store.getUnit(um.unitId);
    items=[
      {icon:'📦',label:'Open Unit',action:()=>Router.goSubcube(um.unitId)},
      {icon:'✏️',label:'Edit Unit',action:()=>openEditUnitModal(um.unitId)},
      {sep:true},
      {icon:'🗑️',label:'Delete Unit',danger:true,action:()=>openConfirmModal({
        title:'Delete Unit',confirmText:'Delete',
        message:`Delete unit "<b>${unit?.name}</b>"? All nodes inside will be removed.`,
        onConfirm:()=>{ Store.deleteUnit(um.unitId); Events.emit('nodes:changed',{subjectId}); }
      })},
    ];
  } else {
    items=[
      {icon:'➕',label:'Add Concept Node',action:()=>openAddNodeModal({subjectId,unitId:null})},
      {icon:'📦',label:'Add Unit (Sub-Cube)',action:()=>openAddUnitModal(subjectId)},
      {sep:true},
      {icon:'🔗',label:'Cross-Subject Link',action:()=>openCrossLinkModal(subjectId)},
    ];
  }
  showCtxMenu(e.clientX,e.clientY,items);
}

/* ── Link mode ─────────────────────────────── */
export function enterLinkMode() { linkMode=true; linkFirst=null; Events.emit('linkmode:enter'); }
export function exitLinkMode()  { linkMode=false; linkFirst=null; Events.emit('linkmode:exit'); }
export function resetCubeCamera() { camera?.position.set(0,0.5,3.5); controls?.reset(); }

/* ── Loop ──────────────────────────────────── */
function startCubeLoop() {
  if(animId!==null) return;
  function tick(){ animId=requestAnimationFrame(tick); controls.update(); renderer.render(scene,camera); labelRenderer.render(scene,camera); }
  tick();
}
function stopCubeLoop() { if(animId!==null) cancelAnimationFrame(animId); animId=null; }
function onCubeResize(c) { const W=c.clientWidth,H=c.clientHeight; camera.aspect=W/H; camera.updateProjectionMatrix(); renderer.setSize(W,H); labelRenderer.setSize(W,H); }

export function destroyCube() { stopCubeLoop(); Events.off('nodes:changed',()=>{}); }
export function rebuildCubeScene(sid) { nodeMeshes=[]; unitMeshes=[]; edgeMidMeshes=[]; while(scene.children.length) scene.remove(scene.children[0]); _populateScene(sid); }

/* ── Ctx helper ─────────────────────────────── */
function showCtxMenu(x,y,items) {
  const el=document.getElementById('ctxMenu');
  el.innerHTML=items.map((it,i)=>it.sep?`<div class="ctx-sep"></div>`:`<div class="ctx-item${it.danger?' danger':''}" data-i="${i}">${it.icon||''} ${it.label}</div>`).join('');
  el.style.display='block'; el.style.left=`${Math.min(x,window.innerWidth-190)}px`; el.style.top=`${Math.min(y,window.innerHeight-140)}px`;
  el.querySelectorAll('.ctx-item').forEach(el2=>{ const i=+el2.dataset.i; if(!isNaN(i)&&items[i]) el2.addEventListener('click',()=>{items[i].action?.(); el.style.display='none';}); });
}
