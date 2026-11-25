import React, { useState, useEffect } from 'react';
import { 
  History, RotateCcw, Clock, User, Plus, Check, 
  GitCommit, ArrowLeft, Eye, SplitSquareVertical, AlertCircle, X, ShieldAlert
} from 'lucide-react';
import { documentService } from '../utils/documentService';

// Simple line-by-line diff calculator comparing two text versions
function computeLineDiff(oldText, currentText) {
  const oldLines = oldText ? oldText.split('\n') : [];
  const currentLines = currentText ? currentText.split('\n') : [];

  const diffResult = [];
  const maxLen = Math.max(oldLines.length, currentLines.length);

  // Simple alignment comparison
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < currentLines.length) {
    const oLine = oldLines[i];
    const cLine = currentLines[j];

    if (i >= oldLines.length) {
      // Line only exists in current version (added since snapshot)
      diffResult.push({ type: 'added', text: cLine, lineNum: j + 1 });
      j++;
    } else if (j >= currentLines.length) {
      // Line only existed in snapshot (removed in current version)
      diffResult.push({ type: 'removed', text: oLine, lineNum: i + 1 });
      i++;
    } else if (oLine === cLine) {
      // Unchanged line
      diffResult.push({ type: 'unchanged', text: oLine, lineNum: i + 1 });
      i++;
      j++;
    } else {
      // Lookahead check for insertion or deletion
      const nextMatchingCurrent = currentLines.indexOf(oLine, j);
      const nextMatchingOld = oldLines.indexOf(cLine, i);

      if (nextMatchingCurrent !== -1 && (nextMatchingOld === -1 || nextMatchingCurrent - j <= nextMatchingOld - i)) {
        // Current lines were added
        while (j < nextMatchingCurrent) {
          diffResult.push({ type: 'added', text: currentLines[j], lineNum: j + 1 });
          j++;
        }
      } else if (nextMatchingOld !== -1) {
        // Old lines were removed
        while (i < nextMatchingOld) {
          diffResult.push({ type: 'removed', text: oldLines[i], lineNum: i + 1 });
          i++;
        }
      } else {
        // Modified line
        diffResult.push({ type: 'removed', text: oLine, lineNum: i + 1 });
        diffResult.push({ type: 'added', text: cLine, lineNum: j + 1 });
        i++;
        j++;
      }
    }
  }

  return diffResult;
}

function VersionHistoryModal({ 
  isOpen, 
  onClose, 
  roomName, 
  currentDocText, 
  onRestoreSuccess 
}) {
  const [snapshots, setSnapshots] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [diffMode, setDiffMode] = useState('diff'); // 'diff' | 'preview'
  const [restoring, setRestoring] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Fetch list of snapshots on modal open
  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const list = await documentService.getSnapshots(roomName);
      setSnapshots(list);

      // Select latest snapshot by default if none selected
      if (list.length > 0) {
        const targetId = selectedVersionId || list[0].versionId;
        setSelectedVersionId(targetId);
        loadSnapshotDetail(targetId);
      } else {
        setSelectedSnapshot(null);
      }
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSnapshots();
    }
  }, [isOpen, roomName]);

  // Load details for a selected snapshot
  const loadSnapshotDetail = async (versionId) => {
    try {
      setLoadingDetail(true);
      setSelectedVersionId(versionId);
      const detail = await documentService.getSnapshotDetail(roomName, versionId);
      setSelectedSnapshot(detail);
    } catch (err) {
      console.error('Failed to load snapshot details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Create a manual snapshot checkpoint
  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (isCreating) return;

    try {
      setIsCreating(true);
      const title = snapshotLabel.trim() || `Manual Checkpoint ${new Date().toLocaleTimeString()}`;
      const created = await documentService.createSnapshot(roomName, title);

      setSnapshotLabel('');
      setShowCreateInput(false);
      setFeedbackMsg({ type: 'success', text: `Snapshot "${created.title}" saved!` });
      setTimeout(() => setFeedbackMsg(null), 3000);

      await fetchSnapshots();
      loadSnapshotDetail(created.versionId);
    } catch (err) {
      alert('Error creating snapshot: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Rollback / restore to selected snapshot
  const handleRestoreVersion = async () => {
    if (!selectedSnapshot) return;
    const confirmRestore = window.confirm(
      `Are you sure you want to restore the document to Version ${selectedSnapshot.versionNumber} ("${selectedSnapshot.title}")?\n\nThis will update the active document for all connected users.`
    );
    if (!confirmRestore) return;

    try {
      setRestoring(true);
      await documentService.restoreSnapshot(roomName, selectedSnapshot.versionId);
      setFeedbackMsg({
        type: 'success',
        text: `Restored to Version ${selectedSnapshot.versionNumber}! All users updated.`
      });

      if (onRestoreSuccess) {
        onRestoreSuccess(selectedSnapshot.content);
      }

      setTimeout(() => {
        setFeedbackMsg(null);
        onClose();
      }, 1500);
    } catch (err) {
      alert('Failed to restore snapshot: ' + err.message);
    } finally {
      setRestoring(false);
    }
  };

  if (!isOpen) return null;

  // Compute diff if snapshot is loaded
  const diffLines = selectedSnapshot 
    ? computeLineDiff(selectedSnapshot.content, currentDocText) 
    : [];

  const addedCount = diffLines.filter(l => l.type === 'added').length;
  const removedCount = diffLines.filter(l => l.type === 'removed').length;

  return (
    <div className="history-modal-backdrop" onClick={onClose}>
      <div className="history-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="history-modal-header">
          <div className="history-header-left">
            <History size={18} className="history-title-icon" />
            <div>
              <h3>Version Control & History</h3>
              <span className="history-subtitle">Track document revisions, compare line diffs & roll back anytime</span>
            </div>
          </div>

          <div className="history-header-right">
            {!showCreateInput ? (
              <button 
                type="button" 
                className="btn-create-snapshot"
                onClick={() => setShowCreateInput(true)}
              >
                <Plus size={14} />
                <span>Save Checkpoint</span>
              </button>
            ) : (
              <form onSubmit={handleCreateSnapshot} className="snapshot-input-form">
                <input
                  type="text"
                  placeholder="Snapshot label..."
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  autoFocus
                  className="snapshot-quick-input"
                />
                <button type="submit" className="btn-snapshot-save" disabled={isCreating}>
                  <Check size={14} />
                </button>
                <button 
                  type="button" 
                  className="btn-snapshot-cancel" 
                  onClick={() => setShowCreateInput(false)}
                >
                  <X size={14} />
                </button>
              </form>
            )}

            <button type="button" className="modal-close-icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {feedbackMsg && (
          <div className={`history-alert-toast ${feedbackMsg.type}`}>
            <Check size={14} />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Main Content: Split Snapshots List & Diff Inspector */}
        <div className="history-modal-body">
          {/* Left Column: Revision Timeline List */}
          <div className="history-sidebar">
            <div className="sidebar-header">
              <GitCommit size={14} />
              <span>REVISIONS ({snapshots.length})</span>
            </div>

            {loading ? (
              <div className="history-empty-message">Loading snapshots...</div>
            ) : snapshots.length === 0 ? (
              <div className="history-empty-message">
                <p>No snapshots taken yet.</p>
                <small>Click "Save Checkpoint" above to save your first revision point.</small>
              </div>
            ) : (
              <div className="snapshots-list">
                {snapshots.map(s => {
                  const isSelected = selectedVersionId === s.versionId;
                  return (
                    <div
                      key={s.versionId}
                      className={`snapshot-item ${isSelected ? 'active' : ''}`}
                      onClick={() => loadSnapshotDetail(s.versionId)}
                    >
                      <div className="snapshot-badge">
                        v{s.versionNumber}
                      </div>
                      <div className="snapshot-meta">
                        <strong className="snapshot-label">{s.title}</strong>
                        <div className="snapshot-subtext">
                          <span className="subtext-time">
                            <Clock size={11} />
                            {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="subtext-author">
                            <User size={11} />
                            {s.createdBy}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Diff / Snapshot Content Inspector */}
          <div className="history-inspector">
            {selectedSnapshot ? (
              <>
                {/* Inspector Header */}
                <div className="inspector-header">
                  <div className="inspector-info">
                    <h4>
                      Version {selectedSnapshot.versionNumber}: {selectedSnapshot.title}
                    </h4>
                    <span className="inspector-timestamp">
                      Saved by <strong>{selectedSnapshot.createdBy}</strong> on{' '}
                      {new Date(selectedSnapshot.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="inspector-actions">
                    {/* View mode toggle */}
                    <div className="diff-mode-toggle">
                      <button 
                        type="button" 
                        className={`diff-toggle-btn ${diffMode === 'diff' ? 'active' : ''}`}
                        onClick={() => setDiffMode('diff')}
                        title="View changes against current version"
                      >
                        <SplitSquareVertical size={13} />
                        <span>Diff</span>
                        {addedCount + removedCount > 0 && (
                          <span className="diff-count-pill">
                            +{addedCount} -{removedCount}
                          </span>
                        )}
                      </button>
                      <button 
                        type="button" 
                        className={`diff-toggle-btn ${diffMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setDiffMode('preview')}
                        title="View exact markdown snapshot"
                      >
                        <Eye size={13} />
                        <span>Full Text</span>
                      </button>
                    </div>

                    {/* Restore Button */}
                    <button 
                      type="button" 
                      className="btn-restore-version"
                      onClick={handleRestoreVersion}
                      disabled={restoring}
                      title="Roll back current document to this snapshot"
                    >
                      <RotateCcw size={14} className={restoring ? 'spin' : ''} />
                      <span>{restoring ? 'Restoring...' : 'Restore This Version'}</span>
                    </button>
                  </div>
                </div>

                {/* Inspector Body */}
                <div className="inspector-body">
                  {loadingDetail ? (
                    <div className="history-empty-message">Loading version details...</div>
                  ) : diffMode === 'diff' ? (
                    /* Diff View */
                    <div className="diff-view-container">
                      <div className="diff-legend">
                        <span className="legend-item"><span className="dot red" /> Removed in current</span>
                        <span className="legend-item"><span className="dot green" /> Added in current</span>
                        <span className="legend-item"><span className="dot gray" /> Unchanged</span>
                      </div>
                      <div className="diff-lines-list">
                        {diffLines.length === 0 ? (
                          <div className="diff-identical-banner">
                            <Check size={16} color="#10b981" />
                            <span>This snapshot is identical to the current document state.</span>
                          </div>
                        ) : (
                          diffLines.map((line, idx) => (
                            <div key={idx} className={`diff-line ${line.type}`}>
                              <span className="diff-line-number">{line.lineNum}</span>
                              <span className="diff-line-marker">
                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                              </span>
                              <pre className="diff-line-code">{line.text || ' '}</pre>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Full Markdown Preview */
                    <div className="snapshot-raw-preview">
                      <pre>{selectedSnapshot.content || '(Empty snapshot)'}</pre>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="history-no-selection">
                <History size={36} />
                <p>Select a version on the left to preview changes and roll back.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VersionHistoryModal;

