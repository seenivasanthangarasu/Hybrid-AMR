import useRosTopic from './useRosTopic.js';

/**
 * useOccupancyGrid
 * Subscribes to /map (nav_msgs/OccupancyGrid) for the SLAM indoor view.
 * Returns raw grid data + metadata; rendering happens in the SLAM canvas
 * component. No grid is synthesized when the topic is unavailable.
 */
export default function useOccupancyGrid(options = {}) {
  const topicArgs = {
    name: '/map',
    messageType: 'nav_msgs/OccupancyGrid',
    throttle_rate: 0, // map updates are infrequent — no throttling needed
    staleMs: 15000, // maps are typically latched / published rarely
  };
  if (options.enabled !== undefined) {
    topicArgs.enabled = options.enabled;
  }
  const { data, hasData, stale, lastReceivedAt } = useRosTopic(topicArgs);

  // Freshness signals mirrored from useOdometry/useGps (spec REQ-21).
  const timing = { hasData, hasEverData: !!data, stale, lastReceivedAt };

  const validShape =
    hasData &&
    !!data &&
    !!data.info &&
    Number.isInteger(data.info.width) && data.info.width > 0 &&
    Number.isInteger(data.info.height) && data.info.height > 0 &&
    Array.isArray(data.data) && data.data.length === data.info.width * data.info.height && data.data.length <= 16000000 && Number.isFinite(data.info.resolution) && data.info.resolution > 0;

  if (!validShape) {
    return {
      ...timing,
      hasData: false,
      width: null,
      height: null,
      resolution: null,
      origin: null,
      data: null,
    };
  }

  return {
    ...timing,
    hasData: true,
    width: data.info?.width,
    height: data.info?.height,
    resolution: data.info?.resolution,
    origin: data.info?.origin,
    data: data.data, // Int8 array, row-major: -1 unknown, 0 free, 100 occupied
  };
}
