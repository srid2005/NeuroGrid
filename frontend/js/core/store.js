// store.js — Data layer with localStorage persistence
// All data lives here. No data logic anywhere else.

const KEY = 'neurogrid_v1';

/* ── Seed data (GATE CS subjects) ───────── */
const GATE_SUBJECTS_SEED = [
  { name: 'Operating Systems',       label: 'OS',   color: '#10B981' },
  { name: 'DBMS',                    label: 'DB',   color: '#6366F1' },
  { name: 'Computer Networks',       label: 'CN',   color: '#F59E0B' },
  { name: 'Algorithms',              label: 'ALGO', color: '#EF4444' },
  { name: 'Theory of Computation',   label: 'TOC',  color: '#EC4899' },
  { name: 'Computer Architecture',   label: 'COA',  color: '#14B8A6' },
  { name: 'Discrete Mathematics',    label: 'DM',   color: '#84CC16' },
];

/* ── Default empty store ────────────────── */
const makeDefault = () => ({ subjects: {}, nodes: {}, edges: {} });

/* ── Helpers ────────────────────────────── */
export function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

/**
 * Auto-position subject cubes in galaxy (circular layout).
 * Called when adding a new subject — position stored permanently.
 */
export function calcSubjectPosition(existingCount) {
  if (existingCount === 0) return [0, 0, 0];
  const angle = (existingCount / Math.max(existingCount, 1)) * Math.PI * 2;
  const radius = 3 + existingCount * 0.8;
  return [
    parseFloat((Math.cos(angle) * radius).toFixed(3)),
    parseFloat(((existingCount % 2 === 0 ? 0.4 : -0.4)).toFixed(3)),
    parseFloat((Math.sin(angle) * radius).toFixed(3)),
  ];
}

/**
 * Auto-position nodes inside a cube (Fibonacci sphere).
 * Called when adding a new node — position stored permanently.
 */
export function calcNodePosition(existingCount) {
  if (existingCount === 0) return [0, 0, 0];
  const PHI = Math.PI * (3.0 - Math.sqrt(5.0)); // golden angle
  const total = Math.max(existingCount, 1);
  const y = 1.0 - (existingCount / total) * 2.0;
  const r = Math.sqrt(Math.max(0, 1.0 - y * y));
  const theta = PHI * existingCount;
  const scale = 0.62;
  return [
    parseFloat((Math.cos(theta) * r * scale).toFixed(3)),
    parseFloat((y * scale).toFixed(3)),
    parseFloat((Math.sin(theta) * r * scale).toFixed(3)),
  ];
}

/* ── Store singleton ────────────────────── */
let _data = null;

function load() {
  if (_data) return;
  try {
    const raw = localStorage.getItem(KEY);
    _data = raw ? JSON.parse(raw) : null;
  } catch { _data = null; }

  if (!_data || !_data.subjects) {
    _data = makeDefault();
  }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(_data));
}

/* ════════════════════════════════════════════
   PUBLIC API
════════════════════════════════════════════ */
const Store = {

  // ── Subjects ────────────────────────────
  getSubjects() {
    load();
    return Object.values(_data.subjects);
  },

  getSubject(id) {
    load();
    return _data.subjects[id] || null;
  },

  addSubject({ name, label, color }) {
    load();
    const existing = Object.keys(_data.subjects).length;
    const id = uuid();
    _data.subjects[id] = {
      id,
      name,
      label: label || name.slice(0, 4).toUpperCase(),
      color: color || '#8B5CF6',
      position: calcSubjectPosition(existing),
      createdAt: Date.now(),
    };
    persist();
    return _data.subjects[id];
  },

  updateSubject(id, updates) {
    load();
    if (!_data.subjects[id]) return null;
    Object.assign(_data.subjects[id], updates);
    persist();
    return _data.subjects[id];
  },

  deleteSubject(id) {
    load();
    // Cascade: delete all nodes of this subject + edges involving those nodes
    const nodeIds = Object.values(_data.nodes)
      .filter(n => n.subjectId === id)
      .map(n => n.id);
    nodeIds.forEach(nid => this.deleteNode(nid, false));
    delete _data.subjects[id];
    persist();
  },

  // ── Nodes (Concept Nodes) ───────────────
  getNodes(subjectId = null) {
    load();
    const all = Object.values(_data.nodes);
    return subjectId ? all.filter(n => n.subjectId === subjectId) : all;
  },

  getNode(id) {
    load();
    return _data.nodes[id] || null;
  },

  addNode({ subjectId, label, unit = '', notes = '' }) {
    load();
    const existing = Object.values(_data.nodes).filter(n => n.subjectId === subjectId).length;
    const id = uuid();
    _data.nodes[id] = {
      id,
      subjectId,
      label,
      unit,
      notes,
      position: calcNodePosition(existing),
      whiteboardData: null,
      createdAt: Date.now(),
    };
    persist();
    return _data.nodes[id];
  },

  updateNode(id, updates) {
    load();
    if (!_data.nodes[id]) return null;
    Object.assign(_data.nodes[id], updates);
    persist();
    return _data.nodes[id];
  },

  deleteNode(id, doPersist = true) {
    load();
    // Remove all edges touching this node
    Object.keys(_data.edges).forEach(eid => {
      const e = _data.edges[eid];
      if (e.fromId === id || e.toId === id) delete _data.edges[eid];
    });
    delete _data.nodes[id];
    if (doPersist) persist();
  },

  // ── Edges (Concept Links) ───────────────
  getEdges() {
    load();
    return Object.values(_data.edges);
  },

  getEdge(id) {
    load();
    return _data.edges[id] || null;
  },

  getNodeEdges(nodeId) {
    load();
    return Object.values(_data.edges).filter(e => e.fromId === nodeId || e.toId === nodeId);
  },

  getSubjectEdges(subjectId) {
    load();
    const subjectNodeIds = new Set(
      Object.values(_data.nodes).filter(n => n.subjectId === subjectId).map(n => n.id)
    );
    return Object.values(_data.edges).filter(
      e => subjectNodeIds.has(e.fromId) || subjectNodeIds.has(e.toId)
    );
  },

  addEdge({ fromId, toId, relationship = 'relates to' }) {
    load();
    const id = uuid();
    const fromNode = _data.nodes[fromId];
    const toNode   = _data.nodes[toId];
    const isCross  = fromNode && toNode && fromNode.subjectId !== toNode.subjectId;
    _data.edges[id] = {
      id, fromId, toId, relationship, isCross,
      notes: '',
      whiteboardData: null,
      createdAt: Date.now(),
    };
    persist();
    return _data.edges[id];
  },

  updateEdge(id, updates) {
    load();
    if (!_data.edges[id]) return null;
    Object.assign(_data.edges[id], updates);
    persist();
    return _data.edges[id];
  },

  deleteEdge(id) {
    load();
    delete _data.edges[id];
    persist();
  },

  // ── Utilities ───────────────────────────
  getCrossLinks() {
    load();
    return Object.values(_data.edges).filter(e => e.isCross);
  },

  getSubjectPairs() {
    // Returns unique pairs of subjects that share cross-links
    const pairs = new Set();
    this.getCrossLinks().forEach(e => {
      const a = _data.nodes[e.fromId]?.subjectId;
      const b = _data.nodes[e.toId]?.subjectId;
      if (a && b && a !== b) {
        pairs.add([a, b].sort().join('::'));
      }
    });
    return [...pairs].map(p => p.split('::'));
  },

  // Seed GATE subjects if store is completely empty
  seedIfEmpty() {
    load();
    if (Object.keys(_data.subjects).length === 0) {
      GATE_SUBJECTS_SEED.forEach(s => this.addSubject(s));
    }
  },

  // Full reset (dev only)
  reset() {
    _data = makeDefault();
    persist();
  },
};

export default Store;
