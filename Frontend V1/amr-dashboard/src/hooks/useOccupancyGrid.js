import useRosTopic from './useRosTopic.js';

/**
 * useOccupancyGrid
 * Subscribes to /map (nav_msgs/OccupancyGrid) for the SLAM indoor view.
 * Returns raw grid data + metadata; rendering happens in the SLAM canvas
 * component. No grid is synthesized when the topic is unavailable.
 */
export default function useOccupancyGrid() {
  const { data, hasData } = useRosTopic({
    name: '/map',
    messageType: 'nav_msgs/OccupancyGrid',
    throttle_rate: 0, // map updates are infrequent — no throttling needed
    staleMs: 15000, // maps are typically latched / published rarely
  });

  if (!hasData || !data) {
    return { hasData: false, width: null, height: null, resolution: null, origin: null, data: null };
  }

  return {
    hasData: true,
    width: data.info?.width,
    height: data.info?.height,
    resolution: data.info?.resolution,
    origin: data.info?.origin,
    data: data.data, // Int8 array, row-major: -1 unknown, 0 free, 100 occupied
  };
}
