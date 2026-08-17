export interface Waypoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  arrivalRadius: number;
  waitTime: number;
  action: 'navigate' | 'stop' | 'wait' | 'rotate' | 'dock' | 'undock' | 'return_home' | 'continue';
  timestamp: number;
  type: 'normal' | 'start' | 'end';
}

export interface Mission {
  id: string;
  name: string;
  waypoints: Waypoint[];
  status: 'ready' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  mode: 'indoor' | 'outdoor' | 'hybrid';
  createdAt: number;
  updatedAt: number;
}

export interface MissionQueueItem {
  id: string;
  missionId: string;
  priority: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface MapPosition {
  lat: number;
  lng: number;
}

export interface MissionExecutionState {
  currentWaypointIndex: number;
  missionProgress: number;
  robotPosition: MapPosition;
  isExecuting: boolean;
  status: 'ready' | 'running' | 'paused' | 'completed' | 'failed';
}

export interface MissionPlannerState {
  waypoints: Waypoint[];
  selectedWaypointId: string | null;
  missionStatus: 'ready' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  missionMode: 'indoor' | 'outdoor' | 'hybrid';
  isOptimizing: boolean;
  currentMission: Mission | null;
  missionQueue: MissionQueueItem[];
  executionState: MissionExecutionState;
}