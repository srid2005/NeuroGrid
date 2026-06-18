/* ═══════════════════════════════════════════
   HOME — workspace grid
═══════════════════════════════════════════ */
import { getWorkspaces, createWorkspace, deleteWorkspace, updateWorkspace, WS_ICONS, PALETTE } from '../core/store.js';
import { emit } from '../core/events.js';
import { openModal } from '../ui/modal.js';

export function renderHome() {
  const grid = document.getElementById('workspaceGrid');
  const workspaces = getWorkspaces();
  grid.innerHTML = '';

  workspaces.forEach(ws => {
    const card = document.createElement('div');
    card.className = 'ws-card';
    card.innerHTML = `
      <div class="ws-card-stripe" style="background:${ws.color}"></div>
      <div class="ws-card-body">
        <div class="ws-card-icon">${ws.icon || '🧠'}</div>
        <div class="ws-card-name">${esc(ws.name)}</div>
        <div class="ws-card-meta">Created ${timeAgo(ws.createdAt)}</div>
      </div>
      <div class="ws-card-footer">
        <div class="subject-stat-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Open workspace
        </div>
        <div class="ws-card-actions">
          <button class="btn-icon" data-ws-edit="${ws.id}" title="Rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger-icon" data-ws-del="${ws.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>`;

    // Open workspace on click (but not on action buttons)
    card.addEventListener('click', e => {
      if (e.target.closest('[data-ws-edit],[data-ws-del]')) return;
      emit('nav:workspace', { wsId: ws.id });
    });

    card.querySelector('[data-ws-edit]')?.addEventListener('click', e => {
      e.stopPropagation();
      openEditWorkspace(ws);
    });
    card.querySelector('[data-ws-del]')?.addEventListener('click', e => {
      e.stopPropagation();
      openModal({
        title: 'Delete Workspace',
        body: `<p style="color:var(--text-muted);font-size:13px">Delete <strong>${esc(ws.name)}</strong> and all its subjects, nodes, and connections? This cannot be undone.</p>`,
        confirmText: 'Delete', confirmDanger: true,
        onConfirm: () => { deleteWorkspace(ws.id); renderHome(); }
      });
    });
    grid.appendChild(card);
  });

  // Add card
  const addCard = document.createElement('div');
  addCard.className = 'ws-card-add';
  addCard.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span>New Workspace</span>`;
  addCard.addEventListener('click', openCreateWorkspace);
  grid.appendChild(addCard);
}

function openCreateWorkspace() {
  let chosenColor = PALETTE[0];
  let chosenIcon  = WS_ICONS[0];
  openModal({
    title: 'New Workspace',
    body: buildWsForm(chosenColor, chosenIcon, (c,i) => { chosenColor=c; chosenIcon=i; }),
    confirmText: 'Create',
    onConfirm: () => {
      const name = document.getElementById('wsNameInput')?.value?.trim();
      if (!name) return false;
      createWorkspace(name, chosenIcon, chosenColor);
      renderHome();
    }
  });
}

function openEditWorkspace(ws) {
  let chosenColor = ws.color;
  let chosenIcon  = ws.icon || WS_ICONS[0];
  openModal({
    title: 'Edit Workspace',
    body: buildWsForm(chosenColor, chosenIcon, (c,i) => { chosenColor=c; chosenIcon=i; }, ws.name),
    confirmText: 'Save',
    onConfirm: () => {
      const name = document.getElementById('wsNameInput')?.value?.trim();
      if (!name) return false;
      updateWorkspace(ws.id, { name, color: chosenColor, icon: chosenIcon });
      renderHome();
    }
  });
}

function buildWsForm(initColor, initIcon, onChange, initName='') {
  const iconGrid = WS_ICONS.map(i =>
    `<button class="color-swatch ws-icon-btn${i===initIcon?' selected':''}" data-icon="${i}"
     style="background:var(--surface3);font-size:16px;display:flex;align-items:center;justify-content:center;border:2px solid ${i===initIcon?'rgba(139,92,246,0.8)':'transparent'};border-radius:9px;width:36px;height:36px;cursor:pointer">${i}</button>`
  ).join('');
  const colorGrid = PALETTE.map(c =>
    `<button class="color-swatch${c===initColor?' selected':''}" data-color="${c}" style="background:${c};border-radius:8px"></button>`
  ).join('');

  setTimeout(() => {
    // icon pick
    document.querySelectorAll('.ws-icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ws-icon-btn').forEach(b => { b.classList.remove('selected'); b.style.borderColor='transparent'; });
        btn.classList.add('selected');
        btn.style.borderColor='rgba(139,92,246,0.8)';
        initIcon = btn.dataset.icon;
        onChange(initColor, initIcon);
      });
    });
    // color pick
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch[data-color]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        initColor = btn.dataset.color;
        onChange(initColor, initIcon);
      });
    });
  }, 0);

  return `
    <div class="form-group">
      <label class="form-label">Workspace Name</label>
      <input class="form-input" id="wsNameInput" placeholder="e.g. Machine Learning" value="${esc(initName)}" autofocus/>
    </div>
    <div class="form-group">
      <label class="form-label">Icon</label>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:5px">${iconGrid}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <div class="color-swatch-grid">${colorGrid}</div>
    </div>`;
}

function timeAgo(ts) {
  const s = (Date.now()-ts)/1000;
  if (s<60) return 'just now';
  if (s<3600) return `${Math.floor(s/60)}m ago`;
  if (s<86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function esc(s='') { return String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }
