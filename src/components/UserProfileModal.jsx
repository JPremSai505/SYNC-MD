import React, { useState } from 'react';
import { X, Check, RefreshCw, User, Palette } from 'lucide-react';
import { PRESET_COLORS, generateRandomUser } from '../utils/userGenerator';

function UserProfileModal({ isOpen, onClose, currentUser, onSaveUser }) {
  if (!isOpen) return null;

  const [name, setName] = useState(currentUser.name);
  const [selectedColor, setSelectedColor] = useState(currentUser.color);
  const [selectedColorLight, setSelectedColorLight] = useState(currentUser.colorLight);

  // Generate a random username and color
  const handleRandomize = () => {
    const random = generateRandomUser();
    setName(random.name);
    setSelectedColor(random.color);
    setSelectedColorLight(random.colorLight);
  };

  const handleSelectColor = (preset) => {
    setSelectedColor(preset.color);
    setSelectedColorLight(preset.colorLight);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    const initials = cleanName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    onSaveUser({
      name: cleanName,
      color: selectedColor,
      colorLight: selectedColorLight,
      avatar: initials || 'U'
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <User className="modal-icon" size={18} />
            <h3>Collaborator Profile</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Avatar Preview */}
          <div className="avatar-preview-section">
            <div 
              className="large-avatar-preview" 
              style={{ backgroundColor: selectedColor }}
            >
              {name.trim().substring(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="avatar-preview-meta">
              <span className="preview-label">Live Cursor Badge</span>
              <div 
                className="cursor-badge-preview" 
                style={{ backgroundColor: selectedColor }}
              >
                {name || 'Anonymous User'}
              </div>
            </div>
          </div>

          {/* Username Input */}
          <div className="form-group">
            <label htmlFor="user-name-input">Username</label>
            <div className="input-with-action">
              <input
                id="user-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="Enter your name"
                required
              />
              <button 
                type="button" 
                className="random-btn" 
                onClick={handleRandomize} 
                title="Generate Random Profile"
              >
                <RefreshCw size={14} />
                <span>Random</span>
              </button>
            </div>
          </div>

          {/* Color Selection */}
          <div className="form-group">
            <label><Palette size={14} /> Cursor Color</label>
            <div className="color-palette-grid">
              {PRESET_COLORS.map((preset) => (
                <button
                  type="button"
                  key={preset.color}
                  className={`color-swatch ${selectedColor === preset.color ? 'selected' : ''}`}
                  style={{ backgroundColor: preset.color }}
                  onClick={() => handleSelectColor(preset)}
                  title={preset.name}
                >
                  {selectedColor === preset.color && <Check size={14} color="#000" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UserProfileModal;
