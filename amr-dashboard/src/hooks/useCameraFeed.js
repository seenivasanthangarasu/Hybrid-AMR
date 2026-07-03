import { useEffect, useState } from 'react';
import rosService from '../services/RosConnectionService.js';
import useRosTopic from './useRosTopic.js';

const CANDIDATE_TOPICS = [
  { name: '/camera/image_raw/compressed', messageType: 'sensor_msgs/CompressedImage' },
  { name: '/depth_camera/image_raw/compressed', messageType: 'sensor_msgs/CompressedImage' },
  { name: '/color/image_raw/compressed', messageType: 'sensor_msgs/CompressedImage' },
  { name: '/camera/image_raw', messageType: 'sensor_msgs/Image' },
  { name: '/depth_camera/image_raw', messageType: 'sensor_msgs/Image' },
  { name: '/color/image_raw', messageType: 'sensor_msgs/Image' },
];

/**
 * useCameraFeed
 * Auto-detects which of the spec'd camera topics is actually being
 * published by querying ROSBridge's topic list, then subscribes to it.
 * If none of the candidate topics are advertised, hasData stays false
 * and the UI must show NO DATA — no placeholder image is ever shown.
 */
export default function useCameraFeed() {
  const [activeTopic, setActiveTopic] = useState(null);
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        const live = await rosService.getTopicList();
        const liveNames = new Set(live);
        const match = CANDIDATE_TOPICS.find((c) => liveNames.has(c.name));
        if (!cancelled) {
          setActiveTopic(match || null);
          setDetecting(false);
        }
      } catch {
        if (!cancelled) {
          setActiveTopic(null);
          setDetecting(false);
        }
      }
    }

    detect();
    const interval = setInterval(detect, 5000); // re-check in case camera starts later
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const { data, hasData } = useRosTopic({
    name: activeTopic?.name,
    messageType: activeTopic?.messageType,
    throttle_rate: 100,
    staleMs: 5000,
  });

  if (!activeTopic || !hasData || !data) {
    return { hasData: false, detecting, topicName: activeTopic?.name ?? null, imageSrc: null };
  }

  const isCompressed = activeTopic.messageType === 'sensor_msgs/CompressedImage';
  let imageSrc = null;

  if (isCompressed && data.data) {
    const format = data.format?.includes('png') ? 'png' : 'jpeg';
    imageSrc = `data:image/${format};base64,${data.data}`;
  }
  // Raw sensor_msgs/Image would require client-side decoding (rgb8/bgr8/etc).
  // We surface raw frame metadata so the consumer can render with a canvas
  // decoder; compressed topics are preferred and used directly above.

  return {
    hasData: isCompressed ? !!imageSrc : true,
    detecting: false,
    topicName: activeTopic.name,
    imageSrc,
    raw: !isCompressed ? data : null,
    isCompressed,
  };
}
