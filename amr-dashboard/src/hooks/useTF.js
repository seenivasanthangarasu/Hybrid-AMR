import { useEffect, useRef, useState } from 'react';
import ROSLIB from 'roslib';
import rosService from '../services/RosConnectionService.js';

/**
 * useTF
 * Subscribes to live /tf and /tf_static via ROSLIB.TFClient and tracks
 * the transform of `frameId` relative to `fixedFrame`. Used to drive
 * the URDF widget's robot pose and the indoor SLAM view's robot marker.
 * Returns null until a real transform has been received.
 */
export default function useTF({ frameId = 'base_link', fixedFrame = 'map', staleMs = 4000 } = {}) {
  const [transform, setTransform] = useState(null);
  const [lastReceivedAt, setLastReceivedAt] = useState(null);
  const [stale, setStale] = useState(true);
  const clientRef = useRef(null);

  useEffect(() => {
    if (!rosService.ros) rosService.connect();

    const tfClient = new ROSLIB.TFClient({
      ros: rosService.ros,
      fixedFrame,
      angularThres: 0.01,
      transThres: 0.01,
      rate: 10.0,
    });
    clientRef.current = tfClient;

    tfClient.subscribe(frameId, (tf) => {
      setTransform(tf);
      setLastReceivedAt(Date.now());
      setStale(false);
    });

    return () => {
      tfClient.unsubscribe(frameId);
      tfClient.dispose?.();
    };
  }, [frameId, fixedFrame]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!lastReceivedAt) {
        setStale(true);
        return;
      }
      setStale(Date.now() - lastReceivedAt > staleMs);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastReceivedAt, staleMs]);

  return { transform, hasData: !!transform && !stale, stale };
}
