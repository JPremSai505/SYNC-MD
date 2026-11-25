import React from 'react';
import { Cpu, Hash, Clock, CheckCircle, Database, ShieldCheck } from 'lucide-react';

function StatusBar({ text = '', roomName, peerCount, isSynced = true, currentUser }) {
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split('\n').length : 1;
  const readTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <footer className="editor-statusbar">
      <div className="statusbar-left">
        <div className="status-item engine-badge">
          <Cpu size={12} />
          <span>Yjs CRDT</span>
        </div>
        <div className="statusbar-separator" />
        <div className="status-item">
          <Hash size={12} />
          <span>Room: {roomName}</span>
        </div>
        <div className="statusbar-separator" />
        <div className="status-item">
          <CheckCircle size={12} color={isSynced ? '#10b981' : '#f59e0b'} />
          <span>{isSynced ? 'Synced' : 'Syncing...'}</span>
        </div>
        <div className="statusbar-separator" />
        <div className="status-item" title="Data auto-saved to MongoDB & cached in Redis">
          <Database size={12} color="#10b981" />
          <span>MongoDB & Redis</span>
        </div>
        {currentUser && (
          <>
            <div className="statusbar-separator" />
            <div className="status-item auth-verified-badge" title="Authenticated with JWT (Module 1)">
              <ShieldCheck size={12} color="#10b981" />
              <span>Verified: @{currentUser.username || currentUser.name}</span>
            </div>
          </>
        )}
      </div>

      <div className="statusbar-right">
        <div className="status-item">
          <span>{lineCount} lines</span>
        </div>
        <div className="statusbar-separator" />
        <div className="status-item">
          <span>{wordCount} words</span>
        </div>
        <div className="statusbar-separator" />
        <div className="status-item">
          <span>{charCount} chars</span>
        </div>
        <div className="statusbar-separator" />
        <div className="status-item" title="Reading time">
          <Clock size={12} />
          <span>{readTimeMin} min read</span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
