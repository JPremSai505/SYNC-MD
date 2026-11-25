const persistence = require('./persistence.cjs');
const auth = require('./auth.cjs');
const Y = require('yjs');

// Parse JSON request body helper
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2e6) { // 2MB limit
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

// Send standard JSON response helper
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// Extract and verify authenticated user from Authorization header
function authenticateRequest(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  return auth.verifyToken(token);
}

/**
 * Handles incoming REST API requests for:
 * - Module 2: Workspace & Document Management (/api/documents)
 * - Module 5: Version Control & Snapshots (/api/documents/:room/snapshots)
 */
async function handleDocumentRequest(req, res, { docs, getYDoc }) {
  const url = req.url.split('?')[0];

  // Handle CORS preflight for all document routes
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return true;
  }

  // Only handle routes beginning with /api/documents
  if (!url.startsWith('/api/documents')) {
    return false;
  }

  const authenticatedUser = authenticateRequest(req);
  const username = authenticatedUser ? authenticatedUser.username : 'anonymous';

  // -------------------------------------------------------------
  // 1. GET /api/documents -> List all accessible documents
  // -------------------------------------------------------------
  if (url === '/api/documents' && req.method === 'GET') {
    try {
      const documents = await persistence.listDocuments(username);

      // Include live peer count for active rooms
      const enrichedDocs = documents.map(d => {
        const liveDoc = docs.get(d.roomName);
        return {
          ...d,
          activeUsers: liveDoc ? liveDoc.awareness.getStates().size : 0
        };
      });

      sendJsonResponse(res, 200, { success: true, documents: enrichedDocs });
      return true;
    } catch (err) {
      console.error('[API Documents List Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to list documents.' });
      return true;
    }
  }

  // -------------------------------------------------------------
  // 2. POST /api/documents -> Create a new document / room
  // -------------------------------------------------------------
  if (url === '/api/documents' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const title = (body.title || 'Untitled Document').trim();
      let roomName = (body.roomName || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');

      if (!roomName) {
        // Auto-generate clean slug from title or timestamp
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        roomName = (slug || 'doc') + '-' + Math.random().toString(36).substring(2, 7);
      }

      const initialContent = body.initialContent || `# ${title}\n\nStart typing here...`;

      const created = await persistence.createDocumentRecord({
        roomName,
        title,
        owner: username,
        initialContent
      });

      sendJsonResponse(res, 201, {
        success: true,
        message: 'Document created successfully',
        document: created
      });
      return true;
    } catch (err) {
      console.error('[API Document Create Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to create document.' });
      return true;
    }
  }

  // Parse path parameters: /api/documents/:roomName/...
  const matchSnapshotsRestore = url.match(/^\/api\/documents\/([^/]+)\/snapshots\/([^/]+)\/restore$/);
  const matchSnapshotDetail = url.match(/^\/api\/documents\/([^/]+)\/snapshots\/([^/]+)$/);
  const matchSnapshots = url.match(/^\/api\/documents\/([^/]+)\/snapshots$/);
  const matchDocMeta = url.match(/^\/api\/documents\/([^/]+)$/);

  // -------------------------------------------------------------
  // 3. Module 5: Version Control & Snapshots
  // -------------------------------------------------------------

  // POST /api/documents/:roomName/snapshots/:versionId/restore (Rollback)
  if (matchSnapshotsRestore && req.method === 'POST') {
    const roomName = decodeURIComponent(matchSnapshotsRestore[1]);
    const versionId = decodeURIComponent(matchSnapshotsRestore[2]);

    try {
      const snapshot = await persistence.getSnapshotDetail(roomName, versionId);
      if (!snapshot) {
        sendJsonResponse(res, 404, { success: false, message: 'Snapshot version not found.' });
        return true;
      }

      // Restore active Yjs document state in memory
      const activeDoc = await getYDoc(roomName);
      const ytext = activeDoc.getText('codemirror');

      // Update text in a transaction - this immediately triggers broadcast to all connected WebSocket clients!
      activeDoc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, snapshot.content);
      });

      // Persist restored state immediately
      await persistence.flushSave(roomName, activeDoc, `restored_to_${versionId}`);

      // Create an automatic history record noting the restoration
      const restoreTitle = `Restored to Version ${snapshot.versionNumber} ("${snapshot.title}")`;
      const stateBuffer = Buffer.from(Y.encodeStateAsUpdate(activeDoc));
      await persistence.createSnapshotRecord(roomName, {
        title: restoreTitle,
        createdBy: username,
        content: snapshot.content,
        stateBuffer
      });

      console.log(`[Version Control] Room "${roomName}" restored to snapshot ${versionId} by ${username}`);
      sendJsonResponse(res, 200, {
        success: true,
        message: `Successfully restored to Version ${snapshot.versionNumber}`,
        content: snapshot.content
      });
      return true;
    } catch (err) {
      console.error('[API Snapshot Restore Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to restore snapshot.' });
      return true;
    }
  }

  // GET /api/documents/:roomName/snapshots/:versionId (View snapshot content)
  if (matchSnapshotDetail && req.method === 'GET') {
    const roomName = decodeURIComponent(matchSnapshotDetail[1]);
    const versionId = decodeURIComponent(matchSnapshotDetail[2]);

    try {
      const snapshot = await persistence.getSnapshotDetail(roomName, versionId);
      if (!snapshot) {
        sendJsonResponse(res, 404, { success: false, message: 'Snapshot not found.' });
        return true;
      }
      sendJsonResponse(res, 200, {
        success: true,
        snapshot: {
          versionId: snapshot.versionId,
          versionNumber: snapshot.versionNumber,
          title: snapshot.title,
          content: snapshot.content,
          createdBy: snapshot.createdBy,
          createdAt: snapshot.createdAt
        }
      });
      return true;
    } catch (err) {
      console.error('[API Snapshot Detail Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to fetch snapshot details.' });
      return true;
    }
  }

  // GET /api/documents/:roomName/snapshots (List all snapshots)
  if (matchSnapshots && req.method === 'GET') {
    const roomName = decodeURIComponent(matchSnapshots[1]);
    try {
      const snapshots = await persistence.listSnapshotsRecord(roomName);
      sendJsonResponse(res, 200, { success: true, snapshots });
      return true;
    } catch (err) {
      console.error('[API Snapshot List Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to list snapshots.' });
      return true;
    }
  }

  // POST /api/documents/:roomName/snapshots (Create manual snapshot)
  if (matchSnapshots && req.method === 'POST') {
    const roomName = decodeURIComponent(matchSnapshots[1]);
    try {
      const body = await parseJsonBody(req);
      const title = (body.title || 'Manual Checkpoint').trim();

      // Retrieve current document content and binary state
      const doc = await getYDoc(roomName);
      const content = doc.getText('codemirror').toString();
      const stateBuffer = Buffer.from(Y.encodeStateAsUpdate(doc));

      const created = await persistence.createSnapshotRecord(roomName, {
        title,
        createdBy: username,
        content,
        stateBuffer
      });

      sendJsonResponse(res, 201, {
        success: true,
        message: 'Snapshot created successfully',
        snapshot: created
      });
      return true;
    } catch (err) {
      console.error('[API Snapshot Create Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to create snapshot.' });
      return true;
    }
  }

  // -------------------------------------------------------------
  // 4. Module 2: Document Individual Operations (Meta, Rename, Delete)
  // -------------------------------------------------------------

  // GET /api/documents/:roomName (Fetch metadata)
  if (matchDocMeta && req.method === 'GET') {
    const roomName = decodeURIComponent(matchDocMeta[1]);
    try {
      const meta = await persistence.getDocumentMetadata(roomName);
      const liveDoc = docs.get(roomName);
      sendJsonResponse(res, 200, {
        success: true,
        document: {
          ...meta,
          activeUsers: liveDoc ? liveDoc.awareness.getStates().size : 0
        }
      });
      return true;
    } catch (err) {
      sendJsonResponse(res, 500, { success: false, message: 'Error retrieving document.' });
      return true;
    }
  }

  // PUT /api/documents/:roomName (Rename title)
  if (matchDocMeta && req.method === 'PUT') {
    const roomName = decodeURIComponent(matchDocMeta[1]);
    try {
      const body = await parseJsonBody(req);
      const newTitle = (body.title || '').trim();
      if (!newTitle) {
        sendJsonResponse(res, 400, { success: false, message: 'Title cannot be empty.' });
        return true;
      }

      await persistence.updateDocumentTitle(roomName, newTitle);
      sendJsonResponse(res, 200, {
        success: true,
        message: 'Document title updated',
        title: newTitle
      });
      return true;
    } catch (err) {
      sendJsonResponse(res, 500, { success: false, message: 'Failed to update title.' });
      return true;
    }
  }

  // DELETE /api/documents/:roomName (Delete document)
  if (matchDocMeta && req.method === 'DELETE') {
    const roomName = decodeURIComponent(matchDocMeta[1]);
    try {
      // Disconnect any active connections to this document
      const activeDoc = docs.get(roomName);
      if (activeDoc) {
        activeDoc.conns.forEach((_, conn) => {
          try {
            conn.close(1000, 'Document deleted by user');
          } catch {}
        });
        docs.delete(roomName);
      }

      await persistence.deleteDocumentRecord(roomName);
      console.log(`[Workspace] Document "${roomName}" deleted by ${username}`);

      sendJsonResponse(res, 200, {
        success: true,
        message: 'Document deleted successfully'
      });
      return true;
    } catch (err) {
      console.error('[API Document Delete Error]:', err);
      sendJsonResponse(res, 500, { success: false, message: 'Failed to delete document.' });
      return true;
    }
  }

  return false;
}

module.exports = {
  handleDocumentRequest
};

