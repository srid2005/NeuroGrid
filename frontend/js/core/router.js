/* ═══════════════════════════════════════════
   ROUTER — screen management
═══════════════════════════════════════════ */
const screens = ['home','galaxy','cube','subcube','node-wb','edge-wb'];
let _current = 'home';

export function showScreen(name) {
  screens.forEach(id => {
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.toggle('active', id === name);
  });
  _current = name;
}
export function currentScreen() { return _current; }
