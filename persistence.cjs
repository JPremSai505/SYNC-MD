const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const Y = require('yjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sync-md';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Local storage backup directory (in case MongoDB is ever offline)
const DATA_DIR = path.join(__dirname, 'data', 'documents');
const SNAPSHOTS_DIR = path.join(__dirname, 'data', 'snapshots');
const DOCS_META_FILE = path.join(__dirname, 'data', 'documents_meta.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// -------------------------------------------------------------
// 1. MongoDB Document Schema & Model (Module 2 & 6)
// -------------------------------------------------------------
const documentSchema = new mongoose.Schema({
  roomName: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: 'Untitled Document' },
  owner: { type: String, default: 'anonymous' },
  isPublic: { type: Boolean, default: true },
  state: { type: Buffer, required: true }, // Binary Yjs CRDT state vector
  content: { type: String, default: '' },  // Raw markdown content
  lastModifiedBy: { type: String, default: 'anonymous' },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const DocumentModel = mongoose.models.Document || mongoose.model('Document', documentSchema);

// -------------------------------------------------------------
// 2. MongoDB Snapshot Schema & Model (Module 5: Version Control)
// -------------------------------------------------------------
const snapshotSchema = new mongoose.Schema({
  roomName: { type: String, required: true, index: true },
  versionId: { type: String, required: true, index: true },
  versionNumber: { type: Number, required: true },
  title: { type: String, default: 'Manual Snapshot' },
  content: { type: String, default: '' },
  state: { type: Buffer, required: true },
  createdBy: { type: String, default: 'System' },
  createdAt: { type: Date, default: Date.now }
});

const SnapshotModel = mongoose.models.Snapshot || mongoose.model('Snapshot', snapshotSchema);

let isMongoConnected = false;
let isRedisConnected = false;

// -------------------------------------------------------------
// 3. Initialize MongoDB Connection
// -------------------------------------------------------------
async function initMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 3000
    });
    isMongoConnected = true;
    console.log(`[Database] MongoDB connected successfully to: ${MONGODB_URI}`);
  } catch (err) {
    isMongoConnected = false;
    console.warn(`[Database] MongoDB not reachable (${err.message}). Using local disk fallback.`);
  }

  mongoose.connection.on('disconnected', () => {
    isMongoConnected = false;
    console.warn('[Database] MongoDB disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    isMongoConnected = true;
    console.log('[Database] MongoDB reconnected.');
  });
}

// -------------------------------------------------------------
// 4. Initialize Redis Client & In-Memory Fallback Cache
// -------------------------------------------------------------
const inMemoryCache = new Map(); // Fallback when Redis is not running
let redisClient = null;

function initRedis() {
  try {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });

    redisClient.on('error', () => {
      isRedisConnected = false;
    });

    redisClient.connect().then(() => {
      isRedisConnected = true;
      console.log(`[Cache] Redis connected successfully to: ${REDIS_URL}`);
    }).catch(() => {
      isRedisConnected = false;
      console.log('[Cache] Redis offline. Operating with local high-speed in-memory cache.');
    });
  } catch (err) {
    isRedisConnected = false;
    console.log('[Cache] Redis initialization skipped. Using in-memory cache.');
  }
}

// -------------------------------------------------------------
// 5. Cache Helper Methods (Redis + In-Memory)
// -------------------------------------------------------------
async function cacheGet(roomName) {
  if (isRedisConnected && redisClient) {
    try {
      const base64 = await redisClient.get(`doc:${roomName}:state`);
      if (base64) {
        return Buffer.from(base64, 'base64');
      }
    } catch (err) {
      console.error('[Cache] Redis get error:', err.message);
    }
  }
  return inMemoryCache.get(roomName) || null;
}

async function cacheSet(roomName, stateBuffer, content) {
  inMemoryCache.set(roomName, stateBuffer);

  if (isRedisConnected && redisClient) {
    try {
      const base64 = stateBuffer.toString('base64');
      await redisClient.set(`doc:${roomName}:state`, base64, 'EX', 86400);
      await redisClient.set(`doc:${roomName}:content`, content, 'EX', 86400);
      await redisClient.set(`doc:${roomName}:updatedAt`, new Date().toISOString(), 'EX', 86400);
    } catch (err) {
      console.error('[Cache] Redis set error:', err.message);
    }
  }
}

async function cacheDelete(roomName) {
  inMemoryCache.delete(roomName);
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(`doc:${roomName}:state`);
      await redisClient.del(`doc:${roomName}:content`);
      await redisClient.del(`doc:${roomName}:updatedAt`);
    } catch (err) {
      // ignore
    }
  }
}

// -------------------------------------------------------------
// 6. Local Fallback Metadata Management
// -------------------------------------------------------------
function readFallbackDocsMeta() {
  try {
    if (fs.existsSync(DOCS_META_FILE)) {
      return JSON.parse(fs.readFileSync(DOCS_META_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Metadata] Error reading metadata fallback:', err.message);
  }
  return [];
}

function writeFallbackDocsMeta(metaList) {
  try {
    fs.writeFileSync(DOCS_META_FILE, JSON.stringify(metaList, null, 2), 'utf8');
  } catch (err) {
    console.error('[Metadata] Error writing metadata fallback:', err.message);
  }
}

// -------------------------------------------------------------
// 7. Debounced Save Mechanism
// -------------------------------------------------------------
const pendingSaves = new Map();

function scheduleSave(roomName, doc, modifiedBy = 'collaborator') {
  if (pendingSaves.has(roomName)) {
    clearTimeout(pendingSaves.get(roomName));
  }

  const timer = setTimeout(async () => {
    pendingSaves.delete(roomName);
    await saveDocument(roomName, doc, modifiedBy);
  }, 2000);

  pendingSaves.set(roomName, timer);
}

async function flushSave(roomName, doc, modifiedBy = 'system') {
  if (pendingSaves.has(roomName)) {
    clearTimeout(pendingSaves.get(roomName));
    pendingSaves.delete(roomName);
  }
  await saveDocument(roomName, doc, modifiedBy);
}

// -------------------------------------------------------------
// 8. Save Document to Redis Cache & MongoDB
// -------------------------------------------------------------
async function saveDocument(roomName, doc, modifiedBy = 'collaborator') {
  try {
    const state = Y.encodeStateAsUpdate(doc);
    const stateBuffer = Buffer.from(state);
    const content = doc.getText('codemirror').toString();

    // 1. Write to Cache (Redis / In-Memory)
    await cacheSet(roomName, stateBuffer, content);

    // 2. Persist to MongoDB
    if (isMongoConnected) {
      await DocumentModel.findOneAndUpdate(
        { roomName },
        {
          $set: {
            state: stateBuffer,
            content,
            lastModifiedBy: modifiedBy,
            updatedAt: new Date()
          },
          $setOnInsert: {
            roomName,
            title: roomName === 'sync-md-default' ? 'Sync-MD: Getting Started' : roomName,
            owner: modifiedBy,
            createdAt: new Date()
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`[Persistence] Saved room "${roomName}" to MongoDB & Redis (${stateBuffer.length} bytes)`);
    }

    // 3. Local disk fallback file
    const binPath = path.join(DATA_DIR, `${roomName}.bin`);
    const mdPath = path.join(DATA_DIR, `${roomName}.md`);
    fs.writeFileSync(binPath, stateBuffer);
    fs.writeFileSync(mdPath, content, 'utf8');

    // Update fallback metadata
    const metas = readFallbackDocsMeta();
    const existingIdx = metas.findIndex(m => m.roomName === roomName);
    const updatedMeta = {
      roomName,
      title: existingIdx >= 0 ? metas[existingIdx].title : (roomName === 'sync-md-default' ? 'Sync-MD: Getting Started' : roomName),
      owner: existingIdx >= 0 ? metas[existingIdx].owner : modifiedBy,
      lastModifiedBy: modifiedBy,
      contentLength: content.length,
      updatedAt: new Date().toISOString(),
      createdAt: existingIdx >= 0 ? metas[existingIdx].createdAt : new Date().toISOString()
    };

    if (existingIdx >= 0) {
      metas[existingIdx] = updatedMeta;
    } else {
      metas.push(updatedMeta);
    }
    writeFallbackDocsMeta(metas);

    return true;
  } catch (err) {
    console.error(`[Persistence] Error saving room "${roomName}":`, err.message);
    return false;
  }
}

// -------------------------------------------------------------
// 9. Load Document (Cache -> MongoDB -> Disk)
// -------------------------------------------------------------
async function loadDocument(roomName, doc) {
  try {
    // Step 1: Check Redis / In-Memory Cache first
    const cachedState = await cacheGet(roomName);
    if (cachedState) {
      Y.applyUpdate(doc, new Uint8Array(cachedState));
      console.log(`[Cache Hit] Restored room "${roomName}" from cache`);
      return { loaded: true, source: isRedisConnected ? 'redis' : 'memory' };
    }

    // Step 2: Cache miss -> Check MongoDB
    if (isMongoConnected) {
      const record = await DocumentModel.findOne({ roomName });
      if (record && record.state) {
        Y.applyUpdate(doc, new Uint8Array(record.state));
        await cacheSet(roomName, record.state, record.content);
        console.log(`[Database Hit] Restored room "${roomName}" from MongoDB`);
        return { loaded: true, source: 'mongodb' };
      }
    }

    // Step 3: Check local disk storage fallback
    const binPath = path.join(DATA_DIR, `${roomName}.bin`);
    if (fs.existsSync(binPath)) {
      const fileBuffer = fs.readFileSync(binPath);
      Y.applyUpdate(doc, new Uint8Array(fileBuffer));
      await cacheSet(roomName, fileBuffer, doc.getText('codemirror').toString());
      console.log(`[Storage Hit] Restored room "${roomName}" from local disk storage`);
      return { loaded: true, source: 'disk' };
    }

    return { loaded: false, source: 'none' };
  } catch (err) {
    console.error(`[Persistence] Error loading room "${roomName}":`, err.message);
    return { loaded: false, error: err.message };
  }
}

// -------------------------------------------------------------
// 10. Document Workspace Management Methods (Module 2)
// -------------------------------------------------------------
async function listDocuments(username) {
  if (isMongoConnected) {
    try {
      const query = username 
        ? { $or: [{ owner: username }, { isPublic: true }, { owner: 'anonymous' }, { roomName: 'sync-md-default' }] }
        : {};
      const docs = await DocumentModel.find(query).sort({ updatedAt: -1 }).lean();
      return docs.map(d => ({
        roomName: d.roomName,
        title: d.title || d.roomName,
        owner: d.owner || 'anonymous',
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
        contentLength: (d.content || '').length,
        snippet: (d.content || '').slice(0, 160)
      }));
    } catch (err) {
      console.warn('[Persistence] MongoDB listDocuments error, falling back to disk:', err.message);
    }
  }

  // Fallback to local files and metadata
  const metas = readFallbackDocsMeta();
  return metas.map(m => {
    let snippet = '';
    const mdPath = path.join(DATA_DIR, `${m.roomName}.md`);
    if (fs.existsSync(mdPath)) {
      try {
        snippet = fs.readFileSync(mdPath, 'utf8').slice(0, 160);
      } catch {
        // ignore
      }
    }
    return {
      roomName: m.roomName,
      title: m.title || m.roomName,
      owner: m.owner || 'anonymous',
      updatedAt: m.updatedAt || new Date().toISOString(),
      createdAt: m.createdAt || new Date().toISOString(),
      contentLength: m.contentLength || 0,
      snippet
    };
  });
}

async function getDocumentMetadata(roomName) {
  if (isMongoConnected) {
    try {
      const doc = await DocumentModel.findOne({ roomName }).lean();
      if (doc) {
        return {
          roomName: doc.roomName,
          title: doc.title || doc.roomName,
          owner: doc.owner || 'anonymous',
          updatedAt: doc.updatedAt,
          createdAt: doc.createdAt,
          content: doc.content || ''
        };
      }
    } catch (err) {
      // ignore
    }
  }

  const metas = readFallbackDocsMeta();
  const found = metas.find(m => m.roomName === roomName);
  let content = '';
  const mdPath = path.join(DATA_DIR, `${roomName}.md`);
  if (fs.existsSync(mdPath)) {
    try {
      content = fs.readFileSync(mdPath, 'utf8');
    } catch {}
  }

  if (found) {
    return { ...found, content };
  }
  return {
    roomName,
    title: roomName,
    owner: 'anonymous',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    content
  };
}

async function createDocumentRecord({ roomName, title, owner = 'anonymous', initialContent = '' }) {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('codemirror');
  if (initialContent) {
    ytext.insert(0, initialContent);
  }
  const stateBuffer = Buffer.from(Y.encodeStateAsUpdate(ydoc));

  // 1. Cache
  await cacheSet(roomName, stateBuffer, initialContent);

  // 2. MongoDB
  if (isMongoConnected) {
    try {
      await DocumentModel.findOneAndUpdate(
        { roomName },
        {
          roomName,
          title: title || roomName,
          owner,
          isPublic: true,
          state: stateBuffer,
          content: initialContent,
          lastModifiedBy: owner,
          updatedAt: new Date(),
          createdAt: new Date()
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (err) {
      console.warn('[Persistence] MongoDB create document failed:', err.message);
    }
  }

  // 3. Disk fallback
  const binPath = path.join(DATA_DIR, `${roomName}.bin`);
  const mdPath = path.join(DATA_DIR, `${roomName}.md`);
  fs.writeFileSync(binPath, stateBuffer);
  fs.writeFileSync(mdPath, initialContent, 'utf8');

  const metas = readFallbackDocsMeta();
  const filtered = metas.filter(m => m.roomName !== roomName);
  filtered.unshift({
    roomName,
    title: title || roomName,
    owner,
    lastModifiedBy: owner,
    contentLength: initialContent.length,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });
  writeFallbackDocsMeta(filtered);

  return {
    roomName,
    title: title || roomName,
    owner,
    contentLength: initialContent.length,
    updatedAt: new Date().toISOString()
  };
}

async function updateDocumentTitle(roomName, newTitle) {
  if (isMongoConnected) {
    try {
      await DocumentModel.findOneAndUpdate(
        { roomName },
        { $set: { title: newTitle, updatedAt: new Date() } }
      );
    } catch (err) {
      console.warn('[Persistence] MongoDB update title error:', err.message);
    }
  }

  const metas = readFallbackDocsMeta();
  const idx = metas.findIndex(m => m.roomName === roomName);
  if (idx >= 0) {
    metas[idx].title = newTitle;
    metas[idx].updatedAt = new Date().toISOString();
    writeFallbackDocsMeta(metas);
  }
  return true;
}

async function deleteDocumentRecord(roomName) {
  // 1. Invalidate cache
  await cacheDelete(roomName);

  // 2. MongoDB delete
  if (isMongoConnected) {
    try {
      await DocumentModel.deleteOne({ roomName });
      await SnapshotModel.deleteMany({ roomName });
    } catch (err) {
      console.warn('[Persistence] MongoDB delete error:', err.message);
    }
  }

  // 3. Local disk files delete
  const binPath = path.join(DATA_DIR, `${roomName}.bin`);
  const mdPath = path.join(DATA_DIR, `${roomName}.md`);
  if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
  if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);

  // Also remove snapshot file
  const snapFile = path.join(SNAPSHOTS_DIR, `${roomName}.json`);
  if (fs.existsSync(snapFile)) fs.unlinkSync(snapFile);

  const metas = readFallbackDocsMeta();
  const filtered = metas.filter(m => m.roomName !== roomName);
  writeFallbackDocsMeta(filtered);

  return true;
}

// -------------------------------------------------------------
// 11. Version Control & Snapshot Operations (Module 5)
// -------------------------------------------------------------
function readFallbackSnapshots(roomName) {
  const filePath = path.join(SNAPSHOTS_DIR, `${roomName}.json`);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error('[Snapshot Fallback Read Error]:', err.message);
  }
  return [];
}

function writeFallbackSnapshots(roomName, list) {
  const filePath = path.join(SNAPSHOTS_DIR, `${roomName}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[Snapshot Fallback Write Error]:', err.message);
  }
}

async function createSnapshotRecord(roomName, { title, createdBy = 'Anonymous', content, stateBuffer }) {
  const versionId = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  let nextVersionNumber = 1;

  if (isMongoConnected) {
    try {
      const count = await SnapshotModel.countDocuments({ roomName });
      nextVersionNumber = count + 1;

      const created = await SnapshotModel.create({
        roomName,
        versionId,
        versionNumber: nextVersionNumber,
        title: title || `Version ${nextVersionNumber}`,
        content: content || '',
        state: stateBuffer,
        createdBy,
        createdAt: new Date()
      });

      console.log(`[Version Control] Created snapshot v${nextVersionNumber} for room "${roomName}" in MongoDB`);
      return {
        versionId: created.versionId,
        versionNumber: created.versionNumber,
        title: created.title,
        content: created.content,
        createdBy: created.createdBy,
        createdAt: created.createdAt
      };
    } catch (err) {
      console.warn('[Snapshot] MongoDB error, saving to disk fallback:', err.message);
    }
  }

  // Disk fallback
  const snaps = readFallbackSnapshots(roomName);
  nextVersionNumber = snaps.length + 1;
  const newSnap = {
    versionId,
    versionNumber: nextVersionNumber,
    title: title || `Version ${nextVersionNumber}`,
    content: content || '',
    stateBase64: stateBuffer.toString('base64'),
    createdBy,
    createdAt: new Date().toISOString()
  };
  snaps.unshift(newSnap);
  writeFallbackSnapshots(roomName, snaps);

  console.log(`[Version Control] Created snapshot v${nextVersionNumber} for room "${roomName}" in local disk storage`);
  return {
    versionId: newSnap.versionId,
    versionNumber: newSnap.versionNumber,
    title: newSnap.title,
    content: newSnap.content,
    createdBy: newSnap.createdBy,
    createdAt: newSnap.createdAt
  };
}

async function listSnapshotsRecord(roomName) {
  if (isMongoConnected) {
    try {
      const records = await SnapshotModel.find({ roomName })
        .sort({ versionNumber: -1 })
        .select('-state')
        .lean();
      return records.map(r => ({
        versionId: r.versionId,
        versionNumber: r.versionNumber,
        title: r.title,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        contentLength: (r.content || '').length
      }));
    } catch (err) {
      console.warn('[Snapshot] MongoDB list error:', err.message);
    }
  }

  const snaps = readFallbackSnapshots(roomName);
  return snaps.map(s => ({
    versionId: s.versionId,
    versionNumber: s.versionNumber,
    title: s.title,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    contentLength: (s.content || '').length
  }));
}

async function getSnapshotDetail(roomName, versionId) {
  if (isMongoConnected) {
    try {
      const record = await SnapshotModel.findOne({ roomName, versionId }).lean();
      if (record) {
        return {
          versionId: record.versionId,
          versionNumber: record.versionNumber,
          title: record.title,
          content: record.content,
          stateBuffer: record.state,
          createdBy: record.createdBy,
          createdAt: record.createdAt
        };
      }
    } catch (err) {
      // ignore
    }
  }

  const snaps = readFallbackSnapshots(roomName);
  const found = snaps.find(s => s.versionId === versionId);
  if (found) {
    return {
      versionId: found.versionId,
      versionNumber: found.versionNumber,
      title: found.title,
      content: found.content,
      stateBuffer: found.stateBase64 ? Buffer.from(found.stateBase64, 'base64') : null,
      createdBy: found.createdBy,
      createdAt: found.createdAt
    };
  }
  return null;
}

// -------------------------------------------------------------
// 12. Stats for Health Check
// -------------------------------------------------------------
async function getStats() {
  let mongoDocsCount = 0;
  let mongoSnapshotsCount = 0;
  if (isMongoConnected) {
    try {
      mongoDocsCount = await DocumentModel.countDocuments();
      mongoSnapshotsCount = await SnapshotModel.countDocuments();
    } catch {
      // ignore
    }
  }

  return {
    mongodb: {
      status: isMongoConnected ? 'connected' : 'offline',
      uri: MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
      totalDocuments: mongoDocsCount,
      totalSnapshots: mongoSnapshotsCount
    },
    redis: {
      status: isRedisConnected ? 'connected' : 'in-memory-fallback',
      url: REDIS_URL
    },
    cache: {
      inMemoryRooms: inMemoryCache.size,
      pendingSaves: pendingSaves.size
    }
  };
}

// Initialize connections on startup
initMongoDB();
initRedis();

module.exports = {
  DocumentModel,
  SnapshotModel,
  scheduleSave,
  flushSave,
  saveDocument,
  loadDocument,
  getStats,
  // Workspace management (Module 2)
  listDocuments,
  getDocumentMetadata,
  createDocumentRecord,
  updateDocumentTitle,
  deleteDocumentRecord,
  // Version control (Module 5)
  createSnapshotRecord,
  listSnapshotsRecord,
  getSnapshotDetail
};
