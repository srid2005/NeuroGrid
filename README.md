# NeuroGrid

> A self-hosted GATE CS concept knowledge graph — visualize, link, and annotate concepts across all subjects on an infinite 3D canvas.

![NeuroGrid](https://img.shields.io/badge/phase-1%20%E2%80%94%20Frontend-8B5CF6?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS%20%7C%20Three.js%20%7C%20Konva.js-09090B?style=for-the-badge)
![Backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20PostgreSQL-10B981?style=for-the-badge)

---

## What is NeuroGrid?

NeuroGrid is a **personal GATE CS preparation tool** built around one core idea:

> Concepts from different subjects are not isolated — they connect. NeuroGrid makes those connections visible and explorable.

Each GATE subject lives as a **3D cube in a galaxy**. Inside each cube are **concept nodes**. You can draw **links between concepts across subjects** (e.g. OS Scheduler ↔ DB Query Planner — both use queue logic). Every node and every link has its own **infinite whiteboard** for drawings, annotations, and notes.

---

## Architecture

```
NeuroGrid/
├── frontend/               ← Pure HTML + CSS + JS (no framework)
│   ├── login.html          ← Password gate (SHA-256 client-side)
│   ├── app.html            ← Main app shell (4 screens)
│   ├── css/
│   │   └── main.css        ← Complete dark theme design system
│   └── js/
│       ├── core/
│       │   ├── store.js    ← Data layer + localStorage persistence
│       │   ├── router.js   ← Screen navigation + breadcrumbs
│       │   └── events.js   ← Lightweight event bus
│       ├── views/
│       │   ├── galaxy.js   ← Three.js: subjects as 3D cubes in space
│       │   ├── cube.js     ← Three.js: nodes inside a subject cube
│       │   ├── node-wb.js  ← Konva.js: infinite whiteboard per node
│       │   └── edge-wb.js  ← Konva.js: whiteboard for a concept link
│       ├── ui/
│       │   └── modal.js    ← All modal dialogs (add/edit/delete)
│       └── app.js          ← Entry point — wires everything together
└── backend/                ← Python FastAPI (Phase 3 activation)
    ├── main.py
    ├── routers/
    │   ├── auth.py         ← Password login → JWT
    │   ├── subjects.py     ← CRUD for subjects
    │   ├── concepts.py     ← CRUD for concept nodes
    │   └── links.py        ← CRUD for concept links
    ├── database/
    │   ├── connection.py   ← SQLAlchemy engine
    │   └── models.py       ← ORM: Subject, Concept, ConceptLink
    └── requirements.txt
```

---

## The 4 Screens

| Screen | Description |
|--------|-------------|
| **Galaxy** | 3D space — each GATE subject is an orbiting wireframe cube. Dashed lines show cross-subject connections. |
| **Cube Interior** | Inside a subject — concept nodes as 3D spheres, ghost nodes from other subjects, intra/cross links as lines. |
| **Node Whiteboard** | Infinite Konva canvas per concept — pen, text, rectangles. Sidebar shows connections + notes. |
| **Edge Whiteboard** | Infinite canvas for a link — pre-populated with both concept cards and the relationship label. |

---

## Running in Phase 1 (Frontend Only)

Phase 1 uses **localStorage** for all data. No backend required.

### Prerequisites
- A modern browser (Chrome / Firefox / Edge — must support ES modules + importmap)
- Python 3 (for local HTTP server)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/srid2005/NeuroGrid.git
cd NeuroGrid/frontend

# 2. Serve locally (ES modules require HTTP — cannot open index.html directly)
python -m http.server 8080

# 3. Open in browser
# http://localhost:8080/login.html
```

**Default password:** `neurogrid`

---

## Running the Backend (Phase 3)

```bash
cd backend

# 1. Create virtual environment
python -m venv venv
source venv/bin/activate     # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment
cp ../.env.example .env
# Edit .env — fill in DATABASE_URL, SECRET_KEY, etc.

# 4. Run migrations (Alembic — Phase 3)
# alembic upgrade head

# 5. Start server
uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

---

## Feature Roadmap

### ✅ Phase 1 — Frontend (Current)
- [x] 3D galaxy view (Three.js + OrbitControls)
- [x] Subject cube interior with nodes and ghost cross-nodes
- [x] Link mode — draw connections between concept nodes
- [x] Node whiteboard (pen, text, rectangle, undo/redo)
- [x] Edge whiteboard with pre-populated concept cards
- [x] localStorage persistence
- [x] Auto-seeded GATE CS subjects
- [x] Password gate (SHA-256)
- [x] Add/delete subjects, nodes, links via modals
- [x] Auto-calculated 3D positions (Fibonacci sphere for nodes)
- [x] Cross-subject link visualization (dashed lines in galaxy + ghost nodes in cube)

### 🔄 Phase 2 — Whiteboard Polish
- [ ] Highlighter tool
- [ ] Image upload / paste
- [ ] Mini-map
- [ ] Export canvas as PNG/PDF
- [ ] Snap to grid
- [ ] Multi-select + group

### 🔄 Phase 3 — Backend
- [ ] FastAPI + PostgreSQL fully active
- [ ] JWT authentication
- [ ] REST API replaces localStorage
- [ ] Data migration from localStorage → DB
- [ ] Snapshot / version history

### 🔄 Phase 4 — AI Layer
- [ ] Claude API suggests cross-subject links
- [ ] "You haven't connected OS Scheduling to CPU Burst in COA yet"
- [ ] Auto-generate concept summaries
- [ ] GATE question tagging per concept

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend rendering | Vanilla HTML5 / CSS3 / ES Modules |
| 3D views | Three.js r160 + OrbitControls + CSS2DRenderer |
| Canvas/whiteboard | Konva.js 9 |
| Data storage (P1) | localStorage (IndexedDB in P2) |
| Backend | Python FastAPI |
| ORM | SQLAlchemy 2.0 |
| Database | PostgreSQL (SQLite for dev) |
| AI (P4) | Anthropic Claude API |

---

## Author

**Sri Dharanivel A M** — [@Hacker-SriDhar](https://github.com/Hacker-SriDhar)

B.E. CSE, targeting GATE CS → M.Tech Cybersecurity / Information Security.

See also: [Tornado VPN](https://github.com/Hacker-SriDhar/TornadoVPN) · [OpenBSH](https://github.com/Hacker-SriDhar/OpenBSH)

---

## License

MIT — use freely, attribution appreciated.
