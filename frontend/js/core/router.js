// router.js v2 — 6 screens: home, galaxy, cube, subcube, nodeWb, edgeWb
import Events from './events.js';

const SCREENS = { home:'screen-home', galaxy:'screen-galaxy', cube:'screen-cube',
                  subcube:'screen-subcube', nodeWb:'screen-node-wb', edgeWb:'screen-edge-wb' };

let _current = null;
let _ctx = {};

function setBreadcrumb(items) {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = items.map((it,i)=>{
    const last = i===items.length-1;
    let h = i>0?'<span class="bc-sep">›</span>':'';
    h += `<span class="bc-item${last?' active':''}" data-nav="${it.nav||''}" data-id="${it.id||''}">${it.label}</span>`;
    return h;
  }).join('');
  bc.querySelectorAll('.bc-item[data-nav]').forEach(el=>{
    if(!el.dataset.nav||el.classList.contains('active')) return;
    el.addEventListener('click',()=>{
      const n=el.dataset.nav, id=el.dataset.id;
      if(n==='home')    Router.goHome();
      if(n==='galaxy')  Router.goGalaxy(id);
      if(n==='cube')    Router.goCube(id);
      if(n==='subcube') Router.goSubcube(id);
    });
  });
}

function show(key) {
  Object.values(SCREENS).forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById(SCREENS[key])?.classList.add('active');
  const prev = _current; _current = key;
  Events.emit('screen:change',{to:key,from:prev,context:_ctx});
}

const Router = {
  get current() { return _current; },
  get context() { return _ctx; },

  goHome() {
    _ctx = {};
    setBreadcrumb([{label:'Home'}]);
    show('home');
  },
  goGalaxy(workspaceId) {
    const S=window.__store;
    const ws = S?.getWorkspace(workspaceId);
    _ctx = {workspaceId};
    setBreadcrumb([{label:'Home',nav:'home'},{label:ws?.name||'Workspace'}]);
    show('galaxy');
  },
  goCube(subjectId) {
    const S=window.__store;
    const subj = S?.getSubject(subjectId);
    const ws   = S?.getWorkspace(subj?.workspaceId);
    _ctx = {workspaceId:subj?.workspaceId, subjectId};
    setBreadcrumb([
      {label:'Home',nav:'home'},
      {label:ws?.name||'Workspace',nav:'galaxy',id:subj?.workspaceId},
      {label:subj?.name||'Subject'},
    ]);
    show('cube');
  },
  goSubcube(unitId) {
    const S=window.__store;
    const unit  = S?.getUnit(unitId);
    const subj  = S?.getSubject(unit?.subjectId);
    const ws    = S?.getWorkspace(subj?.workspaceId);
    _ctx = {workspaceId:subj?.workspaceId, subjectId:unit?.subjectId, unitId};
    setBreadcrumb([
      {label:'Home',nav:'home'},
      {label:ws?.name||'Workspace',nav:'galaxy',id:subj?.workspaceId},
      {label:subj?.name||'Subject',nav:'cube',id:unit?.subjectId},
      {label:unit?.name||'Unit'},
    ]);
    show('subcube');
  },
  goNodeWb(nodeId) {
    const S=window.__store;
    const node = S?.getNode(nodeId);
    const subj = S?.getSubject(node?.subjectId);
    const unit = node?.unitId ? S?.getUnit(node.unitId) : null;
    _ctx = {workspaceId:subj?.workspaceId, subjectId:node?.subjectId, unitId:node?.unitId||null, nodeId};
    const crumbs = [
      {label:'Home',nav:'home'},
      {label:subj?.name||'Subject',nav:'cube',id:node?.subjectId},
    ];
    if (unit) crumbs.push({label:unit.name,nav:'subcube',id:unit.id});
    crumbs.push({label:node?.label||'Node'});
    setBreadcrumb(crumbs);
    show('nodeWb');
  },
  goEdgeWb(edgeId) {
    const S=window.__store;
    const edge = S?.getEdge(edgeId);
    const fn   = S?.getNode(edge?.fromId);
    const subj = S?.getSubject(fn?.subjectId);
    _ctx = {workspaceId:subj?.workspaceId, subjectId:fn?.subjectId, edgeId};
    setBreadcrumb([
      {label:'Home',nav:'home'},
      {label:subj?.name||'Subject',nav:'cube',id:fn?.subjectId},
      {label:`${fn?.label||'?'} ↔ …`},
    ]);
    show('edgeWb');
  },
};
export default Router;
