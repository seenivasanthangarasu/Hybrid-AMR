import { useEffect, useRef, useState } from 'react';
import rosService from '../services/RosConnectionService.js';

/**
 * useUrdfViewer
 * Mounts a ROS3D.Viewer + ROS3D.UrdfClient into the given DOM container,
 * subscribing to /robot_description, /tf, and /tf_static for live robot
 * pose and link visualization. ros3d must be loaded globally (window.ROS3D)
 * via the script include in index.html, since the npm package ships as a
 * UMD bundle expecting THREE on window.
 */
export default function useUrdfViewer(containerRef) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error | no-description
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    if (!rosService.ros) rosService.connect();

    let disposed = false;
    setStatus('loading');

    async function init() {
      try {
        const ROS3D = await import('ros3d');
        const THREE = await import('three');
        // ros3d's UMD build expects THREE/ROSLIB on window in this env
        window.THREE = window.THREE || THREE;

        if (disposed || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 320;
        const height = containerRef.current.clientHeight || 240;

        const viewer = new ROS3D.Viewer({
          divID: containerRef.current.id,
          width,
          height,
          antialias: true,
          background: '#0e131c',
          cameraPose: { x: 2, y: 2, z: 2 },
        });
        viewer.addObject(new ROS3D.Grid({ color: '#243043', cellSize: 0.5, num_cells: 20 }));

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
          path: 'http://localhost:9090/',
          rootObject: viewer.scene,
          loader: ROS3D.COLLADA_LOADER_2,
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
      viewerRef.current = null;
    };
  }, [containerRef]);

  return { status };
}
