/** Service discovery — finds available ROS2 nodes, topics, and services on the robot */

interface DiscoveredNode { name: string; type: string; uri: string | null }
interface TopicEntry { topic: string; msgType: string }

export async function discoverTopics(): Promise<TopicEntry[]> { return [] }
export async function discoverServices(): Promise<string[]> { return [] }
export async function discoverNodes(): Promise<DiscoveredNode[]> { return [] }
