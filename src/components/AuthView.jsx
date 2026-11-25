import React, { useState } from 'react';
import { 
  FileCode, Lock, Mail, User, ShieldCheck, 
  ArrowRight, Check, AlertCircle, Loader2, Sparkles, KeyRound 
} from 'lucide-react';
import { authService } from '../utils/authService';
import { PRESET_COLORS } from '../utils/userGenerator';

function AuthView({ onAuthSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].color);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please provide your email/username and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await authService.login({
        identifier: identifier.trim(),
        password
      });
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const data = await authService.register({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        color: selectedColor
      });
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // Quick fill demo user for easy evaluation/presentation
  const fillDemoAccount = (demoRole) => {
    setError('');
    if (demoRole === 'professor') {
      setMode('signin');
      setIdentifier('professor@syncmd.edu');
      setPassword('syncmd2026');
    } else {
      setMode('signup');
      const randomNum = Math.floor(100 + Math.random() * 900);
      setUsername(`Student_${randomNum}`);
      setEmail(`student_${randomNum}@college.edu`);
      setPassword('password123');
      setSelectedColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)].color);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="auth-logo-wrap">
            <FileCode size={26} className="auth-logo-icon" />
          </div>
          <h2>SyncMD</h2>
          <p className="auth-tagline">Real-Time Collaborative Markdown Workspace</p>
          <div className="auth-security-badge">
            <ShieldCheck size={13} color="#10b981" />
            <span>Secure JWT & bcrypt Authentication (Module 1)</span>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => { setMode('signin'); setError(''); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); }}
          >
            Create Account
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="auth-error-alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Sign In Form */}
        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="auth-form">
            <div className="auth-form-group">
              <label htmlFor="signin-id">Email or Username</label>
              <div className="auth-input-wrap">
                <User size={16} className="input-icon" />
                <input
                  id="signin-id"
                  type="text"
                  placeholder="e.g. alex or alex@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <label htmlFor="signin-pwd">Password</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="input-icon" />
                <input
                  id="signin-pwd"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
              <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
            </button>
          </form>
        ) : (
          /* Sign Up Form */
          <form onSubmit={handleSignUp} className="auth-form">
            <div className="auth-form-group">
              <label htmlFor="signup-user">Display Username</label>
              <div className="auth-input-wrap">
                <User size={16} className="input-icon" />
                <input
                  id="signup-user"
                  type="text"
                  placeholder="e.g. Jordan_902"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <label htmlFor="signup-email">Email Address</label>
              <div className="auth-input-wrap">
                <Mail size={16} className="input-icon" />
                <input
                  id="signup-email"
                  type="email"
                  placeholder="e.g. jordan@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <label htmlFor="signup-pwd">Password (min 6 characters)</label>
              <div className="auth-input-wrap">
                <KeyRound size={16} className="input-icon" />
                <input
                  id="signup-pwd"
                  type="password"
                  placeholder="Create a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            {/* Custom Collaborative Cursor Color */}
            <div className="auth-form-group">
              <label>Collaborative Cursor Color</label>
              <div className="auth-color-grid">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.color}
                    type="button"
                    className={`auth-color-swatch ${selectedColor === preset.color ? 'selected' : ''}`}
                    style={{ backgroundColor: preset.color }}
                    onClick={() => setSelectedColor(preset.color)}
                    title={preset.name}
                  >
                    {selectedColor === preset.color && <Check size={13} color="#000" strokeWidth={3} />}
                  </button>
                ))}
              </div>
              {/* Live Preview of Cursor Badge */}
              <div className="auth-cursor-preview">
                <span className="preview-label">Your Live Tag:</span>
                <span 
                  className="auth-preview-tag"
                  style={{ backgroundColor: selectedColor }}
                >
                  {username || 'Anonymous'}
                </span>
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              <span>{loading ? 'Creating Account...' : 'Create Account & Join'}</span>
            </button>
          </form>
        )}

        {/* Demo Fast-Fill Shortcuts for Presentation */}
        <div className="auth-demo-section">
          <span className="demo-hint-text">Quick Demo Presets for Testing:</span>
          <div className="demo-btn-group">
            <button
              type="button"
              className="demo-pill-btn"
              onClick={() => fillDemoAccount('student')}
            >
              Fill Fresh Student
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthView;
