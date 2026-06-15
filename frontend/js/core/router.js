// router.js — Screen navigation and breadcrumb management
import Events from './events.js';

const SCREENS = {
  galaxy:   'screen-galaxy',
  cube:     'screen-cube',
  nodeWb:   'screen-node-wb',
  edgeWb:   'screen-edge-wb',
};

let _current = null;
let _context = {};  // { subjectId, nodeId, edgeId }

/* ── Breadcrumb ─────────────────────────── */
function setBreadcrumb(items) {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = items.map((item, i) => {
    const isLast = i === items.length - 1;
    let html = '';
    if (i > 0) html += '<span class="bc-sep">›</span>';
    html += `<span class="bc-item${isLast ? ' active' : ''}" data-nav="${item.nav || ''}" data-id="${item.id || ''}">${item.label}</span>`;
    return html;
  }).join('');

  // Breadcrumb click navigation
  bc.querySelectorAll('.bc-item[data-nav]').forEach(el => {
    const nav = el.dataset.nav;
    const id  = el.dataset.id;
    if (!nav || el.classList.contains('active')) return;
    el.addEventListener('click', () => {
      if (nav === 'galaxy')  Router.goGalaxy();
      if (nav === 'cube')    Router.goCube(id);
    });
  });
}

/* ── Core show/hide ─────────────────────── */
function show(screenKey) {
  Object.values(SCREENS).forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  const id = SCREENS[screenKey];
  if (id) document.getElementById(id)?.classList.add('active');
  const prev = _current;
  _current = screenKey;
  Events.emit('screen:change', { to: screenKey, from: prev, context: _context });
}

/* ════════════════════════════════════════════
   PUBLIC ROUTER
════════════════════════════════════════════ */
const Router = {
  get current() { return _current; },
  get context() { return _context; },

  goGalaxy() {
    _context = {};
    setBreadcrumb([{ label: 'Galaxy' }]);
    show('galaxy');
  },

  goCube(subjectId) {
    const Store = window.__store;
    const subject = Store?.getSubject(subjectId);
    _context = { subjectId };
    setBreadcrumb([
      { label: 'Galaxy', nav: 'galaxy' },
      { label: subject?.name || 'Subject' },
    ]);
    show('cube');
  },

  goNodeWb(nodeId) {
    const Store = window.__store;
    const node    = Store?.getNode(nodeId);
    const subject = Store?.getSubject(node?.subjectId);
    _context = { subjectId: node?.subjectId, nodeId };
    setBreadcrumb([
      { label: 'Galaxy', nav: 'galaxy' },
      { label: subject?.name || 'Subject', nav: 'cube', id: node?.subjectId },
      { label: node?.label || 'Node' },
    ]);
    show('nodeWb');
  },

  goEdgeWb(edgeId) {
    const Store = window.__store;
    const edge    = Store?.getEdge(edgeId);
    const fromNode = Store?.getNode(edge?.fromId);
    const subject  = Store?.getSubject(fromNode?.subjectId);
    _context = { subjectId: fromNode?.subjectId, edgeId };
    setBreadcrumb([
      { label: 'Galaxy', nav: 'galaxy' },
      { label: subject?.name || 'Subject', nav: 'cube', id: fromNode?.subjectId },
      { label: `${fromNode?.label || '?'} ↔ …` },
    ]);
    show('edgeWb');
  },
};

export default Router;
