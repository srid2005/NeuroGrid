// home.js — Workspace selection screen
import Store from '../core/store.js';
import Router from '../core/router.js';
import Events from '../core/events.js';
import { openAddWorkspaceModal, openEditWorkspaceModal, openConfirmModal } from '../ui/modal.js';

export function initHome() {
  renderWorkspaces();
  Events.on('workspaces:changed', renderWorkspaces);
}

export function destroyHome() {
  Events.off('workspaces:changed', renderWorkspaces);
}

function renderWorkspaces() {
  const grid = document.getElementById('workspaceGrid');
  if (!grid) return;
  const workspaces = Store.getWorkspaces();
  grid.innerHTML = '';

  workspaces.forEach(ws => {
    const count = Store.getWorkspaceSubjectCount(ws.id);
    const card  = document.createElement('div');
    card.className = 'ws-card';
    card.innerHTML = `
      <div class="ws-card-stripe" style="background:${ws.color}"></div>
      <div class="ws-card-body">
        <div class="ws-card-name">${ws.name}</div>
        <div class="ws-card-meta">${count} subject${count!==1?'s':''} · ${ws.description||'Knowledge graph'}</div>
      </div>
      <div class="ws-card-actions">
        <button class="btn-icon ws-edit" data-id="${ws.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon ws-delete danger-icon" data-id="${ws.id}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>
    `;
    card.addEventListener('click', e => {
      if (e.target.closest('.ws-card-actions')) return;
      Router.goGalaxy(ws.id);
    });
    grid.appendChild(card);
  });

  // Add new card
  const addCard = document.createElement('div');
  addCard.className = 'ws-card-add';
  addCard.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    <span>New Workspace</span>
  `;
  addCard.addEventListener('click', openAddWorkspaceModal);
  grid.appendChild(addCard);

  // Edit / Delete buttons
  grid.querySelectorAll('.ws-edit').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openEditWorkspaceModal(btn.dataset.id); });
  });
  grid.querySelectorAll('.ws-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const ws = Store.getWorkspace(btn.dataset.id);
      openConfirmModal({
        title: 'Delete Workspace', confirmText: 'Delete',
        message: `Delete workspace "<b>${ws?.name}</b>"? All subjects, units and nodes inside will be permanently removed.`,
        onConfirm: () => { Store.deleteWorkspace(btn.dataset.id); Events.emit('workspaces:changed'); }
      });
    });
  });
}
