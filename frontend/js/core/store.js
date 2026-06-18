/* ═══════════════════════════════════════════
   STORE — workspace-scoped state management
═══════════════════════════════════════════ */

const STORAGE_KEY = 'neurogrid_v3';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e) { console.warn('Storage save failed', e); }
}

let _state = load();

function get() { return _state; }

function set(updater) {
  _state = updater(_state);
  save(_state);
  return _state;
}

// ── Workspace helpers ──────────────────────────────────────────────────────
export function getWorkspaces() {
  return _state.workspaces || [];
}
export function getWorkspace(wsId) {
  return (getWorkspaces()).find(w => w.id === wsId) || null;
}
export function createWorkspace(name, icon, color) {
  const ws = { id: uid(), name, icon, color, createdAt: Date.now() };
  set(s => ({ ...s, workspaces: [...(s.workspaces || []), ws] }));
  return ws;
}
export function updateWorkspace(wsId, patch) {
  set(s => ({
    ...s,
    workspaces: (s.workspaces || []).map(w => w.id === wsId ? { ...w, ...patch } : w)
  }));
}
export function deleteWorkspace(wsId) {
  set(s => ({
    ...s,
    workspaces:  (s.workspaces  || []).filter(w => w.id !== wsId),
    subjects:    (s.subjects    || []).filter(sub => sub.wsId !== wsId),
    units:       (s.units       || []).filter(u => u.wsId !== wsId),
    nodes:       (s.nodes       || []).filter(n => n.wsId !== wsId),
    edges:       (s.edges       || []).filter(e => e.wsId !== wsId),
    crossEdges:  (s.crossEdges  || [])
  }));
}

// ── Subject helpers ────────────────────────────────────────────────────────
export function getSubjects(wsId) {
  return (_state.subjects || []).filter(s => s.wsId === wsId);
}
export function getSubject(subId) {
  return (_state.subjects || []).find(s => s.id === subId) || null;
}
export function createSubject(wsId, name, color) {
  const sub = { id: uid(), wsId, name, color, createdAt: Date.now() };
  set(s => ({ ...s, subjects: [...(s.subjects || []), sub] }));
  return sub;
}
export function deleteSubject(subId) {
  const sub = getSubject(subId);
  if (!sub) return;
  const wsId = sub.wsId;
  // get all units for this subject
  const unitIds = getUnits(subId).map(u => u.id);
  set(s => ({
    ...s,
    subjects: (s.subjects || []).filter(x => x.id !== subId),
    units:    (s.units    || []).filter(u => u.subjectId !== subId),
    nodes:    (s.nodes    || []).filter(n => n.subjectId !== subId),
    edges:    (s.edges    || []).filter(e => e.wsId === wsId
                ? !unitIds.includes(e.fromNodeId) && !unitIds.includes(e.toNodeId)
                : true)
  }));
}

// ── Unit helpers ───────────────────────────────────────────────────────────
export function getUnits(subjectId) {
  return (_state.units || []).filter(u => u.subjectId === subjectId);
}
export function getUnit(unitId) {
  return (_state.units || []).find(u => u.id === unitId) || null;
}
export function createUnit(wsId, subjectId, name, color) {
  const unit = { id: uid(), wsId, subjectId, name, color, createdAt: Date.now() };
  set(s => ({ ...s, units: [...(s.units || []), unit] }));
  return unit;
}
export function deleteUnit(unitId) {
  set(s => ({
    ...s,
    units: (s.units || []).filter(u => u.id !== unitId),
    nodes: (s.nodes || []).filter(n => n.unitId !== unitId),
    edges: (s.edges || []).filter(e => e.unitId !== unitId)
  }));
}

// ── Node helpers ───────────────────────────────────────────────────────────
// Nodes scope: a node belongs to one subject and optionally one unit (subcube)
export function getNodes(subjectId, unitId) {
  if (unitId !== undefined && unitId !== null) {
    return (_state.nodes || []).filter(n => n.subjectId === subjectId && n.unitId === unitId);
  }
  // nodes on the subject cube (no unit)
  return (_state.nodes || []).filter(n => n.subjectId === subjectId && !n.unitId);
}
export function getAllNodesForSubject(subjectId) {
  return (_state.nodes || []).filter(n => n.subjectId === subjectId);
}
export function getAllNodesForWorkspace(wsId) {
  return (_state.nodes || []).filter(n => n.wsId === wsId);
}
export function getNode(nodeId) {
  return (_state.nodes || []).find(n => n.id === nodeId) || null;
}
export function createNode(wsId, subjectId, unitId, name, color, pos) {
  const node = {
    id: uid(), wsId, subjectId,
    unitId: unitId || null,   // null = lives on the subject cube
    name, color,
    pos: pos || { x: 0, y: 0, z: 0 },
    notes: '',
    canvasData: null,
    createdAt: Date.now()
  };
  set(s => ({ ...s, nodes: [...(s.nodes || []), node] }));
  return node;
}
export function updateNode(nodeId, patch) {
  set(s => ({
    ...s,
    nodes: (s.nodes || []).map(n => n.id === nodeId ? { ...n, ...patch } : n)
  }));
}
export function deleteNode(nodeId) {
  set(s => ({
    ...s,
    nodes: (s.nodes || []).filter(n => n.id !== nodeId),
    edges: (s.edges || []).filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId),
    crossEdges: (s.crossEdges || []).filter(e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId)
  }));
}

// ── Edge helpers (same-layer) ──────────────────────────────────────────────
export function getEdges(subjectId, unitId) {
  if (unitId !== undefined && unitId !== null) {
    return (_state.edges || []).filter(e => e.subjectId === subjectId && e.unitId === unitId);
  }
  return (_state.edges || []).filter(e => e.subjectId === subjectId && !e.unitId);
}
export function getEdge(edgeId) {
  return (_state.edges || []).find(e => e.id === edgeId) || null;
}
export function createEdge(wsId, subjectId, unitId, fromNodeId, toNodeId, label) {
  // prevent duplicate
  const existing = (_state.edges || []).find(e =>
    e.subjectId === subjectId && e.unitId === (unitId||null) &&
    ((e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
     (e.fromNodeId === toNodeId   && e.toNodeId === fromNodeId))
  );
  if (existing) return existing;
  const edge = {
    id: uid(), wsId, subjectId,
    unitId: unitId || null,
    fromNodeId, toNodeId, label: label || '',
    notes: '', canvasData: null, createdAt: Date.now()
  };
  set(s => ({ ...s, edges: [...(s.edges || []), edge] }));
  return edge;
}
export function updateEdge(edgeId, patch) {
  set(s => ({
    ...s,
    edges: (s.edges || []).map(e => e.id === edgeId ? { ...e, ...patch } : e)
  }));
}
export function deleteEdge(edgeId) {
  set(s => ({ ...s, edges: (s.edges || []).filter(e => e.id !== edgeId) }));
}

// ── Cross-layer edge helpers ───────────────────────────────────────────────
export function getCrossEdges(wsId) {
  return (_state.crossEdges || []).filter(e => e.wsId === wsId);
}
export function getCrossEdgesForNode(nodeId) {
  return (_state.crossEdges || []).filter(e =>
    e.fromNodeId === nodeId || e.toNodeId === nodeId
  );
}
export function createCrossEdge(wsId, fromNodeId, toNodeId, label) {
  const existing = (_state.crossEdges || []).find(e =>
    (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
    (e.fromNodeId === toNodeId   && e.toNodeId === fromNodeId)
  );
  if (existing) return existing;
  const edge = {
    id: uid(), wsId, fromNodeId, toNodeId,
    label: label || 'cross-link', notes: '', createdAt: Date.now()
  };
  set(s => ({ ...s, crossEdges: [...(s.crossEdges || []), edge] }));
  return edge;
}
export function deleteCrossEdge(edgeId) {
  set(s => ({ ...s, crossEdges: (s.crossEdges || []).filter(e => e.id !== edgeId) }));
}

// ── Auth helpers ───────────────────────────────────────────────────────────
export function getUsers() { return _state.users || []; }
export function getCurrentUser() { return _state.currentUser || null; }
export function setCurrentUser(user) {
  set(s => ({ ...s, currentUser: user }));
}
export function registerUser(email, password) {
  const users = getUsers();
  if (users.find(u => u.email === email)) return { error: 'Email already exists' };
  const user = { id: uid(), email, password, createdAt: Date.now() };
  set(s => ({ ...s, users: [...(s.users || []), user] }));
  return { user };
}
export function loginUser(email, password) {
  const user = getUsers().find(u => u.email === email && u.password === password);
  if (!user) return { error: 'Invalid credentials' };
  setCurrentUser(user);
  return { user };
}
export function logoutUser() {
  set(s => ({ ...s, currentUser: null }));
}

// ── Colour palette ─────────────────────────────────────────────────────────
export const PALETTE = [
  '#7C3AED','#8B5CF6','#A78BFA',
  '#06B6D4','#0EA5E9','#38BDF8',
  '#10B981','#34D399','#6EE7B7',
  '#F59E0B','#FBBF24','#FDE68A',
  '#EF4444','#F87171','#FCA5A5',
  '#EC4899','#F472B6','#FBCFE8',
  '#F97316','#FB923C','#64748B',
  '#A3E635','#4ADE80','#2DD4BF'
];

export const WS_ICONS = ['🧠','🚀','📐','🔬','💡','🎨','📚','⚡','🌌','🔭','🧬','💻'];

// ── utility ────────────────────────────────────────────────────────────────
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
