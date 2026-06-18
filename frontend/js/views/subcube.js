/* ═══════════════════════════════════════════
   SUBCUBE — unit interior (nodes inside unit)
   FIX: nodes spawn freely inside space, link mode works,
        free drag movement, cross-layer links
═══════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  getUnit, getNodes, createNode, deleteNode,
  getEdges, createEdge, deleteEdge,
  updateNode, PALETTE
} from '../core/store.js';
import { emit } from '../core/events.js';
import { openModal } from '../ui/modal.js';
import { openCrossLinkModal } from './cross-link.js';

let renderer, labelRenderer, scene, camera, controls, animId;
let _wsId=null, _subjectId=null, _unitId=null;
let nodeMeshes=[];
let edgeLines=[];
let linkMode=false;
let linkSource=null;
let dragging=null;
let dragPlane=new THREE.Plane();
let dragOffset=new THREE.Vector3();
let hovered=null;
let ctxTarget=null;
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();

export function initSubcube(wsId, subjectId, unitId) {
  _wsId=wsId; _subjectId=subjectId; _unitId=unitId;
  linkMode=false; linkSource=null;
  const container=document.getElementById('subcube-container');
  container.innerHTML='';
  nodeMeshes=[]; edgeLines=[];

  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(container.clientWidth,container.clientHeight);
  renderer.setClearColor(0x0A0B0E,1);
  container.appendChild(renderer.domElement);

  labelRenderer=new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth,container.clientHeight);
  labelRenderer.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none';
  container.appendChild(labelRenderer.domElement);

  scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x0A0B0E,0.02);

  camera=new THREE.PerspectiveCamera(60,container.clientWidth/container.clientHeight,0.1,200);
  camera.position.set(0,6,14);

  scene.add(new THREE.AmbientLight(0xffffff,0.6));
  const dL=new THREE.DirectionalLight(0xffffff,0.8);
  dL.position.set(5,10,5); scene.add(dL);

  // Unit boundary box
  const unit=getUnit(_unitId);
  if (unit) {
    const col=parseInt(unit.color.replace('#',''),16);
    const wireGeo=new THREE.BoxGeometry(14,10,14);
    const wire=new THREE.LineSegments(
      new THREE.EdgesGeometry(wireGeo),
      new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.15})
    );
    scene.add(wire);
    // glow corner dots
    const corners=[[-7,-5,-7],[-7,-5,7],[7,-5,-7],[7,-5,7],[-7,5,-7],[-7,5,7],[7,5,-7],[7,5,7]];
    corners.forEach(([x,y,z])=>{
      const dot=new THREE.Mesh(
        new THREE.SphereGeometry(0.12,8,8),
        new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.4})
      );
      dot.position.set(x,y,z);
      scene.add(dot);
    });
  }

  // Stars
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(400*3);
  for(let i=0;i<400*3;i++) pos[i]=(Math.random()-0.5)*150;
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0x4B4F66,size:0.1,transparent:true,opacity:0.5})));

  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;
  controls.dampingFactor=0.07;
  controls.minDistance=2;
  controls.maxDistance=40;

  rebuildSubcubeScene();

  renderer.domElement.addEventListener('pointermove',onPointerMove);
  renderer.domElement.addEventListener('pointerdown',onPointerDown);
  renderer.domElement.addEventListener('pointerup',onPointerUp);
  renderer.domElement.addEventListener('click',onClick);
  renderer.domElement.addEventListener('contextmenu',onContextMenu);
  window.addEventListener('resize',onResize);

  if(animId) cancelAnimationFrame(animId);
  animate();
}

export function rebuildSubcubeScene() {
  nodeMeshes.forEach(n=>scene.remove(n.group));
  edgeLines.forEach(l=>scene.remove(l));
  nodeMeshes=[]; edgeLines=[];

  // FIX: scope nodes to this specific unitId — they should NOT appear in other units
  const nodes=getNodes(_subjectId,_unitId);
  nodes.forEach((node,idx)=>{
    // FIX: nodes spawn spread out in 3D space, NOT attached to origin
    const defaultPos = {
      x: (Math.random()-0.5)*10,
      y: (Math.random()-0.5)*6,
      z: (Math.random()-0.5)*10
    };
    const p=node.pos || defaultPos;
    addNodeMesh(node, new THREE.Vector3(p.x,p.y,p.z));
  });
  rebuildEdgeLines();
}

function addNodeMesh(node,pos) {
  const col=parseInt(node.color.replace('#',''),16);
  const group=new THREE.Group();
  // FIX: Use the node's actual stored position, not origin
  group.position.copy(pos);

  const geo=new THREE.SphereGeometry(0.6,24,24);
  const mat=new THREE.MeshStandardMaterial({
    color:col,roughness:0.2,metalness:0.6,
    emissive:col,emissiveIntensity:0.3
  });
  const mesh=new THREE.Mesh(geo,mat);
  group.add(mesh);

  // Glow halo
  const haloGeo=new THREE.RingGeometry(0.72,0.86,32);
  const haloMat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.25,side:THREE.DoubleSide});
  const halo=new THREE.Mesh(haloGeo,haloMat);
  halo.rotation.x=-Math.PI/2;
  group.add(halo);

  const div=document.createElement('div');
  div.className='node-label';
  div.innerHTML=`<div class="node-label-inner">${node.name}</div>`;
  const lbl=new CSS2DObject(div);
  lbl.position.set(0,1.0,0);
  group.add(lbl);

  group.userData={nodeId:node.id,type:'node',color:col};
  mesh.userData={nodeId:node.id,type:'node',color:col};
  scene.add(group);
  nodeMeshes.push({group,mesh,nodeId:node.id});
}

function rebuildEdgeLines() {
  edgeLines.forEach(l=>scene.remove(l));
  edgeLines=[];
  // FIX: scope edges to this unit
  const edges=getEdges(_subjectId,_unitId);
  edges.forEach(edge=>{
    const fromM=nodeMeshes.find(m=>m.nodeId===edge.fromNodeId);
    const toM=nodeMeshes.find(m=>m.nodeId===edge.toNodeId);
    if(!fromM||!toM) return;
    const points=[fromM.group.position.clone(),toM.group.position.clone()];
    const geo=new THREE.BufferGeometry().setFromPoints(points);
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xA78BFA,transparent:true,opacity:0.75}));
    line.userData={edgeId:edge.id};
    scene.add(line);
    edgeLines.push(line);
  });
}

function animate() {
  animId=requestAnimationFrame(animate);
  if(!renderer||!scene||!camera) return;
  const t=Date.now()*0.001;
  nodeMeshes.forEach((n,i)=>{
    n.group.position.y+=Math.sin(t*1.2+i*1.5)*0.0008;
    const active=linkMode&&n.nodeId===linkSource;
    if(n.mesh===hovered||active) {
      n.mesh.material.emissiveIntensity=0.7+Math.sin(t*5)*0.2;
      n.group.scale.setScalar(1.15);
    } else {
      n.mesh.material.emissiveIntensity=0.3;
      n.group.scale.setScalar(1);
    }
  });
  controls.update();
  renderer.render(scene,camera);
  labelRenderer.render(scene,camera);
}

function getPointerNDC(e) {
  const rect=renderer.domElement.getBoundingClientRect();
  return {
    x:((e.clientX-rect.left)/rect.width)*2-1,
    y:-((e.clientY-rect.top)/rect.height)*2+1
  };
}
function getIntersected(e,meshList) {
  const n=getPointerNDC(e);
  pointer.set(n.x,n.y);
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(meshList,false);
  return hits.length?hits[0]:null;
}

let _mouseDownPos=null;
function onPointerDown(e) {
  if(e.button!==0) return;
  _mouseDownPos={x:e.clientX,y:e.clientY};
  if(linkMode) return;
  const hit=getIntersected(e,nodeMeshes.map(n=>n.mesh));
  if(!hit) return;
  const entry=nodeMeshes.find(n=>n.mesh===hit.object);
  if(!entry) return;
  e.stopPropagation();
  dragging=entry;
  controls.enabled=false;
  const normal=new THREE.Vector3().subVectors(camera.position,entry.group.position).normalize();
  dragPlane.setFromNormalAndCoplanarPoint(normal,entry.group.position);
  const ndc=getPointerNDC(e);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera);
  const ip=new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane,ip);
  dragOffset.subVectors(ip,entry.group.position);
}

function onPointerMove(e) {
  const hit=getIntersected(e,nodeMeshes.map(n=>n.mesh));
  hovered=hit?hit.object:null;
  renderer.domElement.style.cursor=hovered?'pointer':'default';
  if(dragging) {
    controls.enabled=false;
    const ndc=getPointerNDC(e);
    raycaster.setFromCamera(new THREE.Vector2(ndc.x,ndc.y),camera);
    const target=new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane,target);
    dragging.group.position.copy(target.sub(dragOffset));
    const p=dragging.group.position;
    updateNode(dragging.nodeId,{pos:{x:p.x,y:p.y,z:p.z}});
    rebuildEdgeLines();
  }
}
function onPointerUp() {
  dragging=null;
  controls.enabled=true;
}

function onClick(e) {
  if(_mouseDownPos) {
    const dx=e.clientX-_mouseDownPos.x,dy=e.clientY-_mouseDownPos.y;
    if(Math.sqrt(dx*dx+dy*dy)>5) return;
  }
  const hit=getIntersected(e,nodeMeshes.map(n=>n.mesh));
  if(!hit) return;
  const obj=hit.object;
  if(linkMode) {
    if(!obj.userData.nodeId||obj.userData.nodeId===linkSource) return;
    createEdge(_wsId,_subjectId,_unitId,linkSource,obj.userData.nodeId,'');
    setSubLinkMode(false);
    rebuildEdgeLines();
    return;
  }
  if(obj.userData.nodeId) {
    emit('nav:node',{wsId:_wsId,subjectId:_subjectId,unitId:_unitId,nodeId:obj.userData.nodeId});
  }
}

function onContextMenu(e) {
  e.preventDefault();
  if(dragging) return;
  const hit=getIntersected(e,nodeMeshes.map(n=>n.mesh));
  if(!hit) return;
  ctxTarget=hit.object.userData;
  showCtxMenu(e.clientX,e.clientY);
}
function showCtxMenu(x,y) {
  const menu=document.getElementById('ctxMenu');
  menu.style.cssText=`display:block;left:${x}px;top:${y}px`;
  menu.innerHTML=`
    <div class="ctx-item" id="ctxOpen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
      Open Node
    </div>
    <div class="ctx-item" id="ctxLink">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      Link Node
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
  menu.querySelector('#ctxOpen').onclick=()=>{
    hideCtxMenu();
    emit('nav:node',{wsId:_wsId,subjectId:_subjectId,unitId:_unitId,nodeId:ctxTarget.nodeId});
  };
  menu.querySelector('#ctxLink').onclick=()=>{
    hideCtxMenu();
    setSubLinkMode(true,ctxTarget.nodeId);
  };
  menu.querySelector('#ctxCrossLink').onclick=()=>{
    hideCtxMenu();
    openCrossLinkModal(_wsId,ctxTarget.nodeId,()=>{});
  };
  menu.querySelector('#ctxDelete').onclick=()=>{
    hideCtxMenu();
    openModal({
      title:'Delete Node',
      body:`<p style="color:var(--text-muted);font-size:13px">Delete this node and its connections?</p>`,
      confirmText:'Delete',confirmDanger:true,
      onConfirm:()=>{deleteNode(ctxTarget.nodeId);rebuildSubcubeScene();}
    });
  };
}
function hideCtxMenu(){document.getElementById('ctxMenu').style.display='none';}

export function setSubLinkMode(active,sourceNodeId) {
  linkMode=active;
  linkSource=sourceNodeId||null;
  const banner=document.getElementById('subcubeLinkBanner');
  if(banner) banner.style.display=active?'flex':'none';
}

export function openAddSubNodeModal(wsId,subjectId,unitId) {
  let chosenColor=PALETTE[Math.floor(Math.random()*PALETTE.length)];
  const swatches=PALETTE.map(c=>
    `<button class="color-swatch${c===chosenColor?' selected':''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  openModal({
    title:'Add Node',
    body:`
      <div class="form-group">
        <label class="form-label">Node Name</label>
        <input class="form-input" id="snodeNameInput" placeholder="e.g. Key Concept" autofocus/>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatch-grid">${swatches}</div>
      </div>`,
    confirmText:'Add Node',
    onConfirm:()=>{
      const name=document.getElementById('snodeNameInput')?.value?.trim();
      if(!name) return false;
      // FIX: random spread position so nodes aren't stacked at origin
      const pos={
        x:(Math.random()-0.5)*10,
        y:(Math.random()-0.5)*5,
        z:(Math.random()-0.5)*10
      };
      createNode(wsId,subjectId,unitId,name,chosenColor,pos);
      rebuildSubcubeScene();
    }
  });
  setTimeout(()=>{
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.color-swatch[data-color]').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        chosenColor=btn.dataset.color;
      });
    });
  },0);
}

function onResize() {
  const c=document.getElementById('subcube-container');
  if(!c||!renderer) return;
  camera.aspect=c.clientWidth/c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth,c.clientHeight);
  labelRenderer.setSize(c.clientWidth,c.clientHeight);
}

export function destroySubcube() {
  if(animId) { cancelAnimationFrame(animId); animId = null; }
  if(renderer) { renderer.dispose(); renderer = null; }
  labelRenderer = null;
  scene = null; camera = null; controls = null;
  nodeMeshes=[]; edgeLines=[];
  linkMode=false; linkSource=null; dragging=null; hovered=null;
  const c=document.getElementById('subcube-container');
  if(c) c.innerHTML='';
  window.removeEventListener('resize',onResize);
}
