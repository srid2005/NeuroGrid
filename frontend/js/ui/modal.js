// modal.js — All modal dialogs for NeuroGrid
import Store from '../core/store.js';
import Events from '../core/events.js';

const SUBJECT_COLORS = [
  '#10B981','#6366F1','#F59E0B','#EF4444','#EC4899',
  '#14B8A6','#84CC16','#8B5CF6','#F97316','#06B6D4',
  '#A855F7','#3B82F6','#D97706','#65A30D','#E11D48',
  '#0891B2',
];

const RELATIONSHIPS = [
  'relates to', 'is prerequisite of', 'builds on',
  'analogous to', 'contrasts with', 'used in',
  'same concept as', 'part of', 'extends',
];

/* ── Core modal plumbing ────────────────── */
let _onConfirm = null;

export function openModal({ title, body, confirmText = 'Confirm', onConfirm }) {
  document.getElementById('modalTitle').textContent    = title;
  document.getElementById('modalBody').innerHTML       = body;
  document.getElementById('modalConfirm').textContent  = confirmText;
  _onConfirm = onConfirm;
  document.getElementById('modalBackdrop').classList.add('open');
}

export function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  _onConfirm = null;
}

export function initModalBindings() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('modalBackdrop')) closeModal();
  });
  document.getElementById('modalConfirm').addEventListener('click', () => {
    if (_onConfirm) _onConfirm();
  });
}

/* ════════════════════════════════════════════
   ADD SUBJECT MODAL
════════════════════════════════════════════ */
export function openAddSubjectModal() {
  let selectedColor = SUBJECT_COLORS[0];

  const swatches = SUBJECT_COLORS.map((c, i) =>
    `<div class="color-swatch${i===0?' selected':''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');

  openModal({
    title: 'Add Subject',
    confirmText: 'Add Subject',
    body: `
      <div class="form-group">
        <label class="form-label">Subject Name</label>
        <input class="form-input" id="mSubjName" placeholder="e.g. Operating Systems" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Short Label</label>
        <input class="form-input" id="mSubjLabel" placeholder="e.g. OS" maxlength="6" />
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatch-grid" id="mSubjColorGrid">${swatches}</div>
      </div>
    `,
    onConfirm: () => {
      const name  = document.getElementById('mSubjName')?.value?.trim();
      const label = document.getElementById('mSubjLabel')?.value?.trim();
      if (!name) { document.getElementById('mSubjName').style.borderColor = 'var(--red)'; return; }
      Store.addSubject({ name, label: label || name.slice(0,4).toUpperCase(), color: selectedColor });
      Events.emit('subjects:changed');
      closeModal();
    },
  });

  // Swatch click handler (attached after body rendered)
  setTimeout(() => {
    document.getElementById('mSubjColorGrid')?.addEventListener('click', e => {
      const sw = e.target.closest('.color-swatch');
      if (!sw) return;
      document.querySelectorAll('#mSubjColorGrid .color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });

    // Auto-fill label from name
    document.getElementById('mSubjName')?.addEventListener('input', e => {
      const label = document.getElementById('mSubjLabel');
      if (!label.value) label.value = e.target.value.slice(0,4).toUpperCase();
    });
  }, 50);
}

/* ════════════════════════════════════════════
   EDIT SUBJECT MODAL
════════════════════════════════════════════ */
export function openEditSubjectModal(subjectId) {
  const subj = Store.getSubject(subjectId);
  if (!subj) return;
  let selectedColor = subj.color;

  const swatches = SUBJECT_COLORS.map(c =>
    `<div class="color-swatch${c===subj.color?' selected':''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');

  openModal({
    title: 'Edit Subject',
    confirmText: 'Save',
    body: `
      <div class="form-group">
        <label class="form-label">Subject Name</label>
        <input class="form-input" id="mSubjName" value="${subj.name}" />
      </div>
      <div class="form-group">
        <label class="form-label">Short Label</label>
        <input class="form-input" id="mSubjLabel" value="${subj.label}" maxlength="6" />
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatch-grid" id="mSubjColorGrid">${swatches}</div>
      </div>
    `,
    onConfirm: () => {
      const name  = document.getElementById('mSubjName')?.value?.trim();
      const label = document.getElementById('mSubjLabel')?.value?.trim();
      if (!name) return;
      Store.updateSubject(subjectId, { name, label, color: selectedColor });
      Events.emit('subjects:changed');
      closeModal();
    },
  });

  setTimeout(() => {
    document.getElementById('mSubjColorGrid')?.addEventListener('click', e => {
      const sw = e.target.closest('.color-swatch');
      if (!sw) return;
      document.querySelectorAll('#mSubjColorGrid .color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  }, 50);
}

/* ════════════════════════════════════════════
   ADD NODE MODAL
════════════════════════════════════════════ */
export function openAddNodeModal(subjectId, onAdded) {
  openModal({
    title: 'Add Concept Node',
    confirmText: 'Add Node',
    body: `
      <div class="form-group">
        <label class="form-label">Concept / Topic</label>
        <input class="form-input" id="mNodeLabel" placeholder="e.g. Banker's Algorithm" autofocus />
      </div>
      <div class="form-group">
        <label class="form-label">Unit / Chapter</label>
        <input class="form-input" id="mNodeUnit" placeholder="e.g. Unit 3" />
      </div>
      <div class="form-group">
        <label class="form-label">Quick Notes</label>
        <textarea class="form-textarea" id="mNodeNotes" placeholder="Key points, formulas..."></textarea>
      </div>
    `,
    onConfirm: () => {
      const label = document.getElementById('mNodeLabel')?.value?.trim();
      const unit  = document.getElementById('mNodeUnit')?.value?.trim();
      const notes = document.getElementById('mNodeNotes')?.value?.trim();
      if (!label) { document.getElementById('mNodeLabel').style.borderColor = 'var(--red)'; return; }
      const node = Store.addNode({ subjectId, label, unit, notes });
      Events.emit('nodes:changed', { subjectId });
      if (onAdded) onAdded(node);
      closeModal();
    },
  });
}

/* ════════════════════════════════════════════
   ADD EDGE (LINK) MODAL
════════════════════════════════════════════ */
export function openAddEdgeModal({ fromId, toId, subjectId }, onAdded) {
  const fromNode = Store.getNode(fromId);
  const toNode   = Store.getNode(toId);
  const fromSubj = Store.getSubject(fromNode?.subjectId);
  const toSubj   = Store.getSubject(toNode?.subjectId);
  const isCross  = fromNode?.subjectId !== toNode?.subjectId;

  const options = RELATIONSHIPS.map(r =>
    `<option value="${r}">${r}</option>`
  ).join('');

  openModal({
    title: 'Create Link',
    confirmText: 'Create Link',
    body: `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px;background:var(--surface2);border-radius:8px;">
        <span style="font-size:12px;font-weight:600;color:${fromSubj?.color||'#8B5CF6'}">${fromNode?.label || '?'}</span>
        <span style="color:var(--text-dim);font-size:12px">↔</span>
        <span style="font-size:12px;font-weight:600;color:${toSubj?.color||'#8B5CF6'}">${toNode?.label || '?'}</span>
        ${isCross ? '<span style="font-size:10px;color:var(--amber);font-weight:600;margin-left:auto">✦ Cross-subject</span>' : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Relationship</label>
        <select class="form-select" id="mEdgeRel">${options}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Or type custom</label>
        <input class="form-input" id="mEdgeRelCustom" placeholder="Custom relationship..." />
      </div>
    `,
    onConfirm: () => {
      const custom = document.getElementById('mEdgeRelCustom')?.value?.trim();
      const sel    = document.getElementById('mEdgeRel')?.value;
      const relationship = custom || sel || 'relates to';
      const edge = Store.addEdge({ fromId, toId, relationship });
      Events.emit('nodes:changed', { subjectId });
      Events.emit('subjects:changed');
      if (onAdded) onAdded(edge);
      closeModal();
    },
  });
}

/* ════════════════════════════════════════════
   CONFIRM DELETE
════════════════════════════════════════════ */
export function openConfirmModal({ title, message, confirmText = 'Delete', onConfirm }) {
  openModal({
    title,
    confirmText,
    body: `<p style="color:var(--text-muted);font-size:13px;line-height:1.6">${message}</p>`,
    onConfirm,
  });
  // Style confirm button as danger
  setTimeout(() => {
    const btn = document.getElementById('modalConfirm');
    if (btn) {
      btn.style.background = 'var(--red)';
      btn.style.boxShadow  = 'none';
    }
  }, 20);
}
