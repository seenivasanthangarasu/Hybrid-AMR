import bridge from './WorkspaceBridge.js';
import transfer from './MapTransferService.js';
import storage from './MapStorageService.js';

export class MapActivationService {
  constructor(deps = {}) { this.bridge = deps.bridge || bridge; this.transfer = deps.transfer || transfer; this.storage = deps.storage || storage; }
  async activateMap({ map, operationId, onStatus, signal, timeoutMs = 60000 }) {
    const emit = patch => { if (!signal?.aborted) onStatus?.({ ...patch, operationId }); };
    try {
      this.bridge.assertAvailable('map.activate');
      this.bridge.assertMode('indoor', 'navigation');
      this.bridge.assertIdle();
      emit({ status: 'validating', error: null });
      const pkg = await this.storage.loadMapArtifact(map);
      if (pkg.manifest.source.robot_id !== this.bridge.identity().robot_id) throw new Error('Map was generated for another robot. Compatibility must be explicitly verified.');
      emit({ status: 'uploading' });
      const identity = await this.transfer.upload(pkg, operationId, { signal });
      emit({ status: 'loading' });
      // Subscribe BEFORE requesting activation so immediate readiness cannot be lost.
      let unsubscribe;
      let timer;
      let abort;
      const ready = new Promise((resolve, reject) => {
        const finish = (error) => {
          clearTimeout(timer); unsubscribe?.(); signal?.removeEventListener('abort', abort);
          error ? reject(error) : resolve();
        };
        abort = () => finish(new Error('Map activation superseded.'));
        signal?.addEventListener('abort', abort, { once: true });
        unsubscribe = this.bridge.subscribe(state => {
          if (!state) return finish(new Error('Robot state lost; activation must be reconciled.'));
          if (this.bridge.matchesMap({ ...map, package_sha256: identity.package_sha256 }, operationId)) finish();
          else if (state.active_map?.operation_id === operationId && state.active_map.package_sha256 === identity.package_sha256) emit({ status: 'awaiting_localization' });
        });
        timer = setTimeout(() => finish(new Error('Map/localization readiness not confirmed. Reconcile and retry.')), timeoutMs);
      });
      // Attach a rejection handler immediately while the activation request awaits.
      ready.catch(() => {});
      try {
        const accepted = await this.bridge.request('map.activate', identity, { signal });
        if (accepted?.operation_id !== operationId || accepted.package_sha256 !== identity.package_sha256) throw new Error('Map activation acknowledgement mismatch');
        emit({ status: 'awaiting_localization' });
        await ready;
      } finally { clearTimeout(timer); unsubscribe?.(); signal?.removeEventListener('abort', abort); }
      if (signal?.aborted) throw new Error('Map activation superseded.');
      emit({ status: 'ready', progress: 100, activeMapId: map.map_id, error: null });
      return { success: true };
    } catch (error) {
      emit({ status: 'unavailable', error: error.message });
      return { success: false, error: error.message };
    }
  }
}
export default new MapActivationService();
