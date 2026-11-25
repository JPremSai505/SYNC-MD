// Client-side Document & Snapshot Service (Module 2 & Module 5)
import { authService } from './authService';

const getApiBase = () => {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return '/api/documents';
  }
  return 'http://localhost:1234/api/documents';
};

const getAuthHeaders = () => {
  const token = authService.getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const documentService = {
  // -------------------------------------------------------------
  // Module 2: Workspace Document Operations
  // -------------------------------------------------------------

  // List all accessible documents
  async getDocuments() {
    const res = await fetch(`${getApiBase()}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch documents');
    }
    return data.documents || [];
  },

  // Create a new document
  async createDocument({ title, roomName, initialContent }) {
    const res = await fetch(`${getApiBase()}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, roomName, initialContent })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to create document');
    }
    return data.document;
  },

  // Get single document metadata
  async getDocument(roomName) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch document');
    }
    return data.document;
  },

  // Rename a document
  async updateDocumentTitle(roomName, title) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to update document title');
    }
    return data;
  },

  // Delete a document
  async deleteDocument(roomName) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to delete document');
    }
    return data;
  },

  // -------------------------------------------------------------
  // Module 5: Version Control & Snapshot Operations
  // -------------------------------------------------------------

  // List snapshots for a room
  async getSnapshots(roomName) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}/snapshots`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch snapshot history');
    }
    return data.snapshots || [];
  },

  // Create a manual snapshot checkpoint
  async createSnapshot(roomName, title) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}/snapshots`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to create snapshot');
    }
    return data.snapshot;
  },

  // Get full snapshot content
  async getSnapshotDetail(roomName, versionId) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}/snapshots/${encodeURIComponent(versionId)}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to retrieve snapshot details');
    }
    return data.snapshot;
  },

  // Restore/rollback to snapshot version
  async restoreSnapshot(roomName, versionId) {
    const res = await fetch(`${getApiBase()}/${encodeURIComponent(roomName)}/snapshots/${encodeURIComponent(versionId)}/restore`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to restore snapshot');
    }
    return data;
  }
};

