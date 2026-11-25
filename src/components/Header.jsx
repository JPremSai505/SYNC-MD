import React, { useState } from 'react';
import { Users, Share2, Wifi, WifiOff, Loader2, Settings, Check, Hash, FileCode, LogOut, ShieldCheck, ArrowLeft } from 'lucide-react';

function Header({
  roomName,
  docTitle,
  onRoomChange,
  onBackToDashboard,
  status,
  collaborators,
  currentUser,
  onOpenProfile,
  onLogout
}) {
  const [copied, setCopied] = useState(false);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [tempRoom, setTempRoom] = useState(roomName);

  // Copy shareable room link to clipboard
  const handleShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomName);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Submit edited room name
  const handleRoomSubmit = (e) => {
    e.preventDefault();
    const sanitized = tempRoom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (sanitized && sanitized !== roomName) {
      onRoomChange(sanitized);
    }
    setIsEditingRoom(false);
  };

  // Render connection status indicator
  const renderStatus = () => {
    if (status === 'connected') {
      return (
        <div className="status-badge connected">
          <span className="pulse-dot" />
          <Wifi size={13} />
          <span>Connected</span>
        </div>
      );
    }
    if (status === 'connecting') {
      return (
        <div className="status-badge connecting">
          <Loader2 size={13} className="spin" />
          <span>Connecting</span>
        </div>
      );
    }
    return (
      <div className="status-badge disconnected">
        <WifiOff size={13} />
        <span>Offline</span>
      </div>
    );
  };

  return (
    <header className="app-header">
      {/* Left: Dashboard Back Button, App Logo & Room Identifier */}
      <div className="header-left">
        {onBackToDashboard && (
          <button
            type="button"
            className="back-to-dashboard-btn"
            onClick={onBackToDashboard}
            title="Return to Workspace Documents Dashboard"
          >
            <ArrowLeft size={14} />
            <span>Workspace</span>
          </button>
        )}

        <div className="brand-logo">
          <div className="logo-icon-wrap">
            <FileCode className="logo-icon" size={18} />
          </div>
          <div className="brand-text">
            <h2>SyncMD</h2>
            <span className="brand-tag">Collaborative</span>
          </div>
        </div>

        {docTitle && (
          <div className="header-doc-title" title={docTitle}>
            <span>{docTitle}</span>
          </div>
        )}

        <div className="room-selector-container">
          {isEditingRoom ? (
            <form onSubmit={handleRoomSubmit} className="room-edit-form">
              <Hash size={14} className="room-hash-icon" />
              <input
                type="text"
                value={tempRoom}
                onChange={(e) => setTempRoom(e.target.value)}
                onBlur={handleRoomSubmit}
                autoFocus
                placeholder="room-name"
                className="room-input"
              />
            </form>
          ) : (
            <div
              className="room-badge"
              onClick={() => { setTempRoom(roomName); setIsEditingRoom(true); }}
              title="Click to switch room"
            >
              <Hash size={13} />
              <span className="room-name-text">{roomName}</span>
              <span className="room-edit-hint">edit</span>
            </div>
          )}
        </div>
      </div>

      {/* Middle: Connection Status */}
      <div className="header-center">
        {renderStatus()}
      </div>

      {/* Right: Collaborators, Share, and User Profile */}
      <div className="header-right">
        {/* Active Collaborators Avatar Stack */}
        <div className="collaborators-group" title={`${collaborators.length} user(s) online`}>
          <div className="collaborators-stack">
            {collaborators.map((user, idx) => (
              <div
                key={user.clientId || idx}
                className="user-avatar-circle"
                style={{
                  backgroundColor: user.color || '#3b82f6',
                  zIndex: 10 + idx
                }}
                title={`${user.name || 'Anonymous'}${user.isSelf ? ' (You)' : ''}`}
              >
                {user.avatar || (user.name ? user.name.substring(0, 2).toUpperCase() : 'U')}
                {user.isSelf && <span className="self-indicator" />}
              </div>
            ))}
          </div>
          <span className="collaborator-count-text">
            <Users size={13} />
            <span>{collaborators.length}</span>
          </span>
        </div>

        {/* Share Room Button */}
        <div className="share-btn-wrapper">
          <button
            type="button"
            className="share-btn"
            onClick={handleShare}
            title="Copy room link to invite collaborators"
          >
            {copied ? <Check size={14} /> : <Share2 size={14} />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>

        {/* User Profile Pill */}
        <button
          type="button"
          className="user-profile-trigger"
          onClick={onOpenProfile}
          title="Change your cursor color"
        >
          <div
            className="profile-pill-avatar"
            style={{ backgroundColor: currentUser.color }}
          >
            {currentUser.avatar || (currentUser.name ? currentUser.name.substring(0, 2).toUpperCase() : 'U')}
          </div>
          <span className="profile-pill-name">{currentUser.name || currentUser.username}</span>
          <ShieldCheck size={13} color="#10b981" title="Verified User (Module 1)" />
          <Settings size={13} className="profile-settings-icon" />
        </button>

        {/* Logout Action Button */}
        {onLogout && (
          <button
            type="button"
            className="header-logout-btn"
            onClick={onLogout}
            title="Log out of SyncMD"
          >
            <LogOut size={13} />
            <span>Logout</span>
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
