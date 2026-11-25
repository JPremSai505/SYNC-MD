import React, { useState, useEffect } from 'react';
import MarkdownEditor from './components/MarkdownEditor';
import Dashboard from './components/Dashboard';
import AuthView from './components/AuthView';
import { authService } from './utils/authService';

function App() {
  const [currentUser, setCurrentUser] = useState(() => authService.getUser());
  const [loading, setLoading] = useState(true);

  // View state: 'dashboard' | 'editor'
  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ? 'editor' : 'dashboard';
  });

  const [currentRoom, setCurrentRoom] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'sync-md-default';
  });

  const [currentDocTitle, setCurrentDocTitle] = useState('Sync-MD Document');

  // Verify existing JWT token with backend on initial load
  useEffect(() => {
    async function initAuth() {
      try {
        const verifiedUser = await authService.verifyMe();
        if (verifiedUser) {
          setCurrentUser(verifiedUser);
        } else {
          setCurrentUser(null);
        }
      } catch (err) {
        console.warn('Auth initialization notice:', err.message);
      } finally {
        setLoading(false);
      }
    }

    initAuth();
  }, []);

  // Listen to browser popstate (back/forward button)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        setCurrentRoom(roomParam);
        setCurrentView('editor');
      } else {
        setCurrentView('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    // After login, show dashboard if no specific room was requested
    const params = new URLSearchParams(window.location.search);
    if (!params.get('room')) {
      setCurrentView('dashboard');
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setCurrentView('dashboard');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
  };

  // Open a specific document in editor
  const handleSelectDocument = (roomName, title) => {
    setCurrentRoom(roomName);
    setCurrentDocTitle(title || roomName);
    setCurrentView('editor');

    const url = new URL(window.location.href);
    url.searchParams.set('room', roomName);
    window.history.pushState({}, '', url);
  };

  // Return from editor back to workspace dashboard
  const handleBackToDashboard = () => {
    setCurrentView('dashboard');

    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url);
  };

  // Full-screen loading indicator while verifying JWT session
  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-card">
          <div className="pulse-dot" />
          <span>Verifying secure JWT session...</span>
        </div>
      </div>
    );
  }

  // Milestone: Only verified users can access the workspace or editor
  if (!currentUser) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  // Render Dashboard view (Module 2)
  if (currentView === 'dashboard') {
    return (
      <Dashboard
        authUser={currentUser}
        onSelectDocument={handleSelectDocument}
        onLogout={handleLogout}
      />
    );
  }

  // Render Editor view (Modules 3, 4, 5, 6)
  return (
    <MarkdownEditor 
      authUser={currentUser}
      roomName={currentRoom}
      docTitle={currentDocTitle}
      onBackToDashboard={handleBackToDashboard}
      onLogout={handleLogout} 
    />
  );
}

export default App;
