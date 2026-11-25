# Sync-MD: Real-Time Collaborative Markdown Editor

Sync-MD is a full-stack, distributed collaborative Markdown workspace built with React, CodeMirror 6, Yjs CRDTs, WebSockets, Redis, MongoDB, and JWT authentication.

---

## Complete Project Modules & Architecture

### 1. Module 1: User Authentication & Security (JWT + bcrypt)
- **User Authentication (`auth.cjs`)**: Full registration, login, and token verification system.
- **Password Hashing**: Uses `bcryptjs` with 10 salt rounds to securely hash user passwords before storing in MongoDB.
- **JWT (JSON Web Tokens)**: Generates signed, tamper-proof session tokens (`jsonwebtoken`) for stateless authentication.
- **Profile & Cursor Color Customization**: Users select their signature cursor/nametag color during signup.
- **Protected Access**: Gatekeeps the entire editor workspace so only verified users can access documents and collaborative rooms.
- **Session Management (`authService.js`)**: Automatic token verification on startup, persistent session storage, and instant one-click logout.

### 2. Module 2: Workspace & Document Management (Dashboard + REST API)
- **Workspace Dashboard (`Dashboard.jsx`)**: Google Drive / Notion-style workspace dashboard to organize all user documents.
- **Multi-Document Support**: Seamlessly create, open, search, rename, and delete multiple collaborative documents.
- **Search & Filtering**: Real-time search by title, room channel slug, or content excerpt; sort by recently modified, creation date, or title.
- **Starter Templates**: Quickly initialize documents with Blank, Meeting Notes, or Project Roadmap templates.
- **Grid & List Views**: Easily toggle between visual cards view and compact table list view.
- **Live User Badges**: Shows active online user count on each document card in real-time.
- **REST API Endpoints (`documents.cjs`)**: Full CRUD support (`GET /api/documents`, `POST /api/documents`, `PUT /api/documents/:room`, `DELETE /api/documents/:room`).

### 3. Module 3: Core Markdown Editor & Live Preview
- **Editor**: Built on CodeMirror 6 with syntax highlighting for Markdown and embedded code blocks.
- **Live Preview**: Real-time rendering of GitHub Flavored Markdown (tables, checklists, quotes, and headings) via React-Markdown + Remark-GFM.
- **View Options**: Supports Split View (50/50), Editor Only, and Preview Only modes.
- **Toolbar**: Quick formatting utilities for bold, italic, code blocks, lists, links, tables, and horizontal rules.

### 4. Module 4: Real-Time Collaboration & CRDT Sync (Yjs + WebSockets)
- **Yjs CRDT Engine**: Decentralized conflict-free replicated data types ensuring that simultaneous edits merge cleanly without conflicts.
- **WebSockets Transport (`server.cjs`)**: Custom Node.js WebSocket server handling document synchronization and user presence.
- **Awareness & Presence**: Displays active users in the room, their live cursor positions, and customized cursor tags.
- **Multi-Room Support**: Document isolation via URL room parameters (`?room=<room-name>`).

### 5. Module 5: Version Control & History Snapshots (Revisions, Diff & Rollback)
- **Revision History Drawer (`VersionHistoryModal.jsx`)**: Visual version control modal tracking document checkpoints over time.
- **Manual & Automatic Snapshots**: Save labeled revision points (e.g., "Draft 1", "Before Refactor") at any time.
- **Line-by-Line Diff Engine**: Built-in diff view highlighting added lines in green (`+`) and removed lines in red (`-`) compared to current document.
- **One-Click Rollback / Restore**: Restore any historical version; server immediately updates the active Yjs document and broadcasts the restored text to all connected peers in real-time!
- **Snapshot REST API (`documents.cjs`)**: Endpoints for listing, creating, previewing, and rolling back snapshots (`/api/documents/:room/snapshots`).

### 6. Module 6: Caching & Data Persistence (Redis + MongoDB)
- **MongoDB Persistence (`persistence.cjs`)**: Stores binary Yjs state updates and raw Markdown text in MongoDB via Mongoose.
- **Redis High-Speed Caching**: Caches recent room states and metadata in Redis for sub-millisecond retrieval on client reconnects.
- **Debounced Auto-Save**: Batches keystroke writes every 2 seconds to avoid overloading database I/O while keeping data safe.
- **Immediate Flush**: Saves document immediately when the last collaborator leaves the room or when the server gracefully shuts down.
- **Resilient Fallback**: If MongoDB or Redis is offline, operates seamlessly with an in-memory cache and local disk storage backup (`./data/documents/`).

---

## How to Run

### Step 1: Start Collaboration, Persistence, Auth & Document Server
```bash
npm run server
```
The server listens on `ws://localhost:1234` for real-time WebSocket sync and provides REST API endpoints at `http://localhost:1234`.

### Step 2: Start Frontend Application
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Testing the Full Workflow

1. **User Authentication (Module 1)**:
   - On opening `http://localhost:5173`, create a new account or log in.
   - Pick a custom cursor color. Once logged in, your verified profile is displayed.

2. **Workspace Document Management (Module 2)**:
   - Upon login, the app opens the **Workspace Dashboard**.
   - Click **"+ New Document"** to create a document with a custom title or choose a template like *Meeting Notes*.
   - Try the search bar, sort dropdown, and grid/list view toggle.
   - Click a document card to open it in the collaborative editor.
   - In the editor header, click **"Workspace"** to return back to the Dashboard.

3. **Real-Time Collaboration & CRDT Sync (Modules 3 & 4)**:
   - Open two browser tabs side-by-side on the same document URL.
   - See both users in the collaborator avatar stack with live colored cursors.
   - Type in one tab and watch edits merge instantly without conflict in the other.

4. **Version Control & Snapshots (Module 5)**:
   - In the editor toolbar, click **"History"**.
   - Click **"Save Checkpoint"** and enter a label (e.g. "Version 1.0").
   - Close the modal, type additional paragraphs, then reopen **"History"**.
   - Notice the **Diff** view highlighting newly added lines in green and deletions in red.
   - Click **"Restore This Version"** — the document instantly rolls back and syncs to all connected peers!

5. **Persistence & Caching (Module 6)**:
   - Make edits, close the browser, and restart the server.
   - Reopen `http://localhost:5173` — all documents, revision histories, and user sessions persist flawlessly!
