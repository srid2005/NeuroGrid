// modal.js v2 — Full CRUD: workspace, subject, unit, node, edge, cross-link
import Store from '../core/store.js';
import Events from '../core/events.js';

const COLORS=['#7C3AED','#10B981','#6366F1','#F59E0B','#EF4444','#EC4899','#14B8A6','#84CC16','#F97316','#06B6D4','#A855F7','#3B82F6','#D97706','#65A30D','#E11D48','#0891B2'];
const RELS=['relates to','is prerequisite of','builds on','analogous to','contrasts with','used in','same concept as','part of','extends','depends on','implements','references'];

/* ── Core ───────────────────────────────── */
let _onConfirm=null;

export function openModal({title,body,confirmText='Confirm',onConfirm,danger=false}) {
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=body;
  const cb=document.getElementById('modalConfirm');
  cb.textContent=confirmText;
  cb.style.background=danger?'var(--red)':'var(--accent)';
  _onConfirm=onConfirm;
  document.getElementById('modalBackdrop').classList.add('open');
  setTimeout(()=>document.querySelector('#modalBody input,#modalBody textarea')?.focus(),60);
}
export function closeModal() { document.getElementById('modalBackdrop').classList.remove('open'); _onConfirm=null; }
export function initModalBindings() {
  document.getElementById('modalClose').onclick=closeModal;
  document.getElementById('modalCancel').onclick=closeModal;
  document.getElementById('modalBackdrop').addEventListener('click',e=>{ if(e.target===document.getElementById('modalBackdrop')) closeModal(); });
  document.getElementById('modalConfirm').onclick=()=>{ if(_onConfirm) _onConfirm(); };
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
}

const swatchGrid=(selected)=>COLORS.map((c,i)=>`<div class="color-swatch${c===selected?' selected':''}" data-c="${c}" style="background:${c}" title="${c}"></div>`).join('');
function bindSwatches(gridId, cb) {
  setTimeout(()=>{
    document.getElementById(gridId)?.addEventListener('click',e=>{
      const sw=e.target.closest('.color-swatch'); if(!sw) return;
      document.querySelectorAll(`#${gridId} .color-swatch`).forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected'); cb(sw.dataset.c);
    });
  },40);
}

/* ── Workspace ──────────────────────────── */
export function openAddWorkspaceModal() {
  let color=COLORS[Store.getWorkspaces().length%COLORS.length];
  openModal({ title:'New Workspace', confirmText:'Create',
    body:`
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mWsName" placeholder="e.g. Computer Science, Biology, History…"/></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="mWsDesc" placeholder="Optional description"/></div>
      <div class="form-group"><label class="form-label">Color</label><div class="color-swatch-grid" id="mWsColors">${swatchGrid(color)}</div></div>`,
    onConfirm:()=>{
      const name=document.getElementById('mWsName')?.value?.trim(); if(!name) return;
      const desc=document.getElementById('mWsDesc')?.value?.trim();
      Store.addWorkspace({name,description:desc,color}); Events.emit('workspaces:changed'); closeModal();
    }
  });
  bindSwatches('mWsColors',c=>color=c);
}

export function openEditWorkspaceModal(wsId) {
  const ws=Store.getWorkspace(wsId); if(!ws) return;
  let color=ws.color;
  openModal({ title:'Edit Workspace', confirmText:'Save',
    body:`
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mWsName" value="${ws.name}"/></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="mWsDesc" value="${ws.description||''}"/></div>
      <div class="form-group"><label class="form-label">Color</label><div class="color-swatch-grid" id="mWsColors">${swatchGrid(color)}</div></div>`,
    onConfirm:()=>{
      const name=document.getElementById('mWsName')?.value?.trim(); if(!name) return;
      Store.updateWorkspace(wsId,{name,description:document.getElementById('mWsDesc')?.value?.trim(),color});
      Events.emit('workspaces:changed'); closeModal();
    }
  });
  bindSwatches('mWsColors',c=>color=c);
}

/* ── Subject ────────────────────────────── */
export function openAddSubjectModal(workspaceId) {
  let color=COLORS[Store.getSubjects(workspaceId).length%COLORS.length];
  openModal({ title:'Add Subject', confirmText:'Add',
    body:`
      <div class="form-group"><label class="form-label">Subject Name</label><input class="form-input" id="mSName" placeholder="e.g. Operating Systems, Physics, Law…"/></div>
      <div class="form-group"><label class="form-label">Short Label</label><input class="form-input" id="mSLabel" placeholder="e.g. OS" maxlength="6"/></div>
      <div class="form-group"><label class="form-label">Color</label><div class="color-swatch-grid" id="mSColors">${swatchGrid(color)}</div></div>`,
    onConfirm:()=>{
      const name=document.getElementById('mSName')?.value?.trim(); if(!name){document.getElementById('mSName').style.borderColor='var(--red)';return;}
      const label=document.getElementById('mSLabel')?.value?.trim()||name.slice(0,4).toUpperCase();
      Store.addSubject({workspaceId,name,label,color}); Events.emit('subjects:changed'); closeModal();
    }
  });
  bindSwatches('mSColors',c=>color=c);
  setTimeout(()=>{
    document.getElementById('mSName')?.addEventListener('input',e=>{
      const lbl=document.getElementById('mSLabel'); if(!lbl.value) lbl.value=e.target.value.slice(0,4).toUpperCase();
    });
  },40);
}

export function openEditSubjectModal(subjectId) {
  const s=Store.getSubject(subjectId); if(!s) return;
  let color=s.color;
  openModal({ title:'Edit Subject', confirmText:'Save',
    body:`
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mSName" value="${s.name}"/></div>
      <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="mSLabel" value="${s.label}" maxlength="6"/></div>
      <div class="form-group"><label class="form-label">Color</label><div class="color-swatch-grid" id="mSColors">${swatchGrid(color)}</div></div>`,
    onConfirm:()=>{
      const name=document.getElementById('mSName')?.value?.trim(); if(!name) return;
      Store.updateSubject(subjectId,{name,label:document.getElementById('mSLabel')?.value?.trim()||name.slice(0,4).toUpperCase(),color});
      Events.emit('subjects:changed'); closeModal();
    }
  });
  bindSwatches('mSColors',c=>color=c);
}

/* ── Unit (Sub-cube) ────────────────────── */
export function openAddUnitModal(subjectId) {
  const subj=Store.getSubject(subjectId);
  let color=subj?.color||COLORS[0];
  openModal({ title:'Add Unit (Sub-Cube)', confirmText:'Add Unit',
    body:`
      <div class="form-group"><label class="form-label">Unit Name</label><input class="form-input" id="mUName" placeholder="e.g. Chapter 3, Deadlocks, Thermodynamics…"/></div>
      <div class="form-group"><label class="form-label">Color</label><div class="color-swatch-grid" id="mUColors">${swatchGrid(color)}</div></div>`,
    onConfirm:()=>{
      const name=document.getElementById('mUName')?.value?.trim(); if(!name) return;
      Store.addUnit({subjectId,name,color}); Events.emit('nodes:changed',{subjectId}); closeModal();
    }
  });
  bindSwatches('mUColors',c=>color=c);
}

export function openEditUnitModal(unitId) {
  const u=Store.getUnit(unitId); if(!u) return;
  let color=u.color;
  openModal({ title:'Edit Unit', confirmText:'Save',
    body:`
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mUName" value="${u.name}"/></div>
      <div class="form-group"><label class="form-label">Color</label><div class="color-swatch-grid" id="mUColors">${swatchGrid(color)}</div></div>`,
    onConfirm:()=>{
      const name=document.getElementById('mUName')?.value?.trim(); if(!name) return;
      Store.updateUnit(unitId,{name,color}); Events.emit('nodes:changed',{subjectId:u.subjectId}); closeModal();
    }
  });
  bindSwatches('mUColors',c=>color=c);
}

/* ── Node ───────────────────────────────── */
export function openAddNodeModal({subjectId,unitId=null}) {
  const subj=Store.getSubject(subjectId);
  const unitOpts=Store.getUnits(subjectId).map(u=>`<option value="${u.id}"${u.id===unitId?' selected':''}>${u.name}</option>`).join('');
  openModal({ title:'Add Concept Node', confirmText:'Add Node',
    body:`
      <div class="form-group"><label class="form-label">Concept / Topic</label><input class="form-input" id="mNLabel" placeholder="e.g. Deadlock, Mitosis, Newton's Law…"/></div>
      ${unitOpts?`<div class="form-group"><label class="form-label">Unit (optional)</label><select class="form-select" id="mNUnit"><option value="">— Direct (no unit) —</option>${unitOpts}</select></div>`:''}
      <div class="form-group"><label class="form-label">Quick Notes</label><textarea class="form-textarea" id="mNNotes" placeholder="Key points, formulas, mnemonics…"></textarea></div>`,
    onConfirm:()=>{
      const label=document.getElementById('mNLabel')?.value?.trim(); if(!label){document.getElementById('mNLabel').style.borderColor='var(--red)';return;}
      const uid=document.getElementById('mNUnit')?.value||unitId||null;
      const notes=document.getElementById('mNNotes')?.value?.trim();
      Store.addNode({subjectId,unitId:uid||null,label,notes}); Events.emit('nodes:changed',{subjectId}); closeModal();
    }
  });
}

export function openEditNodeModal(nodeId) {
  const n=Store.getNode(nodeId); if(!n) return;
  const subjectId=n.subjectId;
  const unitOpts=Store.getUnits(subjectId).map(u=>`<option value="${u.id}"${u.id===n.unitId?' selected':''}>${u.name}</option>`).join('');
  openModal({ title:'Edit Node', confirmText:'Save',
    body:`
      <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="mNLabel" value="${n.label}"/></div>
      ${unitOpts?`<div class="form-group"><label class="form-label">Unit</label><select class="form-select" id="mNUnit"><option value="">— Direct —</option>${unitOpts}</select></div>`:''}
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="mNNotes">${n.notes||''}</textarea></div>`,
    onConfirm:()=>{
      const label=document.getElementById('mNLabel')?.value?.trim(); if(!label) return;
      const uid=document.getElementById('mNUnit')?.value||null;
      const notes=document.getElementById('mNNotes')?.value?.trim();
      Store.updateNode(nodeId,{label,unitId:uid||null,notes}); Events.emit('nodes:changed',{subjectId}); closeModal();
    }
  });
}

/* ── Edge (Link) ────────────────────────── */
export function openAddEdgeModal({fromId,toId,subjectId},onAdded) {
  const fn=Store.getNode(fromId), tn=Store.getNode(toId);
  const fs=Store.getSubject(fn?.subjectId), ts=Store.getSubject(tn?.subjectId);
  const isCross=fn?.subjectId!==tn?.subjectId;
  const opts=RELS.map(r=>`<option>${r}</option>`).join('');
  openModal({ title:'Create Link', confirmText:'Create Link',
    body:`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px;background:var(--surface2);border-radius:8px;">
        <span style="font-size:12px;font-weight:700;color:${fs?.color||'#7C3AED'}">${fn?.label||'?'}</span>
        <span style="color:var(--text-dim)">↔</span>
        <span style="font-size:12px;font-weight:700;color:${ts?.color||'#10B981'}">${tn?.label||'?'}</span>
        ${isCross?'<span style="font-size:10px;color:var(--amber);font-weight:700;margin-left:auto">✦ Cross-subject</span>':''}
      </div>
      <div class="form-group"><label class="form-label">Relationship</label><select class="form-select" id="mERel">${opts}</select></div>
      <div class="form-group"><label class="form-label">Or type custom</label><input class="form-input" id="mERelCustom" placeholder="Custom relationship…"/></div>`,
    onConfirm:()=>{
      const custom=document.getElementById('mERelCustom')?.value?.trim();
      const rel=custom||document.getElementById('mERel')?.value||'relates to';
      const edge=Store.addEdge({fromId,toId,relationship:rel});
      Events.emit('nodes:changed',{subjectId}); Events.emit('subjects:changed');
      if(onAdded) onAdded(edge); closeModal();
    }
  });
}

/* ── Cross-subject link picker ──────────── */
export function openCrossLinkModal(subjectId) {
  const groups=Store.getAllNodesGrouped().filter(g=>g.subject.id!==subjectId&&g.nodes.length>0);
  if (!groups.length) { openModal({title:'Cross-Subject Link',confirmText:'OK',body:`<p style="color:var(--text-muted)">No nodes in other subjects yet. Add nodes to other subjects first.</p>`,onConfirm:closeModal}); return; }

  const myNodes=Store.getNodes({subjectId});
  const myOpts=myNodes.map(n=>`<option value="${n.id}">${n.label}</option>`).join('');
  const otherList=groups.map(g=>`
    <div class="node-picker-group">${g.subject.name}</div>
    ${g.nodes.map(n=>`<div class="node-picker-item" data-id="${n.id}" data-color="${g.subject.color}"><div class="node-picker-dot" style="background:${g.subject.color}"></div>${n.label}</div>`).join('')}
  `).join('');

  let selectedOtherId=null;
  openModal({ title:'Cross-Subject Link', confirmText:'Next: Set Relationship',
    body:`
      <div class="form-group"><label class="form-label">From (this subject)</label><select class="form-select" id="mCLFrom">${myOpts}</select></div>
      <div class="form-group"><label class="form-label">To (other subject — click to select)</label>
        <div class="node-picker-list" id="mCLOther">${otherList}</div>
      </div>`,
    onConfirm:()=>{
      const fromId=document.getElementById('mCLFrom')?.value;
      if(!fromId||!selectedOtherId){ alert('Please select both nodes.'); return; }
      closeModal();
      openAddEdgeModal({fromId,toId:selectedOtherId,subjectId});
    }
  });
  setTimeout(()=>{
    document.getElementById('mCLOther')?.addEventListener('click',e=>{
      const item=e.target.closest('.node-picker-item'); if(!item) return;
      document.querySelectorAll('#mCLOther .node-picker-item').forEach(i=>i.classList.remove('selected'));
      item.classList.add('selected'); selectedOtherId=item.dataset.id;
    });
  },40);
}

/* ── Confirm ────────────────────────────── */
export function openConfirmModal({title,message,confirmText='Delete',onConfirm}) {
  openModal({title,confirmText,danger:true,
    body:`<p style="color:var(--text-muted);font-size:13px;line-height:1.7">${message}</p>`,
    onConfirm});
}
