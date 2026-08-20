import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import McapStorageService from './McapStorageService.js';

// A real FileSystemDirectoryHandle is a host object the structured-clone
// algorithm knows how to serialize specially. A plain object with function
// *own properties* is not cloneable at all (fake-indexeddb enforces this,
// same as real IndexedDB would for a non-native object) — so this stand-in
// keeps its methods on the prototype (regular class methods, not fields) so
// only the plain `kind`/`name` instance data gets cloned through IDB, same
// shape a real handle's clone would carry.
class FakeDirectoryHandle {
  constructor({ kind = 'directory', name = 'backups' } = {}) {
    this.kind = kind;
    this.name = name;
  }

  queryPermission() {
    return Promise.resolve('granted');
  }

  requestPermission() {
    return Promise.resolve('granted');
  }
}

// For verifyPermission tests, which call the handle directly and never pass
// it through IndexedDB — a plain vi.fn()-bearing mock is fine here.
function permissionMockHandle({ queryResult = 'granted', requestResult = 'granted' } = {}) {
  return {
    kind: 'directory',
    name: 'backups',
    queryPermission: vi.fn().mockResolvedValue(queryResult),
    requestPermission: vi.fn().mockResolvedValue(requestResult),
  };
}

// Clearing the object store (not deleting the whole DB) avoids IndexedDB's
// "blocked" deadlock: deleteDatabase() waits for every open connection to
// close first, and McapStorageService's openDb() calls never close theirs
// (same as the real service — a page-lifetime connection is normal for
// IndexedDB and does not need explicit closing).
function resetDb() {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open('amr-dashboard-storage', 1);
    openReq.onupgradeneeded = () => {
      if (!openReq.result.objectStoreNames.contains('handles')) {
        openReq.result.createObjectStore('handles');
      }
    };
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    openReq.onerror = () => reject(openReq.error);
  });
}

describe('McapStorageService', () => {
  beforeEach(async () => {
    delete window.showDirectoryPicker;
    await resetDb();
  });

  it('isSupported reflects showDirectoryPicker availability', () => {
    expect(McapStorageService.isSupported).toBe(false);
    window.showDirectoryPicker = vi.fn();
    expect(McapStorageService.isSupported).toBe(true);
  });

  it('pickFolder opens the native picker and persists the handle', async () => {
    const handle = new FakeDirectoryHandle();
    window.showDirectoryPicker = vi.fn().mockResolvedValue(handle);

    const picked = await McapStorageService.pickFolder();

    expect(window.showDirectoryPicker).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(picked).toBe(handle);
  });

  it('getSavedFolder restores a handle persisted by a previous pickFolder call', async () => {
    const handle = new FakeDirectoryHandle({ name: 'restored-backups' });
    window.showDirectoryPicker = vi.fn().mockResolvedValue(handle);
    await McapStorageService.pickFolder();

    const restored = await McapStorageService.getSavedFolder();
    expect(restored).toMatchObject({ kind: 'directory', name: 'restored-backups' });
  });

  it('getSavedFolder returns null when nothing has ever been picked', async () => {
    const nothing = await McapStorageService.getSavedFolder();
    expect(nothing).toBeNull();
  });

  it('verifyPermission returns true without prompting when already granted', async () => {
    const handle = permissionMockHandle();
    const ok = await McapStorageService.verifyPermission(handle);
    expect(ok).toBe(true);
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it('verifyPermission re-requests when a stored handle lost its grant', async () => {
    const handle = permissionMockHandle({ queryResult: 'prompt', requestResult: 'granted' });
    const ok = await McapStorageService.verifyPermission(handle);
    expect(ok).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('verifyPermission returns false when the operator denies the re-request', async () => {
    const handle = permissionMockHandle({ queryResult: 'prompt', requestResult: 'denied' });
    const ok = await McapStorageService.verifyPermission(handle);
    expect(ok).toBe(false);
  });
});
