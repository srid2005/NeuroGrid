// subcube.js — Unit sub-cube interior (nodes only)
import * as THREE from 'three';
import { OrbitControls }    from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';
import { openAddNodeModal, openEditNodeModal, openConfirmModal } from '../ui/modal.js';

let scene, camera, renderer, labelRenderer, controls;
let animId=null, nodeMeshes=[], edgeMidMeshes=[];
let linkMode=false, linkFirst=null;
const UH=0.8;

export function initSubcube(container, unitId) {
  if(renderer) destroySubcube();
  container.innerHTML='';

  const unit = Store.getUnit(unitId);
  const subj = Store.getSubject(unit?.subjectId);
  if(!unit||!subj) return;

  scene=new THREE.Scene(); scene.background=new THREE.Color(0xF2F2F4);
  scene.fog=new THREE.FogExp2(0xF2F2F4,0.05);
  scene.add(new THREE.AmbientLight(0xffffff,0.9));
  const dl=new THREE.DirectionalLight(0xffffff,0.5); dl.position.set(4,6,4); scene.add(dl);

  const W=container.clientWidth||window.innerWidth, H=container.clientHeight||(window.innerHeight-52);
  camera=new THREE.PerspectiveCamera(55,W/H,0.01,100); camera.position.set(0,0.3,2.8);

  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(W,H); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  container.appendChild(renderer.domElement);

  labelRenderer=new CSS2DRenderer(); labelRenderer.setSize(W,H);
  labelRenderer.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none;';
  container.appendChild(labelRenderer.domElement);

  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=0.07; controls.minDistance=1; controls.maxDistance=5;

  _buildSubScene(unit, subj);

  renderer.domElement.addEventListener('click', e=>onSubClick(e,unitId,subj));
  renderer.domElement.addEventListener('contextmenu', e=>onSubCtx(e,unitId,subj));
  window.addEventListener('resize',()=>{ const W2=container.clientWidth,H2=container.clientHeight; camera.aspect=W2/H2; camera.updateProjectionMatrix(); renderer.setSize(W2,H2); labelRenderer.setSize(W2,H2); });
  Events.on('nodes:changed',()=>rebuildSubScene(unit,subj));
  startLoop();
}

function _buildSubScene(unit, subj) {
  nodeMeshes=[]; edgeMidMeshes=[];
  const color=new THREE.Color(unit.color||subj.color||'#7C3AED');

  // Sub-cube shell
  const fGeo=new THREE.BoxGeometry(UH*2,UH*2,UH*2);
  const fMats=[0.18,0.10,0.24,0.06,0.20,0.12].map(o=>new THREE.MeshLambertMaterial({color,transparent:true,opacity:o,side:THREE.FrontSide}));
  scene.add(new THREE.Mesh(fGeo,fMats));
  scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(UH*2,UH*2,UH*2)),
    new THREE.LineBasicMaterial({color,transparent:true,opacity:0.45})
  ));
  scene.add(new THREE.GridHelper(UH*2,6,0xCCCCCC,0xDDDDDD));

  // Subject label at top
  const div=document.createElement('div'); div.className='subject-label';
  div.innerHTML=`<div class="subject-label-inner" style="color:${subj.color}">${unit.name}</div>`;
  const lbl=new CSS2DObject(div); lbl.position.set(0,UH+0.15,0); scene.add(lbl);

  // Nodes
  Store.getNodes({unitId:unit.id}).forEach(n=>addNodeMesh(n,unit.color||subj.color));
  // Edges between nodes in this unit
  Store.getUnitEdges(unit.id).forEach(e=>drawEdgeLine(e,subj));
}

function addNodeMesh(node,color) {
  const [x,y,z]=node.position||[0,0,0];
  const sc=0.55; // scale positions to fit inside smaller cube
  const c=new THREE.Color(color);
  const mesh=new THREE.Mesh(
    new THREE.SphereGeometry(0.08,20,20),
    new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:0.2,roughness:0.4,metalness:0.05})
  );
  mesh.position.set(x*sc,y*sc,z*sc); mesh.userData={nodeId:node.id};

  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.125,0.007,8,32),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:0.4}));
  ring.rotation.x=Math.PI/2; mesh.add(ring);

  const div=document.createElement('div'); div.className='node-label';
  div.innerHTML=`<div class="node-label-inner">${node.label}</div>`;
  const l=new CSS2DObject(div); l.position.set(0,0.2,0); mesh.add(l);
  scene.add(mesh); nodeMeshes.push({mesh,nodeId:node.id});
}

function drawEdgeLine(edge,subj) {
  const fn=Store.getNode(edge.fromId), tn=Store.getNode(edge.toId);
  if(!fn||!tn) return;
  const sc=0.55;
  const pts=[
    new THREE.Vector3(...(fn.position||[0,0,0]).map(v=>v*sc)),
    new THREE.Vector3(...(tn.position||[0,0,0]).map(v=>v*sc)),
  ];
  const mat=new THREE.LineBasicMaterial({color:new THREE.Color(subj.color),transparent:true,opacity:0.55});
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat));

  const mid=new THREE.Vector3().addVectors(pts[0],pts[1]).multiplyScalar(0.5);
  const msh=new THREE.Mesh(new THREE.SphereGeometry(0.05,8,8),new THREE.MeshBasicMaterial({visible:false}));
  msh.position.copy(mid); msh.userData={edgeId:edge.id};
  scene.add(msh); edgeMidMeshes.push({mesh:msh,edgeId:edge.id});
}

const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
function getPtr(e){ const r=renderer.domElement.getBoundingClientRect(); mouse.x=((e.clientX-r.left)/r.width)*2-1; mouse.y=-((e.clientY-r.top)/r.height)*2+1; }

function onSubClick(e,unitId,subj) {
  getPtr(e); raycaster.setFromCamera(mouse,camera);
  const allM=[...nodeMeshes.map(n=>n.mesh),...edgeMidMeshes.map(m=>m.mesh)];
  const hits=raycaster.intersectObjects(allM);
  if(!hits.length) return;
  const obj=hits[0].object;

  if(linkMode) {
    const nm=nodeMeshes.find(n=>n.mesh===obj);
    if(!nm) return;
    if(!linkFirst){ linkFirst=nm.nodeId; obj.material.emissiveIntensity=0.9; }
    else if(nm.nodeId!==linkFirst){ Events.emit('linkmode:second',{fromId:linkFirst,toId:nm.nodeId,subjectId:subj.id}); exitSubLinkMode(); }
    return;
  }
  const nm=nodeMeshes.find(n=>n.mesh===obj);
  if(nm){ Router.goNodeWb(nm.nodeId); return; }
  const em=edgeMidMeshes.find(m=>m.mesh===obj);
  if(em){ Router.goEdgeWb(em.edgeId); }
}

function onSubCtx(e,unitId,subj) {
  e.preventDefault(); getPtr(e); raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(nodeMeshes.map(n=>n.mesh));
  const nm=hits.length?nodeMeshes.find(n=>n.mesh===hits[0].object):null;

  const items=nm ? [
    {icon:'📄',label:'Open Whiteboard',action:()=>Router.goNodeWb(nm.nodeId)},
    {icon:'✏️',label:'Edit Node',action:()=>openEditNodeModal(nm.nodeId)},
    {sep:true},
    {icon:'🗑️',label:'Delete Node',danger:true,action:()=>openConfirmModal({
      title:'Delete Node',confirmText:'Delete',
      message:`Delete "<b>${Store.getNode(nm.nodeId)?.label}</b>"?`,
      onConfirm:()=>{ Store.deleteNode(nm.nodeId); Events.emit('nodes:changed',{unitId}); }
    })},
  ] : [
    {icon:'➕',label:'Add Node Here',action:()=>openAddNodeModal({subjectId:subj.id,unitId})},
  ];
  showCtxMenu(e.clientX,e.clientY,items);
}

function showCtxMenu(x,y,items) {
  const el=document.getElementById('ctxMenu');
  el.innerHTML=items.map((it,i)=>it.sep?'<div class="ctx-sep"></div>':`<div class="ctx-item${it.danger?' danger':''}" data-i="${i}">${it.icon||''} ${it.label}</div>`).join('');
  el.style.display='block'; el.style.left=`${Math.min(x,window.innerWidth-180)}px`; el.style.top=`${Math.min(y,window.innerHeight-100)}px`;
  el.querySelectorAll('.ctx-item').forEach(el2=>{ const i=+el2.dataset.i; if(!isNaN(i)&&items[i]) el2.addEventListener('click',()=>{items[i].action?.(); el.style.display='none';}); });
}

export function enterSubLinkMode(){ linkMode=true; linkFirst=null; }
export function exitSubLinkMode(){ linkMode=false; linkFirst=null; Events.emit('linkmode:exit'); }

function startLoop() {
  if(animId!==null) return;
  function tick(){ animId=requestAnimationFrame(tick); controls.update(); renderer.render(scene,camera); labelRenderer.render(scene,camera); }
  tick();
}
function stopLoop(){ if(animId!==null) cancelAnimationFrame(animId); animId=null; }

function rebuildSubScene(unit,subj){ nodeMeshes=[]; edgeMidMeshes=[]; while(scene.children.length) scene.remove(scene.children[0]); _buildSubScene(unit,subj); }
export function destroySubcube(){ stopLoop(); Events.off('nodes:changed',()=>{}); if(renderer){ renderer.dispose(); } }
