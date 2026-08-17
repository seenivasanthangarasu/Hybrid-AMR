import { useEffect, useRef, useState } from 'react';
import rosService from '../services/RosConnectionService.js';
import { useConnectionEpoch } from './useRosConnection.js';
import { themeHex } from '../utils/themeColor.js';

/**
 * useUrdfViewer
 * Mounts a ROS3D.Viewer + ROS3D.UrdfClient into the given DOM container,
 * subscribing to /robot_description, /tf, and /tf_static for live robot
 * pose and link visualization. ros3d's ESM build is self-contained (it
 * bundles its own THREE internally) — dynamically imported below, no
 * global script include required.
 *
 * Mesh geometry is fetched by ROS3D.UrdfClient over plain HTTP from
 * VITE_MESH_SERVER_URL. rosbridge (VITE_ROSBRIDGE_URL) is a WebSocket
 * JSON-RPC endpoint and cannot serve mesh files — deriving one URL from
 * the other was a bug (see docs/remediation/spec.md REQ-04). If no mesh
 * server is configured, the widget reports 'no-mesh-server' rather than
 * silently claiming 'ready' with an empty scene.
 */
export default function useUrdfViewer(containerRef) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error | no-description | no-mesh-server
  const viewerRef = useRef(null);
  // UrdfClient and TFClient both bind to one ROSLIB.Ros instance, so the whole
  // viewer is rebuilt when a reconnect replaces it.
  const epoch = useConnectionEpoch();

  useEffect(() => {
    if (!containerRef.current) return undefined;
    if (!rosService.ros) rosService.connect();

    let disposed = false;
    setStatus('loading');

    async function init() {
      try {
        const ROS3D = await import('ros3d');
        // ros3d's ESM build bundles its own THREE internally — no global
        // `window.THREE` shim and no separate `three` dependency are needed
        // (verified against node_modules/ros3d; spec REQ-11 dead-code removal).

        if (disposed || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 320;
        const height = containerRef.current.clientHeight || 240;

        const viewer = new ROS3D.Viewer({
          divID: containerRef.current.id,
          width,
          height,
          antialias: true,
          // Resolved from the active theme at init. The ROS3D viewer is built
          // once, so this matches whatever theme is active on mount; a later
          // toggle won't re-theme the 3D scene (acceptable — the widget is
          // usually in its 'no-mesh-server' state anyway).
          background: themeHex('deck-900'),
          cameraPose: { x: 2, y: 2, z: 2 },
        });
        viewer.addObject(new ROS3D.Grid({ color: themeHex('deck-line'), cellSize: 0.5, num_cells: 20 }));

        const meshServerUrl = import.meta.env.VITE_MESH_SERVER_URL;
        if (!meshServerUrl) {
          viewerRef.current = viewer;
          setStatus('no-mesh-server');
          return;
        }

        const tfClient = new (await import('roslib')).default.TFClient({
          ros: rosService.ros,
          fixedFrame: 'base_link',
          angularThres: 0.01,
          transThres: 0.01,
          rate: 10.0,
        });

        new ROS3D.UrdfClient({
          ros: rosService.ros,
          tfClient,
          path: meshServerUrl,
          rootObject: viewer.scene,
        });

        viewerRef.current = viewer;
        setStatus('ready');
      } catch (err) {
        if (!disposed) setStatus('error');
      }
    }

    init();

    return () => {
      disposed = true;
      const viewer = viewerRef.current;
      viewerRef.current = null;
      // The viewer appends its own <canvas> to the container. Now that this
      // effect re-runs on reconnect, leaving it behind would stack a second
      // canvas on top of the first after every link drop.
      try {
        viewer?.stop?.();
        const canvas = viewer?.renderer?.domElement;
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
      } catch {
        // Viewer never finished initialising — nothing to tear down.
      }
    };
  }, [containerRef, epoch]);

  return { status };
}
