import { uniqueBackupFileName, enforceRetention } from './BackupRotationService.js';

/**
 * CameraSnapshotService
 * -----------------------
 * Periodically grabs a frame from the live `web_video_server` MJPEG stream
 * onto an offscreen canvas and writes it as a JPEG into a `camera/`
 * subfolder of the chosen backup folder (data-handling-nav2-tasks.md
 * REQ-A6), reusing BackupRotationService's naming/retention rather than
 * duplicating that logic (decision: rotation/retention is one reusable
 * piece of logic, shared with McapRecordingService).
 *
 * `img.crossOrigin = 'anonymous'` only works once the robot-side CORS
 * change in docs/server-side-requests.md lands — until then, the browser
 * throws a SecurityError on canvas.toBlob() (a tainted-canvas read). The
 * very first capture attempt is used purely as a feature-detection probe:
 * on SecurityError this goes to `unavailable` and stops, rather than
 * silently producing zero images while some other status claims
 * "recording" (the same affordance-honesty rule as REQ-19/McapRecordingService).
 *
 * `_captureFrame` is a separate instance method (not a private closure) so
 * tests can override it directly — jsdom has no real <canvas>/toBlob, so
 * exercising the tainted-canvas and successful-capture paths means
 * substituting this method, not trying to fake the DOM canvas API.
 */
class CameraSnapshotService {
  constructor() {
    this._generation = 0;
    this._busy = false;
    this.status = 'idle'; // idle | capturing | unavailable | stopped
    this._statusListeners = new Set();
    this._captureListeners = new Set();
    this._errorListeners = new Set();

    this._cameraDir = null;
    this._streamUrl = null;
    this._quality = 0.85;
    this._retainCount = null;
    this._intervalId = null;
    this._lastCaptureUrl = null;
    this._lastCaptureAt = null;
  }

  onStatusChange(cb) {
    this._statusListeners.add(cb);
    cb(this.status);
    return () => this._statusListeners.delete(cb);
  }

  /** Fires with an object URL each time a frame is successfully written — REQ-A7's live thumbnail. */
  onCapture(cb) {
    this._captureListeners.add(cb);
    return () => this._captureListeners.delete(cb);
  }

  onError(cb) {
    this._errorListeners.add(cb);
    return () => this._errorListeners.delete(cb);
  }

  getState() {
    return { status: this.status, lastCaptureUrl: this._lastCaptureUrl, lastCaptureAt: this._lastCaptureAt };
  }

  async start({ dirHandle, streamUrl, intervalSec, retainCount = null, quality = 0.85 }) {
    if (this._intervalId) return;
    const generation = ++this._generation;
    this._streamUrl = streamUrl;
    this._quality = quality;
    this._retainCount = retainCount;
    this._cameraDir = await dirHandle.getDirectoryHandle('camera', { create: true });

    if (generation !== this._generation) return;
    const ok = await this._attemptCapture();
    if (generation !== this._generation) return;
    if (!ok) {
      this._setStatus('unavailable');
      return;
    }
    this._setStatus('capturing');
    this._intervalId = setInterval(() => this._attemptCapture(), Math.max(1, intervalSec) * 1000);
  }

  stop() {
    this._generation += 1;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._lastCaptureUrl) {
      URL.revokeObjectURL(this._lastCaptureUrl);
      this._lastCaptureUrl = null;
    }
    this._setStatus('stopped');
  }

  _setStatus(status) {
    this.status = status;
    this._statusListeners.forEach((cb) => cb(status));
  }

  /** @returns {boolean} true if capture should keep being attempted, false if the failure is terminal (unavailable). */
  async _attemptCapture() {
    if (this._busy) return true;
    this._busy = true;
    const generation = this._generation;
    try { return await this._captureAndSave(); }
    catch (err) {
      if (generation !== this._generation) return false;
      this._errorListeners.forEach((cb) => cb(err));
      this.stop();
      this._setStatus('unavailable');
      return false;
    } finally { this._busy = false; }
  }

  async _captureAndSave() {
    const generation = this._generation;
    const dir = this._cameraDir;
    let blob;
    try {
      blob = await this._captureFrame(this._streamUrl, this._quality);
    } catch (err) {
      if (err?.name === 'SecurityError') {
        this._errorListeners.forEach((cb) => cb(err));
        return false;
      }
      // Transient failure (stream momentarily down, load error) — honestly
      // reported but not fatal to the session, same as other feeds retrying.
      this._errorListeners.forEach((cb) => cb(err));
      return true;
    }

    if (generation !== this._generation) return false;
    const fileName = uniqueBackupFileName('camera', 'jpg');
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    if (this._retainCount) {
      await enforceRetention(dir, { prefix: 'camera', extension: 'jpg', retainCount: this._retainCount });
    }

    if (generation !== this._generation) return false;
    if (this._lastCaptureUrl) URL.revokeObjectURL(this._lastCaptureUrl);
    this._lastCaptureUrl = URL.createObjectURL(blob);
    this._lastCaptureAt = Date.now();
    this._captureListeners.forEach((cb) => cb(this._lastCaptureUrl));
    return true;
  }

  /** Draws one frame from the MJPEG stream onto an offscreen canvas and exports it as a JPEG Blob. */
  _captureFrame(streamUrl, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        img.src = '';
        reject(new Error('Camera frame timed out'));
      }, 8000);
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1;
        canvas.height = img.naturalHeight || 1;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new DOMException('tainted canvas', 'SecurityError'))),
            'image/jpeg',
            quality,
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => { clearTimeout(timer); reject(new Error('camera stream image failed to load')); };
      // Cache-bust so each capture re-fetches a fresh frame rather than the
      // browser's cached copy of the MJPEG boundary image.
      const sep = streamUrl.includes('?') ? '&' : '?';
      img.src = `${streamUrl}${sep}_capture=${Date.now()}`;
    });
  }
}

export { CameraSnapshotService };

const cameraSnapshotService = new CameraSnapshotService();
export default cameraSnapshotService;
