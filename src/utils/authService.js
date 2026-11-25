// Client-side authentication service (handles JWT tokens and API requests)

const TOKEN_KEY = 'sync_md_jwt_token';
const USER_KEY = 'sync_md_auth_user';

// Determine backend URL (works seamlessly with Vite proxy or direct calls)
const getApiBase = () => {
  // If running via Vite dev server, /api is proxied to backend port 1234
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return '/api/auth';
  }
  // Direct fallback
  return 'http://localhost:1234/api/auth';
};

export const authService = {
  // 1. Get stored JWT token
  getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  },

  // 2. Get stored user profile
  getUser() {
    try {
      const data = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  // 3. Save authentication session (token & user)
  saveSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (err) {
      console.error('Error saving auth session:', err);
    }
  },

  // 4. Clear authentication session
  clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (err) {
      console.error('Error clearing auth session:', err);
    }
  },

  // 5. Register new user
  async register({ username, email, password, color }) {
    const res = await fetch(`${getApiBase()}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, color })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Registration failed');
    }

    if (data.token && data.user) {
      this.saveSession(data.token, data.user);
    }

    return data;
  },

  // 6. Login user
  async login({ identifier, password }) {
    const res = await fetch(`${getApiBase()}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Invalid credentials');
    }

    if (data.token && data.user) {
      this.saveSession(data.token, data.user);
    }

    return data;
  },

  // 7. Verify existing JWT token with server
  async verifyMe() {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${getApiBase()}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        this.clearSession();
        return null;
      }

      const data = await res.json();
      if (data.success && data.user) {
        this.saveSession(token, data.user);
        return data.user;
      }
      return null;
    } catch (err) {
      console.warn('Token verification network warning, using cached session if present');
      return this.getUser();
    }
  },

  // 8. Logout
  async logout() {
    try {
      await fetch(`${getApiBase()}/logout`, { method: 'POST' });
    } catch {
      // ignore network errors on logout
    }
    this.clearSession();
  }
};
