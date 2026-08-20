/**
 * McapStorageService
 * -------------------
 * Persists the operator's chosen backup folder (a `FileSystemDirectoryHandle`
 * from the File System Access API) across reloads. Handles are structured-
 * cloneable but not JSON-serializable, so they go in IndexedDB rather than
 * `localStorage` (same reasoning as data-handling-nav2-tasks.md REQ-A1).
 *
 * `File System Access API` support is Chromium-only — `isSupported` lets
 * callers feature-detect and degrade honestly rather than showing a picker
 * button that will throw.
 */

const DB_NAME = 'amr-dashboard-storage';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const FOLDER_KEY = 'backupFolder';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const McapStorageService = {
  get isSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  },

  /** Opens the native folder picker and persists the chosen handle. */
  async pickFolder() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbSet(FOLDER_KEY, handle);
    return handle;
  },

  /** Reads the previously-picked folder handle back, or null if none is stored. */
  async getSavedFolder() {
    return idbGet(FOLDER_KEY);
  },

  /**
   * Re-checks (and if needed, re-requests) write permission on a stored
   * handle — a handle can survive in IndexedDB across browser sessions but
   * lose its grant, so this must run before every recording/write attempt,
   * not just once after pickFolder().
   */
  async verifyPermission(handle, mode = 'readwrite') {
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  },
};

export default McapStorageService;
