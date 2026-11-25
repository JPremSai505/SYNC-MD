import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { yCollab } from 'y-codemirror.next';

// CodeMirror 6 core modules
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';

// Markdown renderer with GitHub Flavored Markdown support
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// UI Components
import Header from './Header';
import Toolbar from './Toolbar';
import StatusBar from './StatusBar';
import UserProfileModal from './UserProfileModal';
import VersionHistoryModal from './VersionHistoryModal';
import { getStoredUser, saveStoredUser } from '../utils/userGenerator';

// Default document template loaded for new collaborative rooms
const DEFAULT_STARTER_MD = `# Sync-MD: Real-Time Collaborative Markdown Editor

Sync-MD is a full-stack, distributed collaborative editor built using **CRDTs (Yjs)** and **WebSockets**.

---

## Key Features
- **Real-Time Synchronization**: Edits are merged without conflicts across multiple clients.
- **Remote Cursors & Presence**: See active collaborators' cursor positions and selections.
- **Live Markdown Compilation**: GitHub Flavored Markdown compiles instantly.
- **Workspace Dashboard**: Organize, search, and manage multiple documents in one place.
- **Version Control & Snapshots**: Save checkpoint revisions, inspect line diffs, and restore previous versions.
- **Persistence & Caching**: Dual-tier storage with Redis caching and MongoDB persistence.

## Code Example
\`\`\`javascript
// Initializing Yjs CRDT document & WebSocket transport
const ydoc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc);
const ytext = ydoc.getText('codemirror');
\`\`\`

## Complete Implementation Checklist
- [x] Module 1: User Authentication & Security (JWT + bcrypt)
- [x] Module 2: Workspace & Document Management (Multi-Document Dashboard + REST API)
- [x] Module 3: Core Markdown Editor & Live Preview (CodeMirror 6 + GFM)
- [x] Module 4: Real-Time Collaboration & CRDT Sync (Yjs + WebSockets)
- [x] Module 5: Version Control & Snapshots (Revision Timeline, Diff & Rollback)
- [x] Module 6: Caching & Data Persistence (Redis Cache + MongoDB + Disk Fallback)

## Architecture Summary
| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Authentication** | JWT + bcrypt | Secure user signup, login & session validation |
| **Workspace** | REST API + React | Multi-document dashboard, search, slug routing |
| **Editor** | CodeMirror 6 | Robust Markdown syntax highlighting & keymaps |
| **Sync Engine** | Yjs CRDT | Conflict-free replicated data types |
| **Transport** | WebSockets | Real-time binary message broadcast |
| **Version Control** | Custom Snapshots + Diff | Checkpoints, line-by-line diff, and instant rollback |
| **Caching & DB** | Redis + MongoDB | Auto-save, state caching & durable storage |
| **Live Preview** | React-Markdown + GFM | Instant HTML compilation & rendering |
`;

function MarkdownEditor({ 
  authUser, 
  roomName: initialRoom, 
  docTitle, 
  onBackToDashboard, 
  onLogout 
}) {
  // Read room name from prop or URL query param (e.g. ?room=team-notes) or default
  const [roomName, setRoomName] = useState(() => {
    if (initialRoom) return initialRoom;
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'sync-md-default';
  });

  // Keep state in sync if prop changes
  useEffect(() => {
    if (initialRoom && initialRoom !== roomName) {
      setRoomName(initialRoom);
    }
  }, [initialRoom]);

  const [docText, setDocText] = useState('');
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected'
  const [collaborators, setCollaborators] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    if (authUser) {
      return {
        name: authUser.username || authUser.name,
        color: authUser.color || '#38bdf8',
        colorLight: `${authUser.color || '#38bdf8'}33`,
        avatar: authUser.avatar || (authUser.username ? authUser.username.substring(0, 2).toUpperCase() : 'U')
      };
    }
    return getStoredUser();
  });

  // Sync state if authUser changes
  useEffect(() => {
    if (authUser) {
      setCurrentUser({
        name: authUser.username || authUser.name,
        color: authUser.color || '#38bdf8',
        colorLight: `${authUser.color || '#38bdf8'}33`,
        avatar: authUser.avatar || (authUser.username ? authUser.username.substring(0, 2).toUpperCase() : 'U')
      });
    }
  }, [authUser]);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'editor' | 'preview'
  const [copied, setCopied] = useState(false);

  // References for DOM container, CodeMirror view, and Yjs instances
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const providerRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);

  // Handle switching rooms and update URL search params
  const handleRoomChange = (newRoom) => {
    if (newRoom === roomName) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', newRoom);
    window.history.pushState({}, '', url);
    setRoomName(newRoom);
  };

  // Initialize Yjs, WebSocket connection, and CodeMirror 6
  useEffect(() => {
    if (!editorContainerRef.current) return;

    // 1. Create Yjs document and shared text instance
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText('codemirror');
    ytextRef.current = ytext;

    // 2. Connect to WebSocket collaboration server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const wsUrl = `${protocol}//${host}:1234`;

    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    providerRef.current = provider;

    // 3. Register user profile in Yjs awareness for remote cursor rendering
    provider.awareness.setLocalStateField('user', {
      name: currentUser.name,
      color: currentUser.color,
      colorLight: currentUser.colorLight || `${currentUser.color}33`,
      avatar: currentUser.avatar
    });

    // 4. Update online collaborators list when awareness changes
    const handleAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const users = [];
      states.forEach((state, clientId) => {
        if (state.user) {
          users.push({
            clientId,
            ...state.user,
            isSelf: clientId === ydoc.clientID
          });
        }
      });
      setCollaborators(users);
    };
    provider.awareness.on('change', handleAwarenessChange);

    // 5. Track connection status
    provider.on('status', (event) => {
      setStatus(event.status);
    });

    // 6. Sync document changes to React state for the live preview pane
    const handleTextChange = () => {
      setDocText(ytext.toString());
    };
    ytext.observe(handleTextChange);

    // Populate initial starter template if document is newly created
    provider.on('sync', (isSynced) => {
      if (isSynced && ytext.length === 0) {
        ytext.insert(0, DEFAULT_STARTER_MD);
        setDocText(DEFAULT_STARTER_MD);
      } else {
        setDocText(ytext.toString());
      }
    });

    setDocText(ytext.toString());

    // 7. Mount CodeMirror 6 with Yjs collaborative extension
    const undoManager = new Y.UndoManager(ytext);

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        yCollab(ytext, provider.awareness, { undoManager })
      ]
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current
    });
    editorViewRef.current = view;

    // Cleanup resources when room changes or component unmounts
    return () => {
      view.destroy();
      provider.awareness.off('change', handleAwarenessChange);
      ytext.unobserve(handleTextChange);
      try {
        provider.awareness.setLocalState(null);
      } catch (e) {
        // ignore
      }
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomName]);

  // Update user profile and broadcast changes through awareness
  const handleSaveUserProfile = (updatedUser) => {
    setCurrentUser(updatedUser);
    saveStoredUser(updatedUser);
    if (providerRef.current) {
      providerRef.current.awareness.setLocalStateField('user', {
        name: updatedUser.name,
        color: updatedUser.color,
        colorLight: updatedUser.colorLight || `${updatedUser.color}33`,
        avatar: updatedUser.avatar
      });
    }
  };

  // Toolbar formatting helper (wrap selection or insert template)
  const handleFormat = useCallback((prefix, suffix = '', defaultPlaceholder = '') => {
    const view = editorViewRef.current;
    if (!view) return;

    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);

    if (selectedText.length > 0) {
      dispatch({
        changes: { from, to, insert: `${prefix}${selectedText}${suffix}` },
        selection: { anchor: from + prefix.length, head: to + prefix.length }
      });
    } else {
      const insertText = `${prefix}${defaultPlaceholder}${suffix}`;
      dispatch({
        changes: { from, to, insert: insertText },
        selection: {
          anchor: from + prefix.length,
          head: from + prefix.length + defaultPlaceholder.length
        }
      });
    }
    view.focus();
  }, []);

  // Copy raw Markdown content
  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(docText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export current document as .md file
  const handleDownloadMarkdown = () => {
    const blob = new Blob([docText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${roomName || 'document'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Clear document across all peers via Yjs transaction
  const handleClearDoc = () => {
    if (window.confirm('Are you sure you want to clear the document? This will clear it for all connected users.')) {
      if (ytextRef.current && ydocRef.current) {
        ydocRef.current.transact(() => {
          ytextRef.current.delete(0, ytextRef.current.length);
        });
      }
    }
  };

  // Restore snapshot version handler
  const handleRestoreSnapshot = (restoredContent) => {
    if (ytextRef.current && ydocRef.current) {
      ydocRef.current.transact(() => {
        ytextRef.current.delete(0, ytextRef.current.length);
        ytextRef.current.insert(0, restoredContent);
      });
      setDocText(restoredContent);
    }
  };

  return (
    <div className="app-wrapper">
      {/* Top Header */}
      <Header
        roomName={roomName}
        docTitle={docTitle}
        onRoomChange={handleRoomChange}
        onBackToDashboard={onBackToDashboard}
        status={status}
        collaborators={collaborators}
        currentUser={currentUser}
        onOpenProfile={() => setIsProfileOpen(true)}
        onLogout={onLogout}
      />

      {/* Editor Toolbar */}
      <Toolbar
        onFormat={handleFormat}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onCopyMarkdown={handleCopyMarkdown}
        onDownloadMarkdown={handleDownloadMarkdown}
        onClearDoc={handleClearDoc}
        onOpenHistory={() => setIsHistoryOpen(true)}
        copied={copied}
      />

      {/* Main Split-Pane Workspace */}
      <main className={`editor-container layout-${viewMode}`}>
        {/* Left: CodeMirror 6 Editor */}
        <div className={`editor-pane ${viewMode === 'preview' ? 'hidden' : ''}`}>
          <div className="pane-header">
            <div className="pane-title">
              <span className="pane-dot" />
              <span>MARKDOWN SOURCE</span>
            </div>
            <span className="pane-badge">CodeMirror 6</span>
          </div>
          <div className="codemirror-wrapper" ref={editorContainerRef} />
        </div>

        {/* Right: Live Markdown Preview */}
        <div className={`preview-pane ${viewMode === 'editor' ? 'hidden' : ''}`}>
          <div className="pane-header">
            <div className="pane-title">
              <span className="pane-dot green" />
              <span>LIVE HTML PREVIEW</span>
            </div>
            <span className="pane-badge green">ReactMarkdown</span>
          </div>
          <div className="preview-content markdown-body">
            {docText.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {docText}
              </ReactMarkdown>
            ) : (
              <div className="empty-preview-placeholder">
                <p>No content to preview. Start typing in the editor.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Status Bar */}
      <StatusBar
        text={docText}
        roomName={roomName}
        peerCount={collaborators.length}
        isSynced={status === 'connected'}
        currentUser={currentUser}
      />

      {/* User Settings Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onSaveUser={handleSaveUserProfile}
      />

      {/* Version Control & History Modal (Module 5) */}
      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        roomName={roomName}
        currentDocText={docText}
        onRestoreSuccess={handleRestoreSnapshot}
      />
    </div>
  );
}

export default MarkdownEditor;
