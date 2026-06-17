// store.js — Data layer v2: Workspaces → Subjects → Units → Nodes → Edges
const KEY = 'neurogrid_v2';

const COLORS = ['#7C3AED','#10B981','#6366F1','#F59E0B','#EF4444',
                '#EC4899','#14B8A6','#84CC16','#F97316','#06B6D4'];

/* ── Auto-position helpers ─────────────────── */
const GOLDEN_ANGLE = 2.399963229;

export function calcSubjectPosition(idx) {
  if (idx === 0) return [0, 0, 0];
  const angle  = idx * GOLDEN_ANGLE;
  const tier   = Math.floor(idx / 6);
  const radius = 4.5 + tier * 3.5;
  const y      = (idx % 5 - 2) * 1.3;
  return [+(Math.cos(angle)*radius).toFixed(3), +y.toFixed(3), +(Math.sin(angle)*radius).toFixed(3)];
}

export function calcUnitPosition(idx) {
  const UNIT_GRID = [
    [0,0,0],[0.45,0,0.1],[-0.45,0,-0.1],[0.1,0,0.45],[-0.1,0,-0.45],
    [0,0.35,0.3],[0,-0.35,-0.3],[0.4,0.3,-0.2],[-0.4,-0.3,0.2],
    [0.3,-0.3,0.35],[-0.3,0.3,-0.35],
  ];
  if (idx < UNIT_GRID.length) return [...UNIT_GRID[idx]];
  const a = idx * GOLDEN_ANGLE;
  return [+(Math.cos(a)*0.5).toFixed(3), +((idx%3-1)*0.25).toFixed(3), +(Math.sin(a)*0.5).toFixed(3)];
}

export function calcNodePosition(idx) {
  const PRESETS = [
    [0,0,0],[0.5,0.2,0.1],[-0.5,0.2,-0.1],[0.1,0.5,-0.2],[-0.1,-0.5,0.2],
    [0.4,-0.2,0.45],[-0.4,0.2,-0.45],[0,0.6,0.1],[0,-0.6,-0.1],
    [0.6,0,-0.3],[-0.6,0,0.3],[0.3,0.45,0.4],[-0.3,-0.45,-0.4],
    [0.45,-0.4,0.2],[-0.45,0.4,-0.2],[0.2,0.3,-0.6],[-0.2,-0.3,0.6],
    [0.55,0.35,0.2],[-0.55,-0.35,-0.2],[0.1,0.6,-0.35],[-0.1,-0.6,0.35],
  ];
  if (idx < PRESETS.length) return [...PRESETS[idx]];
  const level = Math.floor(idx/8);
  const a = idx * GOLDEN_ANGLE;
  const r = 0.55 + level*0.12;
  const y = Math.sin(idx*1.1)*(0.45+level*0.05);
  return [+(Math.cos(a)*r).toFixed(3), +y.toFixed(3), +(Math.sin(a)*r).toFixed(3)];
}

/* ── UUID ───────────────────────────────────── */
export function uuid() {
  return crypto.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0;
      return (c==='x'?r:(r&0x3|0x8)).toString(16);
    });
}

/* ── Storage ────────────────────────────────── */
let _d = null;
const makeDefault = () => ({ workspaces:{}, subjects:{}, units:{}, nodes:{}, edges:{} });

function load() {
  if (_d) return;
  try { _d = JSON.parse(localStorage.getItem(KEY)); } catch { _d = null; }
  if (!_d?.workspaces) _d = makeDefault();
}
function save() { localStorage.setItem(KEY, JSON.stringify(_d)); }

/* ════════════════════════════════════════════ */
const Store = {

  /* ── Workspaces ─────────────────────── */
  getWorkspaces() { load(); return Object.values(_d.workspaces); },
  getWorkspace(id) { load(); return _d.workspaces[id]||null; },
  addWorkspace({name, description='', color}) {
    load();
    const id = uuid();
    _d.workspaces[id] = { id, name, description, color: color||COLORS[Object.keys(_d.workspaces).length%COLORS.length], createdAt: Date.now() };
    save(); return _d.workspaces[id];
  },
  updateWorkspace(id, u) { load(); if(_d.workspaces[id]) { Object.assign(_d.workspaces[id],u); save(); } },
  deleteWorkspace(id) {
    load();
    Object.values(_d.subjects).filter(s=>s.workspaceId===id).forEach(s=>this.deleteSubject(s.id,false));
    delete _d.workspaces[id]; save();
  },

  /* ── Subjects ───────────────────────── */
  getSubjects(workspaceId=null) { load(); const all=Object.values(_d.subjects); return workspaceId?all.filter(s=>s.workspaceId===workspaceId):all; },
  getSubject(id) { load(); return _d.subjects[id]||null; },
  addSubject({workspaceId, name, label, color}) {
    load();
    const idx = Object.values(_d.subjects).filter(s=>s.workspaceId===workspaceId).length;
    const id  = uuid();
    _d.subjects[id] = { id, workspaceId, name, label:label||name.slice(0,4).toUpperCase(), color:color||COLORS[idx%COLORS.length], position:calcSubjectPosition(idx), createdAt:Date.now() };
    save(); return _d.subjects[id];
  },
  updateSubject(id,u) { load(); if(_d.subjects[id]){Object.assign(_d.subjects[id],u);save();} return _d.subjects[id]; },
  deleteSubject(id, doPersist=true) {
    load();
    Object.values(_d.units).filter(u=>u.subjectId===id).forEach(u=>this.deleteUnit(u.id,false));
    Object.values(_d.nodes).filter(n=>n.subjectId===id&&!n.unitId).forEach(n=>this.deleteNode(n.id,false));
    delete _d.subjects[id];
    if(doPersist) save();
  },

  /* ── Units (Sub-cubes) ──────────────── */
  getUnits(subjectId=null) { load(); const all=Object.values(_d.units); return subjectId?all.filter(u=>u.subjectId===subjectId):all; },
  getUnit(id) { load(); return _d.units[id]||null; },
  addUnit({subjectId, name, color}) {
    load();
    const idx = Object.values(_d.units).filter(u=>u.subjectId===subjectId).length;
    const subj = _d.subjects[subjectId];
    const id = uuid();
    _d.units[id] = { id, subjectId, name, color:color||subj?.color||COLORS[idx%COLORS.length], position:calcUnitPosition(idx), createdAt:Date.now() };
    save(); return _d.units[id];
  },
  updateUnit(id,u) { load(); if(_d.units[id]){Object.assign(_d.units[id],u);save();} return _d.units[id]; },
  deleteUnit(id, doPersist=true) {
    load();
    Object.values(_d.nodes).filter(n=>n.unitId===id).forEach(n=>this.deleteNode(n.id,false));
    delete _d.units[id];
    if(doPersist) save();
  },

  /* ── Nodes ──────────────────────────── */
  getNodes({subjectId=null, unitId=null}={}) {
    load();
    let all = Object.values(_d.nodes);
    if (subjectId) all = all.filter(n=>n.subjectId===subjectId);
    if (unitId !== undefined) all = all.filter(n=>n.unitId===unitId);
    return all;
  },
  getNode(id) { load(); return _d.nodes[id]||null; },
  addNode({subjectId, unitId=null, label, notes=''}) {
    load();
    const idx = Object.values(_d.nodes).filter(n=>n.subjectId===subjectId&&n.unitId===unitId).length;
    const id  = uuid();
    _d.nodes[id] = { id, subjectId, unitId, label, notes, position:calcNodePosition(idx), whiteboardData:null, createdAt:Date.now() };
    save(); return _d.nodes[id];
  },
  updateNode(id,u) { load(); if(_d.nodes[id]){Object.assign(_d.nodes[id],u);save();} return _d.nodes[id]; },
  deleteNode(id, doPersist=true) {
    load();
    Object.keys(_d.edges).forEach(eid=>{ const e=_d.edges[eid]; if(e.fromId===id||e.toId===id) delete _d.edges[eid]; });
    delete _d.nodes[id];
    if(doPersist) save();
  },

  /* ── Edges ──────────────────────────── */
  getEdges() { load(); return Object.values(_d.edges); },
  getEdge(id) { load(); return _d.edges[id]||null; },
  getNodeEdges(nodeId) { load(); return Object.values(_d.edges).filter(e=>e.fromId===nodeId||e.toId===nodeId); },
  getSubjectEdges(subjectId) {
    load();
    const ids = new Set(Object.values(_d.nodes).filter(n=>n.subjectId===subjectId).map(n=>n.id));
    return Object.values(_d.edges).filter(e=>ids.has(e.fromId)||ids.has(e.toId));
  },
  getUnitEdges(unitId) {
    load();
    const ids = new Set(Object.values(_d.nodes).filter(n=>n.unitId===unitId).map(n=>n.id));
    return Object.values(_d.edges).filter(e=>ids.has(e.fromId)||ids.has(e.toId));
  },
  addEdge({fromId, toId, relationship='relates to'}) {
    load();
    const fn = _d.nodes[fromId], tn = _d.nodes[toId];
    const isCross = fn&&tn&&fn.subjectId!==tn.subjectId;
    const id = uuid();
    _d.edges[id] = { id, fromId, toId, relationship, isCross:!!isCross, notes:'', whiteboardData:null, createdAt:Date.now() };
    save(); return _d.edges[id];
  },
  updateEdge(id,u) { load(); if(_d.edges[id]){Object.assign(_d.edges[id],u);save();} return _d.edges[id]; },
  deleteEdge(id) { load(); delete _d.edges[id]; save(); },

  /* ── Utilities ──────────────────────── */
  getSubjectPairs() {
    load();
    const pairs = new Set();
    Object.values(_d.edges).filter(e=>e.isCross).forEach(e=>{
      const a=_d.nodes[e.fromId]?.subjectId, b=_d.nodes[e.toId]?.subjectId;
      if(a&&b&&a!==b) pairs.add([a,b].sort().join('::'));
    });
    return [...pairs].map(p=>p.split('::'));
  },
  getAllNodesGrouped() {
    load();
    const groups = {};
    Object.values(_d.subjects).forEach(s=>{ groups[s.id]={subject:s,nodes:[]}; });
    Object.values(_d.nodes).forEach(n=>{ if(groups[n.subjectId]) groups[n.subjectId].nodes.push(n); });
    return Object.values(groups);
  },
  getWorkspaceSubjectCount(wid) {
    load();
    return Object.values(_d.subjects).filter(s=>s.workspaceId===wid).length;
  },
  reset() { _d = makeDefault(); save(); },
};
export default Store;
