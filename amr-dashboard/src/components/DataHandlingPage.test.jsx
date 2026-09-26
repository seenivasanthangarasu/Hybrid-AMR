import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dataSources } from '../config/dataSources.js';

vi.mock('../services/AmrSessionService.js', async () => {
  const recorder = (await import('../services/McapRecordingService.js')).default;
  const camera = (await import('../services/CameraSnapshotService.js')).default;
  const state = { status: 'ready', folderName: 'test-session' };
  let root;
  return { default: {
    getState: () => state,
    subscribe: (cb) => { cb(state); return () => {}; },
    setRoot: vi.fn(async (handle) => { root = handle; }),
    startCapture: vi.fn(async ({ recording, snapshots }) => {
      if (recording) await recorder.start({ ...recording, dirHandle: root });
      if (snapshots) await camera.start({ ...snapshots, dirHandle: root });
    }),
    stopCapture: async () => { await recorder.stop(); camera.stop(); },
  } };
});

vi.mock('../services/McapStorageService.js', () => ({
  default: {
    isSupported: true,
    pickFolder: vi.fn(),
    getSavedFolder: vi.fn().mockResolvedValue(null),
    verifyPermission: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../services/McapRecordingService.js', () => {
  const listeners = new Set();
  let state = { status: 'idle', currentFileName: null, startedAt: null };
  const mock = {
    getState: () => state,
    onStatusChange: (cb) => {
      listeners.add(cb);
      cb(state.status);
      return () => listeners.delete(cb);
    },
    start: vi.fn(async () => {
      state = { status: 'recording', currentFileName: 'rec-1.mcap', startedAt: Date.now() };
      listeners.forEach((cb) => cb(state.status));
    }),
    stop: vi.fn(async () => {
      state = { ...state, status: 'stopped' };
      listeners.forEach((cb) => cb(state.status));
    }),
    _reset: () => {
      state = { status: 'idle', currentFileName: null, startedAt: null };
    },
  };
  return { default: mock };
});

vi.mock('../services/CameraSnapshotService.js', () => {
  const statusListeners = new Set();
  let state = { status: 'idle', lastCaptureUrl: null, lastCaptureAt: null };
  const mock = {
    getState: () => state,
    onStatusChange: (cb) => {
      statusListeners.add(cb);
      cb(state.status);
      return () => statusListeners.delete(cb);
    },
    onCapture: () => () => {},
    start: vi.fn(async () => {
      state = { ...state, status: 'capturing' };
      statusListeners.forEach((cb) => cb(state.status));
    }),
    stop: vi.fn(() => {
      state = { ...state, status: 'stopped' };
      statusListeners.forEach((cb) => cb(state.status));
    }),
    _reset: () => {
      state = { status: 'idle', lastCaptureUrl: null, lastCaptureAt: null };
    },
  };
  return { default: mock };
});

import DataHandlingPage from './DataHandlingPage.jsx';
import McapStorageService from '../services/McapStorageService.js';
import mcapRecordingService from '../services/McapRecordingService.js';
import cameraSnapshotService from '../services/CameraSnapshotService.js';

// Real FileSystemDirectoryHandle.values() yields actual handles you can call
// getFile()/etc on directly — not bare name descriptors — so the fake must too.
function fakeSubDir(files) {
  const entries = new Map(files.map((f) => [f.name, f]));
  const fileHandleFor = (name) => {
    const f = entries.get(name);
    if (!f) throw new Error(`no such file: ${name}`);
    return { kind: 'file', name, getFile: async () => ({ size: f.size, lastModified: f.mtime }) };
  };
  return {
    kind: 'directory',
    async *values() {
      for (const name of entries.keys()) yield fileHandleFor(name);
    },
    async getFileHandle(name) {
      return fileHandleFor(name);
    },
    async removeEntry(name) {
      if (!entries.delete(name)) throw new Error(`no such entry: ${name}`);
    },
    _entries: entries,
  };
}

// `mcapFiles`/`cameraFiles`: [{ name, size, mtime }]
function fakeFolderHandle(name = 'backups', { mcapFiles = [], cameraFiles = null } = {}) {
  const root = fakeSubDir(mcapFiles);
  const camera = cameraFiles ? fakeSubDir(cameraFiles) : null;
  return {
    name,
    kind: 'directory',
    values: root.values,
    getFileHandle: root.getFileHandle,
    removeEntry: root.removeEntry,
    async getDirectoryHandle(dirName) {
      if (dirName !== 'camera' || !camera) throw new Error('no camera subfolder in this fake');
      return camera;
    },
  };
}

// The label's accessible name concatenates every text node inside the
// <label> — the source label plus, for topics, the trailing topic-id span —
// so a plain label substring (e.g. "TF") is ambiguous against "TF (static)".
function sourceAccessibleName(s) {
  return s.kind === 'topic' ? `${s.label} ${s.id}` : s.label;
}

function deselectAllSources() {
  const allOff = Object.fromEntries(dataSources.map((s) => [s.id, false]));
  window.localStorage.setItem('amr-data-source-selection', JSON.stringify(allOff));
}

describe('DataHandlingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mcapRecordingService._reset();
    cameraSnapshotService._reset();
    McapStorageService.isSupported = true;
  });

  it('renders the unsupported-browser message instead of controls when the File System Access API is missing', () => {
    McapStorageService.isSupported = false;
    render(<DataHandlingPage open onClose={() => {}} />);
    expect(screen.getByText(/does not support the file system access api/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PICK FOLDER' })).not.toBeInTheDocument();
  });

  it('disables START with a reason when no folder has been picked', () => {
    render(<DataHandlingPage open onClose={() => {}} />);
    const startButton = screen.getByRole('button', { name: 'START RECORDING' });
    expect(startButton).toBeDisabled();
    expect(screen.getByText('Pick a folder first')).toBeInTheDocument();
  });

  it('disables START with a reason when a folder is picked but no source is selected', async () => {
    deselectAllSources();
    McapStorageService.pickFolder.mockResolvedValue(fakeFolderHandle());

    render(<DataHandlingPage open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'PICK FOLDER' }));

    await waitFor(() => expect(screen.getByText('backups')).toBeInTheDocument());
    const startButton = screen.getByRole('button', { name: 'START RECORDING' });
    expect(startButton).toBeDisabled();
    expect(screen.getByText('Select at least one data source')).toBeInTheDocument();
  });

  it('starts and stops a recording session once a folder and a source are ready', async () => {
    McapStorageService.pickFolder.mockResolvedValue(fakeFolderHandle());
    render(<DataHandlingPage open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'PICK FOLDER' }));
    await waitFor(() => expect(screen.getByText('backups')).toBeInTheDocument());

    const startButton = screen.getByRole('button', { name: 'START RECORDING' });
    expect(startButton).not.toBeDisabled(); // /odom etc. default-enabled per dataSources.js
    fireEvent.click(startButton);

    await waitFor(() => expect(mcapRecordingService.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'STOP' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'STOP' }));
    await waitFor(() => expect(mcapRecordingService.stop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'START RECORDING' })).toBeInTheDocument());
  });

  it("category ALL/NONE toggles only that category's sources", () => {
    render(<DataHandlingPage open onClose={() => {}} />);
    const category = dataSources[0].category;
    const inCategory = dataSources.filter((s) => s.category === category);
    const outOfCategory = dataSources.find((s) => s.category !== category);
    const outOfCategoryDefault = outOfCategory.defaultEnabled;

    const scoped = screen.getByText(category).closest('div');
    fireEvent.click(within(scoped).getByText('NONE'));
    for (const s of inCategory) {
      expect(screen.getByLabelText(sourceAccessibleName(s))).not.toBeChecked();
    }

    fireEvent.click(within(scoped).getByText('ALL'));
    for (const s of inCategory) {
      expect(screen.getByLabelText(sourceAccessibleName(s))).toBeChecked();
    }

    // A source outside the category is untouched by either click.
    const outOfCategoryBox = screen.getByLabelText(sourceAccessibleName(outOfCategory));
    if (outOfCategoryDefault) {
      expect(outOfCategoryBox).toBeChecked();
    } else {
      expect(outOfCategoryBox).not.toBeChecked();
    }
  });

  // REQ-A8: totals broken out by kind, and manual delete behind a two-step confirm.
  it('lists existing backups with size totals and deletes one after a two-step confirm', async () => {
    const folder = fakeFolderHandle('backups', {
      mcapFiles: [{ name: 'rec-1-20260819-000000.mcap', size: 2048, mtime: Date.parse('2026-08-19') }],
      cameraFiles: [{ name: 'camera-20260820-000000.jpg', size: 512, mtime: Date.parse('2026-08-20') }],
    });
    McapStorageService.pickFolder.mockResolvedValue(folder);

    render(<DataHandlingPage open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'PICK FOLDER' }));

    await waitFor(() => expect(screen.getByText('rec-1-20260819-000000.mcap')).toBeInTheDocument());
    expect(screen.getByText('camera-20260820-000000.jpg')).toBeInTheDocument();
    // Totals: 1 .mcap (2.0 KB), 1 image (512 B), 2.5 KB total.
    expect(screen.getByText(/1 \.mcap \(2\.0 KB\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 images \(512 B\)/)).toBeInTheDocument();

    const mcapRow = screen.getByText('rec-1-20260819-000000.mcap').closest('li');
    fireEvent.click(within(mcapRow).getByText('DELETE'));

    // First press only arms the confirm — nothing is deleted yet.
    expect(screen.getByText('rec-1-20260819-000000.mcap')).toBeInTheDocument();
    expect(within(mcapRow).getByText('KEEP')).toBeInTheDocument();

    fireEvent.click(within(mcapRow).getByText('DELETE'));

    await waitFor(() => expect(screen.queryByText('rec-1-20260819-000000.mcap')).not.toBeInTheDocument());
    // The untouched camera image survives the .mcap deletion.
    expect(screen.getByText('camera-20260820-000000.jpg')).toBeInTheDocument();
  });

  it('dismissing a delete confirm with KEEP leaves the backup in place', async () => {
    const folder = fakeFolderHandle('backups', {
      mcapFiles: [{ name: 'rec-1-20260819-000000.mcap', size: 2048, mtime: Date.parse('2026-08-19') }],
    });
    McapStorageService.pickFolder.mockResolvedValue(folder);

    render(<DataHandlingPage open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'PICK FOLDER' }));
    await waitFor(() => expect(screen.getByText('rec-1-20260819-000000.mcap')).toBeInTheDocument());

    const mcapRow = screen.getByText('rec-1-20260819-000000.mcap').closest('li');
    fireEvent.click(within(mcapRow).getByText('DELETE'));
    fireEvent.click(within(mcapRow).getByText('KEEP'));

    expect(screen.getByText('rec-1-20260819-000000.mcap')).toBeInTheDocument();
    expect(within(mcapRow).getByText('DELETE')).toBeInTheDocument();
  });
});
