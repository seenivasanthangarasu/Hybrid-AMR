import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import useRobotMode from '../hooks/useRobotMode.js';
import rosService from '../services/RosConnectionService.js';
import amrSession from '../services/AmrSessionService.js';

import bridge from '../services/WorkspaceBridge.js';

const STORAGE_KEY = 'xtrmbly-workspace-v1';

export const VALID_ENVIRONMENTS = ['indoor', 'outdoor', 'hybrid'];
export const VALID_MODES = ['manual', 'mapping', 'navigation'];

export function isValidCombination(env, mode, segment = 'indoor') {
  if (!VALID_ENVIRONMENTS.includes(env) || !VALID_MODES.includes(mode)) return false;
  // Outdoor has NO mapping mode
  if ((env === 'outdoor' || (env === 'hybrid' && segment === 'outdoor')) && mode === 'mapping') return false;
  return env !== 'hybrid' || ['indoor', 'outdoor'].includes(segment);
}

export function generateEntryId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function generateRunId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `run-${crypto.randomUUID().substring(0, 8)}`;
  }
  return `run-${Date.now().toString(36)}`;
}

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children, initialConfig = null }) {
  const { mode: reportedRobotEnvironment, isDefault: isRobotModeDefault, isTopicLive: isRobotModeLive } =
    useRobotMode();

  // Read stored or initial workspace
  const [workspace, setWorkspaceState] = useState(() => {
    if (initialConfig && isValidCombination(initialConfig.environment, initialConfig.mode, initialConfig.activeSegment ?? null)) {
      return {
        environment: initialConfig.environment,
        operatingMode: initialConfig.mode,
        activeSegment: initialConfig.activeSegment || (initialConfig.environment === 'outdoor' ? 'outdoor' : 'indoor'),
      };
    }

    // Check query params if provided
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const urlEnv = params.get('env')?.toLowerCase();
      const urlMode = params.get('mode')?.toLowerCase();
      const urlSeg = params.get('segment')?.toLowerCase();
      if (isValidCombination(urlEnv, urlMode, urlSeg)) {
        return {
          environment: urlEnv,
          operatingMode: urlMode,
          activeSegment: urlSeg === 'outdoor' ? 'outdoor' : 'indoor',
        };
      }
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidCombination(parsed.environment, parsed.operatingMode, parsed.activeSegment ?? null)) {
          return {
            environment: parsed.environment,
            operatingMode: parsed.operatingMode,
            activeSegment: parsed.activeSegment || 'indoor',
          };
        }
      }
    } catch {
      /* ignore storage failures */
    }

    return {
      environment: null,
      operatingMode: null,
      activeSegment: 'indoor',
    };
  });

  const [transitionError, setTransitionError] = useState(null);
  const canSwitch = useCallback(() => {
    try { bridge.assertIdle(); setTransitionError(null); return true; }
    catch (error) { setTransitionError(error.message); return false; }
  }, []);

  // Unique ID for each navigation entry.
  // Every fresh entry into Navigation Mode requires map selection.
  const [navigationEntryId, setNavigationEntryId] = useState(() =>
    workspace.operatingMode === 'navigation' ? generateEntryId() : null,
  );

  // Selected map for indoor navigation
  const [selectedMap, setSelectedMapState] = useState(null);

  // Map activation state machine:
  // 'unselected' | 'validating' | 'uploading' | 'staged' | 'loading' | 'loaded' | 'awaiting_localization' | 'ready' | 'failed' | 'unavailable'
  const [mapActivation, setMapActivationState] = useState({
    status: 'unselected',
    progress: null,
    error: null,
    activeMapId: null,
    operationId: null,
  });

  // Current mapping run ID
  const [activeRunId, setActiveRunId] = useState(generateRunId);

  // Persist workspace changes
  useEffect(() => {
    if (workspace.environment && workspace.operatingMode) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch {
        /* storage unavailable */
      }
    }
  }, [workspace]);

  // Invalidate readiness on ROS disconnect or session change
  useEffect(() => {
    const unsubRos = rosService.onStatusChange((status) => {
      if (status !== 'connected') {
        setMapActivationState((prev) =>
          prev.status !== 'unselected'
            ? { ...prev, status: 'unavailable', error: 'ROSBridge link disconnected' }
            : prev,
        );
      }
    });

    let previousSession;
    const unsubSession = amrSession.subscribe((sessionState) => {
      const key = `${sessionState.session?.robot_id}/${sessionState.session?.session_id}`;
      const changed = previousSession && key !== previousSession;
      previousSession = key;
      if (changed || !amrSession.confirmed || sessionState.status === 'stale' || sessionState.status === 'ended') {
        setMapActivationState((prev) =>
          prev.status !== 'unselected'
            ? { ...prev, status: 'unavailable', error: `Session ${sessionState.status}` }
            : prev,
        );
      }
    });

    return () => {
      unsubRos();
      unsubSession();
    };
  }, []);

  const setWorkspace = useCallback(({ environment, mode, activeSegment }) => {
    if (!isValidCombination(environment, mode, activeSegment)) {
      throw new Error(`Invalid environment/mode combination: ${environment} + ${mode}`);
    }

    if (!canSwitch()) return false;
    const seg = environment === 'hybrid' ? activeSegment || 'indoor' : environment === 'outdoor' ? 'outdoor' : 'indoor';

    setWorkspaceState({
      environment,
      operatingMode: mode,
      activeSegment: seg,
    });

    if (mode === 'navigation') {
      setNavigationEntryId(generateEntryId());
      setSelectedMapState(null);
      setMapActivationState({
        status: 'unselected',
        progress: null,
        error: null,
        activeMapId: null,
        operationId: null,
      });
    } else {
      setNavigationEntryId(null);
    }

    if (mode === 'mapping') {
      setActiveRunId(generateRunId());
    }
  }, [canSwitch]);

  const setOperatingMode = useCallback(
    (newMode) => {
      if (!isValidCombination(workspace.environment, newMode, workspace.activeSegment)) {
        throw new Error(`Mode ${newMode} is not available in ${workspace.environment} environment`);
      }

      if (!canSwitch()) return false;
      setWorkspaceState((prev) => ({
        ...prev,
        operatingMode: newMode,
      }));

      if (newMode === 'navigation') {
        setNavigationEntryId(generateEntryId());
        setSelectedMapState(null);
        setMapActivationState({
          status: 'unselected',
          progress: null,
          error: null,
          activeMapId: null,
          operationId: null,
        });
      } else {
        setNavigationEntryId(null);
      }

      if (newMode === 'mapping') {
        setActiveRunId(generateRunId());
      }
    },
    [workspace.environment, workspace.activeSegment, canSwitch],
  );

  const setActiveSegment = useCallback(
    (segment) => {
      if (workspace.environment !== 'hybrid') return;
      if (segment !== 'indoor' && segment !== 'outdoor') return;

      if (!canSwitch()) return false;
      if (!isValidCombination('hybrid', workspace.operatingMode, segment)) { setTransitionError('Switch to Manual or Navigation before entering the Outdoor segment.'); return false; }
      setWorkspaceState((prev) => ({
        ...prev,
        activeSegment: segment,
      }));

      // When switching segments in navigation mode, generate new entry ID and reset map
      if (workspace.operatingMode === 'navigation') {
        setNavigationEntryId(generateEntryId());
        setSelectedMapState(null);
        setMapActivationState({
          status: 'unselected',
          progress: null,
          error: null,
          activeMapId: null,
          operationId: null,
        });
      }
    },
    [workspace.environment, workspace.operatingMode, canSwitch],
  );

  const resetWorkspace = useCallback(() => {
    if (!canSwitch()) return false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setWorkspaceState({
      environment: null,
      operatingMode: null,
      activeSegment: 'indoor',
    });
    setNavigationEntryId(null);
    setSelectedMapState(null);
    setMapActivationState({
      status: 'unselected',
      progress: null,
      error: null,
      activeMapId: null,
      operationId: null,
    });
  }, [canSwitch]);

  const setSelectedMap = useCallback((map) => {
    if (!canSwitch()) return false;
    setSelectedMapState(map);
    if (!map) {
      setMapActivationState({
        status: 'unselected',
        progress: null,
        error: null,
        activeMapId: null,
        operationId: null,
      });
    } else {
      setMapActivationState({
        status: 'validating',
        progress: 10,
        error: null,
        activeMapId: map.map_id,
        operationId: generateEntryId(),
      });
    }
  }, [canSwitch]);

  const currentMap = useRef(selectedMap);
  currentMap.current = selectedMap;
  const updateMapActivation = useCallback((patch) => {
    setMapActivationState(prev => {
      if (!patch.operationId || patch.operationId !== prev.operationId || !currentMap.current) return prev;
      if (patch.status === 'ready' && !bridge.matchesMap(currentMap.current, patch.operationId)) return prev;
      return { ...prev, ...patch };
    });
  }, []);
  useEffect(() => bridge.subscribe(state => {
    setMapActivationState(prev => {
      if (prev.status === 'unselected') return prev;
      if (!state || (prev.status === 'ready' && !bridge.matchesMap(currentMap.current || {}, prev.operationId))) {
        return { ...prev, status: 'unavailable', operationId: generateEntryId(), error: 'Robot map/session readiness changed. Activate the selected map again.' };
      }
      return prev;
    });
  }), []);

  // Determine effective environment
  const effectiveEnvironment = useMemo(() => {
    if (workspace.environment === 'hybrid') {
      return workspace.activeSegment;
    }
    return workspace.environment;
  }, [workspace.environment, workspace.activeSegment]);

  // Check if robot reported environment conflicts with user-selected environment
  const isEnvironmentMismatch = useMemo(() => {
    if (!isRobotModeLive || isRobotModeDefault || !reportedRobotEnvironment) return false;
    const reportedLower = reportedRobotEnvironment.toLowerCase();
    if (workspace.environment === 'hybrid') {
      return workspace.activeSegment !== reportedLower;
    }
    return workspace.environment !== reportedLower;
  }, [
    isRobotModeLive,
    isRobotModeDefault,
    reportedRobotEnvironment,
    workspace.environment,
    workspace.activeSegment,
  ]);

  useLayoutEffect(() => { bridge.setSelection({ effectiveEnvironment, operatingMode: workspace.operatingMode, selectedMap, mapActivation }); }, [effectiveEnvironment, workspace.operatingMode, selectedMap, mapActivation]);

  const value = useMemo(
    () => ({
      transitionError,
      environment: workspace.environment,
      operatingMode: workspace.operatingMode,
      activeSegment: workspace.activeSegment,
      effectiveEnvironment,
      navigationEntryId,
      selectedMap,
      mapActivation,
      activeRunId,
      reportedRobotEnvironment,
      isEnvironmentMismatch,
      setWorkspace,
      setOperatingMode,
      setActiveSegment,
      setSelectedMap,
      updateMapActivation,
      resetWorkspace,
      isConfigured: Boolean(workspace.environment && workspace.operatingMode),
    }),
    [
      transitionError,
      workspace.environment,
      workspace.operatingMode,
      workspace.activeSegment,
      effectiveEnvironment,
      navigationEntryId,
      selectedMap,
      mapActivation,
      activeRunId,
      reportedRobotEnvironment,
      isEnvironmentMismatch,
      setWorkspace,
      setOperatingMode,
      setActiveSegment,
      setSelectedMap,
      updateMapActivation,
      resetWorkspace,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

const defaultWorkspaceContext = {
  environment: null,
  operatingMode: null,
  activeSegment: 'indoor',
  effectiveEnvironment: null,
  navigationEntryId: null,
  selectedMap: null,
  mapActivation: { status: 'unselected', progress: null, error: null, activeMapId: null, operationId: null },
  activeRunId: null,
  reportedRobotEnvironment: null,
  isEnvironmentMismatch: false,
  setWorkspace: () => {},
  setOperatingMode: () => {},
  setActiveSegment: () => {},
  setSelectedMap: () => {},
  updateMapActivation: () => {},
  resetWorkspace: () => {},
  isConfigured: false,
};

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  return context || defaultWorkspaceContext;
}
