import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Plus, Search, Trash2, Edit3, Share2, ExternalLink, 
  Clock, User, Check, Sparkles, Folder, LogOut, Grid, List as ListIcon,
  Radio, BookOpen, AlertCircle
} from 'lucide-react';
import { documentService } from '../utils/documentService';

const STARTER_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Clean canvas to write freely',
    content: '# Untitled Document\n\n'
  },
  {
    id: 'notes',
    name: 'Meeting Notes',
    description: 'Attendees, agenda, discussion, action items',
    content: `# Team Meeting Notes\n\n**Date:** ${new Date().toLocaleDateString()}\n**Attendees:** \n\n## Agenda\n- Discussion point 1\n- Discussion point 2\n\n## Decisions\n- Decision 1\n\n## Action Items\n- [ ] Task 1 (Assignee)\n- [ ] Task 2 (Assignee)\n`
  },
  {
    id: 'project',
    name: 'Project Plan',
    description: 'Milestones, architecture & checklist',
    content: `# Project Roadmap\n\n## Overview\nBrief description of project goals and objectives.\n\n## Architecture\n- **Frontend:** React + CodeMirror 6\n- **Sync:** Yjs CRDT + WebSockets\n- **Backend:** Node.js + Redis + MongoDB\n\n## Milestones\n- [ ] Phase 1: MVP Setup\n- [ ] Phase 2: Collaboration Sync\n- [ ] Phase 3: Launch & Testing\n`
  }
];

function Dashboard({ authUser, onSelectDocument, onLogout }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt'); // 'updatedAt' | 'title' | 'createdAt'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [creating, setCreating] = useState(false);

  // Rename inline state
  const [renamingRoom, setRenamingRoom] = useState(null);
  const [renameInput, setRenameInput] = useState('');

  // Copied indicator
  const [copiedRoom, setCopiedRoom] = useState(null);

  // Fetch document workspace on mount
  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await documentService.getDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err.message || 'Could not load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Filter & sort documents
  const filteredDocuments = useMemo(() => {
    let result = documents.filter(doc => {
      const q = searchQuery.toLowerCase();
      const matchTitle = (doc.title || '').toLowerCase().includes(q);
      const matchRoom = (doc.roomName || '').toLowerCase().includes(q);
      const matchSnippet = (doc.snippet || '').toLowerCase().includes(q);
      return matchTitle || matchRoom || matchSnippet;
    });

    result.sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'createdAt') {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return result;
  }, [documents, searchQuery, sortBy]);

  // Create new document
  const handleCreateDocument = async (e) => {
    e.preventDefault();
    if (creating) return;

    try {
      setCreating(true);
      const title = newTitle.trim() || 'Untitled Document';
      const template = STARTER_TEMPLATES.find(t => t.id === selectedTemplate) || STARTER_TEMPLATES[0];

      const created = await documentService.createDocument({
        title,
        roomName: newRoomName.trim(),
        initialContent: template.content
      });

      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewRoomName('');
      setSelectedTemplate('blank');

      // Refresh list and navigate straight into the new document
      await fetchDocuments();
      onSelectDocument(created.roomName, created.title);
    } catch (err) {
      alert('Failed to create document: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  // Quick Create (Instant Blank Doc)
  const handleQuickCreate = async () => {
    try {
      const title = `Untitled Document ${documents.length + 1}`;
      const created = await documentService.createDocument({
        title,
        initialContent: `# ${title}\n\n`
      });
      await fetchDocuments();
      onSelectDocument(created.roomName, created.title);
    } catch (err) {
      alert('Error creating document: ' + err.message);
    }
  };

  // Copy shareable link
  const handleCopyLink = (roomName, e) => {
    e.stopPropagation();
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('room', roomName);
    navigator.clipboard.writeText(url.toString());
    setCopiedRoom(roomName);
    setTimeout(() => setCopiedRoom(null), 2000);
  };

  // Delete document
  const handleDeleteDocument = async (roomName, title, e) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Are you sure you want to delete "${title || roomName}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await documentService.deleteDocument(roomName);
      setDocuments(prev => prev.filter(d => d.roomName !== roomName));
    } catch (err) {
      alert('Failed to delete document: ' + err.message);
    }
  };

  // Start renaming
  const handleStartRename = (doc, e) => {
    e.stopPropagation();
    setRenamingRoom(doc.roomName);
    setRenameInput(doc.title || doc.roomName);
  };

  // Save rename
  const handleSaveRename = async (roomName, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!renameInput.trim()) {
      setRenamingRoom(null);
      return;
    }

    try {
      await documentService.updateDocumentTitle(roomName, renameInput.trim());
      setDocuments(prev => prev.map(d => {
        if (d.roomName === roomName) {
          return { ...d, title: renameInput.trim(), updatedAt: new Date().toISOString() };
        }
        return d;
      }));
    } catch (err) {
      alert('Failed to update title: ' + err.message);
    } finally {
      setRenamingRoom(null);
    }
  };

  // Format relative time helper
  const formatTime = (dateStr) => {
    if (!dateStr) return 'Just now';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="dashboard-container">
      {/* Top Header */}
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <div className="brand-logo">
            <div className="logo-icon-wrap">
              <Folder className="logo-icon" size={18} />
            </div>
            <div className="brand-text">
              <h2>SyncMD</h2>
              <span className="brand-tag">Workspace</span>
            </div>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="dashboard-search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search documents by title, room, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="dashboard-search-input"
          />
          {searchQuery && (
            <button 
              className="search-clear-btn" 
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {/* User profile & actions */}
        <div className="dashboard-user-actions">
          <div className="dashboard-user-pill">
            <div 
              className="dashboard-user-avatar" 
              style={{ backgroundColor: authUser?.color || '#38bdf8' }}
            >
              {authUser?.avatar || (authUser?.username ? authUser.username.substring(0, 2).toUpperCase() : 'U')}
            </div>
            <div className="dashboard-user-info">
              <span className="dashboard-user-name">{authUser?.username || 'Collaborator'}</span>
              <span className="dashboard-user-role">Author</span>
            </div>
          </div>

          <button 
            type="button" 
            className="dashboard-logout-btn" 
            onClick={onLogout}
            title="Log out"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="dashboard-body">
        {/* Controls Bar */}
        <div className="dashboard-controls">
          <div className="controls-left">
            <h1 className="dashboard-heading">All Documents</h1>
            <span className="dashboard-count-badge">
              {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
            </span>
          </div>

          <div className="controls-right">
            {/* Sort Dropdown */}
            <div className="sort-selector">
              <span className="sort-label">Sort:</span>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="sort-dropdown"
              >
                <option value="updatedAt">Recently Modified</option>
                <option value="createdAt">Date Created</option>
                <option value="title">Title (A-Z)</option>
              </select>
            </div>

            {/* View Mode Switcher */}
            <div className="view-mode-buttons">
              <button 
                type="button" 
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <Grid size={15} />
              </button>
              <button 
                type="button" 
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <ListIcon size={15} />
              </button>
            </div>

            {/* Create Action Buttons */}
            <div className="create-actions-group">
              <button 
                type="button" 
                className="btn-create-quick"
                onClick={handleQuickCreate}
                title="Quickly create a new blank document"
              >
                <Plus size={15} />
                <span>Quick Blank</span>
              </button>
              <button 
                type="button" 
                className="btn-create-primary"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Sparkles size={15} />
                <span>New Document</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading & Error States */}
        {loading && (
          <div className="dashboard-state-box">
            <div className="pulse-dot" />
            <p>Loading your documents...</p>
          </div>
        )}

        {error && !loading && (
          <div className="dashboard-state-box error">
            <AlertCircle size={24} />
            <p>{error}</p>
            <button className="btn-retry" onClick={fetchDocuments}>Retry</button>
          </div>
        )}

        {/* Empty States */}
        {!loading && !error && filteredDocuments.length === 0 && (
          <div className="dashboard-empty-state">
            <div className="empty-icon-wrap">
              <FileText size={40} />
            </div>
            {searchQuery ? (
              <>
                <h3>No documents match "{searchQuery}"</h3>
                <p>Try searching with another keyword or clear the search filter.</p>
                <button className="btn-secondary" onClick={() => setSearchQuery('')}>
                  Clear search
                </button>
              </>
            ) : (
              <>
                <h3>No documents in your workspace yet</h3>
                <p>Create your first real-time collaborative document or choose a starter template.</p>
                <button 
                  className="btn-create-primary" 
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <Plus size={16} />
                  <span>Create First Document</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Documents Display */}
        {!loading && !error && filteredDocuments.length > 0 && (
          viewMode === 'grid' ? (
            /* Grid View Cards */
            <div className="documents-grid">
              {filteredDocuments.map(doc => (
                <div 
                  key={doc.roomName} 
                  className="doc-card"
                  onClick={() => onSelectDocument(doc.roomName, doc.title)}
                >
                  <div className="doc-card-header">
                    <div className="doc-card-type-icon">
                      <FileText size={18} />
                    </div>

                    {/* Live peers badge */}
                    {doc.activeUsers > 0 && (
                      <div className="live-users-badge" title={`${doc.activeUsers} user(s) currently editing`}>
                        <span className="live-dot" />
                        <span>{doc.activeUsers} live</span>
                      </div>
                    )}

                    <div className="doc-card-actions">
                      <button 
                        type="button" 
                        className="card-action-btn"
                        onClick={(e) => handleCopyLink(doc.roomName, e)}
                        title="Copy share link"
                      >
                        {copiedRoom === doc.roomName ? <Check size={14} color="#10b981" /> : <Share2 size={14} />}
                      </button>
                      <button 
                        type="button" 
                        className="card-action-btn"
                        onClick={(e) => handleStartRename(doc, e)}
                        title="Rename document"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        type="button" 
                        className="card-action-btn danger"
                        onClick={(e) => handleDeleteDocument(doc.roomName, doc.title, e)}
                        title="Delete document"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Title & Editable Title Input */}
                  <div className="doc-card-title-area">
                    {renamingRoom === doc.roomName ? (
                      <form onSubmit={(e) => handleSaveRename(doc.roomName, e)} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onBlur={(e) => handleSaveRename(doc.roomName, e)}
                          autoFocus
                          className="doc-rename-input"
                        />
                      </form>
                    ) : (
                      <h3 className="doc-card-title" title={doc.title}>
                        {doc.title || doc.roomName}
                      </h3>
                    )}
                    <span className="doc-card-room-tag">#{doc.roomName}</span>
                  </div>

                  {/* Snippet Preview */}
                  <p className="doc-card-snippet">
                    {doc.snippet ? doc.snippet.replace(/[#*`_]/g, '').trim() : 'Empty document...'}
                  </p>

                  {/* Card Footer Metadata */}
                  <div className="doc-card-footer">
                    <div className="footer-meta-item">
                      <Clock size={12} />
                      <span>{formatTime(doc.updatedAt)}</span>
                    </div>
                    <div className="footer-meta-item">
                      <User size={12} />
                      <span>{doc.owner}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List / Table View */
            <div className="documents-list-view">
              <div className="list-header-row">
                <span className="col-title">Title</span>
                <span className="col-room">Room ID</span>
                <span className="col-owner">Owner</span>
                <span className="col-updated">Last Modified</span>
                <span className="col-actions">Actions</span>
              </div>
              {filteredDocuments.map(doc => (
                <div 
                  key={doc.roomName} 
                  className="list-item-row"
                  onClick={() => onSelectDocument(doc.roomName, doc.title)}
                >
                  <div className="col-title cell-title">
                    <FileText size={16} className="title-icon" />
                    {renamingRoom === doc.roomName ? (
                      <form onSubmit={(e) => handleSaveRename(doc.roomName, e)} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onBlur={(e) => handleSaveRename(doc.roomName, e)}
                          autoFocus
                          className="doc-rename-input"
                        />
                      </form>
                    ) : (
                      <span className="title-text">{doc.title || doc.roomName}</span>
                    )}
                    {doc.activeUsers > 0 && (
                      <span className="list-live-badge">{doc.activeUsers} online</span>
                    )}
                  </div>
                  <div className="col-room cell-room">
                    <code>#{doc.roomName}</code>
                  </div>
                  <div className="col-owner cell-owner">
                    <span>{doc.owner}</span>
                  </div>
                  <div className="col-updated cell-updated">
                    <span>{formatTime(doc.updatedAt)}</span>
                  </div>
                  <div className="col-actions cell-actions">
                    <button 
                      type="button" 
                      className="list-action-btn"
                      onClick={(e) => handleCopyLink(doc.roomName, e)}
                      title="Copy link"
                    >
                      {copiedRoom === doc.roomName ? <Check size={14} color="#10b981" /> : <Share2 size={14} />}
                    </button>
                    <button 
                      type="button" 
                      className="list-action-btn"
                      onClick={(e) => handleStartRename(doc, e)}
                      title="Rename"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      type="button" 
                      className="list-action-btn danger"
                      onClick={(e) => handleDeleteDocument(doc.roomName, doc.title, e)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* Create New Document Modal */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <Sparkles size={20} className="modal-icon" />
                <h3>Create New Document</h3>
              </div>
              <button 
                type="button" 
                className="modal-close-btn"
                onClick={() => setIsCreateModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="modal-form">
              <div className="form-group">
                <label>Document Title</label>
                <input
                  type="text"
                  placeholder="e.g., Weekly Sync Notes"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    if (!newRoomName || newRoomName === newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
                      setNewRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                    }
                  }}
                  autoFocus
                  required
                  className="modal-input"
                />
              </div>

              <div className="form-group">
                <label>Room Slug / Channel (Optional)</label>
                <div className="input-prefix-wrapper">
                  <span className="input-prefix">#</span>
                  <input
                    type="text"
                    placeholder="custom-room-name"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                    className="modal-input with-prefix"
                  />
                </div>
                <small className="form-hint">Used for the shareable URL and WebSocket room channel.</small>
              </div>

              <div className="form-group">
                <label>Choose Starter Template</label>
                <div className="templates-selector-grid">
                  {STARTER_TEMPLATES.map(tpl => (
                    <div
                      key={tpl.id}
                      className={`template-card-choice ${selectedTemplate === tpl.id ? 'active' : ''}`}
                      onClick={() => setSelectedTemplate(tpl.id)}
                    >
                      <div className="template-header">
                        <BookOpen size={14} />
                        <strong>{tpl.name}</strong>
                      </div>
                      <p>{tpl.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-create-primary"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create & Open Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

