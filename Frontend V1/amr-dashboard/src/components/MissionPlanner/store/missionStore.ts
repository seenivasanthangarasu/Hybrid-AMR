import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Waypoint, Mission, MissionQueueItem, MissionExecutionState, MissionPlannerState } from '../types';

// Create the initial state
const initialState: MissionPlannerState = {
  waypoints: [],
  selectedWaypointId: null,
  missionStatus: 'ready',
  missionMode: 'outdoor',
  isOptimizing: false,
  currentMission: null,
  missionQueue: [],
  executionState: {
    currentWaypointIndex: 0,
    missionProgress: 0,
    robotPosition: { lat: 0, lng: 0 },
    isExecuting: false,
    status: 'ready'
  }
};

// Create the store
const useMissionStore = create<MissionPlannerState & {
  // Actions for waypoint management
  addWaypoint: (waypoint: Omit<Waypoint, 'id' | 'timestamp'>) => void;
  updateWaypoint: (id: string, updates: Partial<Waypoint>) => void;
  removeWaypoint: (id: string) => void;
  selectWaypoint: (id: string | null) => void;
  clearWaypoints: () => void;

  // Actions for mission management
  setCurrentMission: (mission: Mission | null) => void;
  updateMissionStatus: (status: 'ready' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed') => void;
  setMissionMode: (mode: 'indoor' | 'outdoor' | 'hybrid') => void;

  // Actions for execution
  startMissionExecution: () => void;
  pauseMissionExecution: () => void;
  resumeMissionExecution: () => void;
  stopMissionExecution: () => void;
  updateExecutionProgress: (currentWaypointIndex: number, missionProgress: number) => void;

  // Actions for mission queue
  addToQueue: (missionId: string, priority: number) => void;
  removeFromQueue: (id: string) => void;
  updateQueueItemStatus: (id: string, status: 'queued' | 'running' | 'completed' | 'failed') => void;
}>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Waypoint actions
      addWaypoint: (waypointData) => {
        const newWaypoint: Waypoint = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          ...waypointData
        };

        set((state) => ({
          waypoints: [...state.waypoints, newWaypoint],
          selectedWaypointId: newWaypoint.id
        }));
      },

      updateWaypoint: (id, updates) => {
        set((state) => ({
          waypoints: state.waypoints.map(wp =>
            wp.id === id ? { ...wp, ...updates } : wp
          )
        }));
      },

      removeWaypoint: (id) => {
        set((state) => {
          const newWaypoints = state.waypoints.filter(wp => wp.id !== id);
          return {
            waypoints: newWaypoints,
            selectedWaypointId: state.selectedWaypointId === id ? null : state.selectedWaypointId
          };
        });
      },

      selectWaypoint: (id) => {
        set({ selectedWaypointId: id });
      },

      clearWaypoints: () => {
        set({ waypoints: [], selectedWaypointId: null });
      },

      // Mission actions
      setCurrentMission: (mission) => {
        set({ currentMission: mission });
      },

      updateMissionStatus: (status) => {
        set({ missionStatus: status });
      },

      setMissionMode: (mode) => {
        set({ missionMode: mode });
      },

      // Execution actions
      startMissionExecution: () => {
        set((state) => ({
          missionStatus: 'executing',
          executionState: {
            ...state.executionState,
            isExecuting: true,
            status: 'running'
          }
        }));
      },

      pauseMissionExecution: () => {
        set((state) => ({
          missionStatus: 'paused',
          executionState: {
            ...state.executionState,
            status: 'paused'
          }
        }));
      },

      resumeMissionExecution: () => {
        set((state) => ({
          missionStatus: 'executing',
          executionState: {
            ...state.executionState,
            status: 'running'
          }
        }));
      },

      stopMissionExecution: () => {
        set((state) => ({
          missionStatus: 'ready',
          executionState: {
            ...state.executionState,
            isExecuting: false,
            status: 'ready',
            currentWaypointIndex: 0,
            missionProgress: 0
          }
        }));
      },

      updateExecutionProgress: (currentWaypointIndex, missionProgress) => {
        set((state) => ({
          executionState: {
            ...state.executionState,
            currentWaypointIndex,
            missionProgress
          }
        }));
      },

      // Queue actions
      addToQueue: (missionId, priority) => {
        const newQueueItem: MissionQueueItem = {
          id: Math.random().toString(36).substr(2, 9),
          missionId,
          priority,
          status: 'queued'
        };

        set((state) => ({
          missionQueue: [...state.missionQueue, newQueueItem]
        }));
      },

      removeFromQueue: (id) => {
        set((state) => ({
          missionQueue: state.missionQueue.filter(item => item.id !== id)
        }));
      },

      updateQueueItemStatus: (id, status) => {
        set((state) => ({
          missionQueue: state.missionQueue.map(item =>
            item.id === id ? { ...item, status } : item
          )
        }));
      }
    }),
    {
      name: 'mission-planner-storage',
      partialize: (state) => ({ waypoints: state.waypoints, missionMode: state.missionMode }),
    }
  )
);

export default useMissionStore;