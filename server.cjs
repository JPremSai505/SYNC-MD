const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const persistence = require('./persistence.cjs');
const auth = require('./auth.cjs');
const documents = require('./documents.cjs');

const PORT = process.env.PORT || 1234;

// Yjs binary protocol message identifiers
const messageSync = 0;
const messageAwareness = 1;

// In-memory registry of active documents
const docs = new Map();
const loadingDocs = new Map();

// Custom Yjs document extending Y.Doc to manage connection sets & awareness
class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    // Broadcast cursor positions, usernames, and presence updates to all peers in room
    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);

      if (conn !== null && conn !== undefined) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach(clientID => connControlledIDs.add(clientID));
          updated.forEach(clientID => connControlledIDs.add(clientID));
          removed.forEach(clientID => connControlledIDs.delete(clientID));
        }
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };
    this.awareness.on('update', awarenessChangeHandler);

    // Broadcast document edits & schedule debounced database/cache save
    this.on('update', (update, origin) => {
      // 1. Broadcast delta update to other connected peers
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => {
        if (conn !== origin) {
          send(this, conn, message);
        }
      });

      // 2. Schedule debounced save to MongoDB and Redis cache (Module 6)
      persistence.scheduleSave(this.name, this);
    });
  }
}

// Get or restore a shared document from Redis cache / MongoDB / disk
async function getYDoc(docname) {
  let doc = docs.get(docname);
  if (doc) return doc;

  if (loadingDocs.has(docname)) {
    return await loadingDocs.get(docname);
  }

  const loadPromise = (async () => {
    const newDoc = new WSSharedDoc(docname);
    docs.set(docname, newDoc);

    // Attempt to restore saved state from Cache or MongoDB
    await persistence.loadDocument(docname, newDoc);

    loadingDocs.delete(docname);
    return newDoc;
  })();

  loadingDocs.set(docname, loadPromise);
  return await loadPromise;
}

// Safely send binary packet to a WebSocket client
function send(doc, conn, m) {
  if (conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, (err) => {
      if (err != null) closeConn(doc, conn);
    });
  } catch (e) {
    closeConn(doc, conn);
  }
}

// Clean up disconnected connection and immediately persist if room is empty
function closeConn(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);

    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    }

    // When all peers leave a room, flush save immediately
    if (doc.conns.size === 0) {
      const allStates = Array.from(doc.awareness.getStates().keys());
      if (allStates.length > 0) {
        awarenessProtocol.removeAwarenessStates(doc.awareness, allStates, null);
      }
      persistence.flushSave(doc.name, doc, 'all_peers_disconnected');
    }
  }
  try {
    conn.close();
  } catch (e) {
    // ignore
  }
}

// Handle incoming client WebSocket connection
async function setupWSConnection(conn, req) {
  conn.binaryType = 'arraybuffer';

  // Parse room name from URL path (e.g. ws://localhost:1234/my-room)
  const urlPath = (req.url || '/').split('?')[0];
  const docName = urlPath.slice(1) || 'sync-md-default';

  // Load document (from cache/MongoDB if previously saved)
  const doc = await getYDoc(docName);
  doc.conns.set(conn, new Set());

  // Listen to incoming binary messages from client
  conn.on('message', (message) => {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
          if (encoding.length(encoder) > 1) {
            send(doc, conn, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness:
          awarenessProtocol.applyAwarenessUpdate(
            doc.awareness,
            decoding.readVarUint8Array(decoder),
            conn
          );
          break;
      }
    } catch (err) {
      console.error('Message handling error:', err);
    }
  });

  // Heartbeat ping/pong check to detect closed tabs
  let isAlive = true;
  conn.on('pong', () => {
    isAlive = true;
  });

  const pingInterval = setInterval(() => {
    if (!isAlive) {
      clearInterval(pingInterval);
      closeConn(doc, conn);
      return;
    }
    isAlive = false;
    try {
      conn.ping();
    } catch (e) {
      clearInterval(pingInterval);
      closeConn(doc, conn);
    }
  }, 15000);

  conn.on('close', () => {
    clearInterval(pingInterval);
    closeConn(doc, conn);
    console.log(`Client disconnected from room: ${docName} (Active users: ${doc.conns.size})`);
  });

  conn.on('error', () => {
    clearInterval(pingInterval);
    closeConn(doc, conn);
  });

  // Perform initial synchronization with connecting client
  {
    // Step 1: Send server sync step 1 (contains document state vector)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    // Step 2: Send current active awareness states
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      send(doc, conn, encoding.toUint8Array(awarenessEncoder));
    }
  }

  console.log(`Client connected to room: "${docName}" (Active users: ${doc.conns.size})`);
}

// HTTP server for health checks, persistence status, auth & documents
const server = http.createServer(async (req, res) => {
  // 1. Dispatch Auth API endpoints (/api/auth/*)
  const isAuthHandled = await auth.handleAuthRequest(req, res);
  if (isAuthHandled) return;

  // 2. Dispatch Document & Snapshot API endpoints (/api/documents/*)
  const isDocHandled = await documents.handleDocumentRequest(req, res, { docs, getYDoc });
  if (isDocHandled) return;

  // 3. Health check & persistence diagnostics endpoint
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });

  const persistenceStats = await persistence.getStats();
  const rooms = {};
  docs.forEach((doc, name) => {
    rooms[name] = {
      peers: doc.conns.size,
      users: doc.awareness.getStates().size,
      contentLength: doc.getText('codemirror').length
    };
  });

  res.end(JSON.stringify({
    status: 'ok',
    persistence: persistenceStats,
    activeRooms: docs.size,
    rooms
  }, null, 2));
});

const wss = new WebSocket.Server({ server });
wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req).catch((err) => {
    console.error('Setup connection error:', err);
  });
});

// Graceful server shutdown to persist all memory documents
async function handleShutdown() {
  console.log('\n[Server] Gracefully shutting down... Flushing active documents to database & cache.');
  for (const [name, doc] of docs.entries()) {
    await persistence.flushSave(name, doc, 'server_shutdown');
  }
  console.log('[Server] All documents safely persisted. Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`Sync-MD Server listening on ws://localhost:${PORT}`);
  console.log(`Status & Persistence health check at: http://localhost:${PORT}`);
  console.log('========================================================');
});