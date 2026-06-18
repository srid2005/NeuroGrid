/* ═══════════════════════════════════════════
   MODAL — reusable dialog
═══════════════════════════════════════════ */
let _onConfirm = null;

export function openModal({ title, body, confirmText='Confirm', cancelText='Cancel', onConfirm, confirmDanger=false, hideFooter=false }) {
  const backdrop = document.getElementById('modalBackdrop');
  const modal    = document.getElementById('modal');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = body;
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn  = document.getElementById('modalCancel');
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent  = cancelText;
  confirmBtn.style.display  = hideFooter ? 'none' : '';
  cancelBtn.style.display   = hideFooter ? 'none' : '';
  document.querySelector('.modal-footer').style.display = hideFooter ? 'none' : '';
  if (confirmDanger) {
    confirmBtn.style.background = 'linear-gradient(135deg,#DC2626,#B91C1C)';
    confirmBtn.style.boxShadow  = '0 1px 3px rgba(0,0,0,0.3),0 0 0 1px rgba(239,68,68,0.4)';
  } else {
    confirmBtn.style.background = '';
    confirmBtn.style.boxShadow  = '';
  }
  _onConfirm = onConfirm;
  backdrop.classList.add('open');
  // focus first input
  setTimeout(() => modal.querySelector('input,textarea,select')?.focus(), 50);
}

export function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  _onConfirm = null;
}

export function initModal() {
  const backdrop = document.getElementById('modalBackdrop');
  document.getElementById('modalClose').addEventListener('click',  closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.getElementById('modalConfirm').addEventListener('click', () => {
    if (_onConfirm) {
      const result = _onConfirm();
      if (result !== false) closeModal();
    } else {
      closeModal();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal();
  });
}
