const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'sync-md-super-secret-jwt-key-2026';

// Local storage backup directory (in case MongoDB is ever offline)
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// -------------------------------------------------------------
// 1. User Schema & Mongoose Model (MongoDB)
// -------------------------------------------------------------
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true }, // Hashed using bcrypt
  color: { type: String, default: '#38bdf8' },
  avatar: { type: String, default: 'U' },
  createdAt: { type: Date, default: Date.now }
});

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

// -------------------------------------------------------------
// 2. Local File Fallback Helper Methods
// -------------------------------------------------------------
function readFallbackUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Auth] Error reading local users file:', err.message);
  }
  return [];
}

function writeFallbackUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth] Error writing local users file:', err.message);
  }
}

// -------------------------------------------------------------
// 3. Database & Fallback User Operations
// -------------------------------------------------------------
async function findUserByIdentifier(identifier) {
  const cleanId = (identifier || '').trim().toLowerCase();
  
  // Try MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    try {
      const user = await UserModel.findOne({
        $or: [
          { email: cleanId },
          { username: new RegExp(`^${cleanId}$`, 'i') }
        ]
      });
      if (user) return user;
    } catch (err) {
      console.warn('[Auth] MongoDB query failed, checking local file fallback:', err.message);
    }
  }

  // Fallback to local file
  const localUsers = readFallbackUsers();
  return localUsers.find(u => 
    u.email.toLowerCase() === cleanId || 
    u.username.toLowerCase() === cleanId
  ) || null;
}

async function findUserById(id) {
  if (mongoose.connection.readyState === 1) {
    try {
      const user = await UserModel.findById(id);
      if (user) return user;
    } catch {
      // ignore
    }
  }

  const localUsers = readFallbackUsers();
  return localUsers.find(u => (u.id || u._id) === id) || null;
}

async function createUserRecord(userData) {
  let createdUser = null;

  // 1. Try creating in MongoDB
  if (mongoose.connection.readyState === 1) {
    try {
      createdUser = await UserModel.create(userData);
      console.log(`[Auth] User registered in MongoDB: ${userData.username}`);
    } catch (err) {
      console.warn('[Auth] MongoDB create user failed, saving to local file:', err.message);
    }
  }

  // 2. Always backup to local users file
  const localUsers = readFallbackUsers();
  const fallbackRecord = {
    _id: createdUser ? createdUser._id.toString() : 'usr_' + Date.now(),
    id: createdUser ? createdUser._id.toString() : 'usr_' + Date.now(),
    username: userData.username,
    email: userData.email,
    password: userData.password,
    color: userData.color || '#38bdf8',
    avatar: userData.avatar || userData.username.substring(0, 2).toUpperCase(),
    createdAt: new Date().toISOString()
  };

  localUsers.push(fallbackRecord);
  writeFallbackUsers(localUsers);

  if (!createdUser) {
    console.log(`[Auth] User registered in local storage fallback: ${userData.username}`);
    createdUser = fallbackRecord;
  }

  return createdUser;
}

// -------------------------------------------------------------
// 4. Token & Security Helpers
// -------------------------------------------------------------
function generateToken(user) {
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    username: user.username,
    email: user.email,
    color: user.color,
    avatar: user.avatar || user.username.substring(0, 2).toUpperCase()
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Helper to parse JSON request body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      // Safeguard against oversized payloads
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// -------------------------------------------------------------
// 5. Authentication HTTP Route Controller
// -------------------------------------------------------------
async function handleAuthRequest(req, res) {
  const url = req.url.split('?')[0];

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end();
    return true;
  }

  // 1. POST /api/auth/register or /api/auth/signup
  if ((url === '/api/auth/register' || url === '/api/auth/signup') && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { username, email, password, color } = body;

      if (!username || !email || !password) {
        sendJsonResponse(res, 400, { success: false, message: 'Username, email, and password are required.' });
        return true;
      }

      if (username.length < 3) {
        sendJsonResponse(res, 400, { success: false, message: 'Username must be at least 3 characters.' });
        return true;
      }

      if (!/\S+@\S+\.\S+/.test(email)) {
        sendJsonResponse(res, 400, { success: false, message: 'Please enter a valid email address.' });
        return true;
      }

      if (password.length < 6) {
        sendJsonResponse(res, 400, { success: false, message: 'Password must be at least 6 characters.' });
        return true;
      }

      // Check if username or email already exists
      const existingUser = await findUserByIdentifier(email) || await findUserByIdentifier(username);
      if (existingUser) {
        sendJsonResponse(res, 409, { success: false, message: 'Username or email already registered.' });
        return true;
      }

      // Hash password using bcrypt
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const avatar = username.trim().substring(0, 2).toUpperCase();

      const newUser = await createUserRecord({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        color: color || '#38bdf8',
        avatar
      });

      const token = generateToken(newUser);

      sendJsonResponse(res, 201, {
        success: true,
        message: 'Account created successfully',
        token,
        user: {
          id: newUser._id ? newUser._id.toString() : newUser.id,
          username: newUser.username,
          email: newUser.email,
          color: newUser.color,
          avatar: newUser.avatar
        }
      });
      return true;
    } catch (err) {
      console.error('[Auth Error Register]', err);
      sendJsonResponse(res, 500, { success: false, message: err.message || 'Server error during registration.' });
      return true;
    }
  }

  // 2. POST /api/auth/login
  if (url === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { identifier, password } = body;

      if (!identifier || !password) {
        sendJsonResponse(res, 400, { success: false, message: 'Please provide your email/username and password.' });
        return true;
      }

      const user = await findUserByIdentifier(identifier);
      if (!user) {
        sendJsonResponse(res, 401, { success: false, message: 'Invalid email or password.' });
        return true;
      }

      // Validate password with bcrypt
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        sendJsonResponse(res, 401, { success: false, message: 'Invalid email or password.' });
        return true;
      }

      const token = generateToken(user);

      sendJsonResponse(res, 200, {
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id ? user._id.toString() : user.id,
          username: user.username,
          email: user.email,
          color: user.color,
          avatar: user.avatar || user.username.substring(0, 2).toUpperCase()
        }
      });
      return true;
    } catch (err) {
      console.error('[Auth Error Login]', err);
      sendJsonResponse(res, 500, { success: false, message: 'Server error during login.' });
      return true;
    }
  }

  // 3. GET /api/auth/me (Verify token)
  if (url === '/api/auth/me' && req.method === 'GET') {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        sendJsonResponse(res, 401, { success: false, message: 'Authorization token required.' });
        return true;
      }

      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      if (!decoded) {
        sendJsonResponse(res, 401, { success: false, message: 'Invalid or expired token.' });
        return true;
      }

      const user = await findUserById(decoded.id);
      if (!user) {
        sendJsonResponse(res, 404, { success: false, message: 'User account not found.' });
        return true;
      }

      sendJsonResponse(res, 200, {
        success: true,
        user: {
          id: user._id ? user._id.toString() : user.id,
          username: user.username,
          email: user.email,
          color: user.color,
          avatar: user.avatar || user.username.substring(0, 2).toUpperCase()
        }
      });
      return true;
    } catch (err) {
      sendJsonResponse(res, 500, { success: false, message: 'Token verification error.' });
      return true;
    }
  }

  // 4. POST /api/auth/logout
  if (url === '/api/auth/logout' && req.method === 'POST') {
    sendJsonResponse(res, 200, { success: true, message: 'Logged out successfully.' });
    return true;
  }

  return false; // Not an auth route
}

module.exports = {
  UserModel,
  generateToken,
  verifyToken,
  handleAuthRequest
};
