import { useState, useMemo, useEffect, useRef } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext.jsx';
import RobotCommandService from '../../services/RobotCommandService.js';
import useOccupancyGrid from '../../hooks/useOccupancyGrid.js';
import useTF from '../../hooks/useTF.js';
import { getCellOccupancy, getYawFromQuaternion, worldToScreen } from '../../utils/mapGeometry.js';
import SavedMapPreview from '../maps/SavedMapPreview.jsx';
import SignalDot from '../ui/SignalDot.jsx';
import CommandFeedback from '../CommandFeedback.jsx';

export default function IndoorNavPlanner({ connectionStatus = 'connected' }) {
  const { selectedMap, mapActivation, isEnvironmentMismatch } = useWorkspace();
  const subscriptions = useRef([]);
  useEffect(() => () => subscriptions.current.forEach(fn => fn()), []);
  const grid = useOccupancyGrid();
  const { transform, hasData: hasPose } = useTF({ frameId: 'base_link', fixedFrame: 'map' });

  const [goalX, setGoalX] = useState('');
  const [goalY, setGoalY] = useState('');
  const [goalYaw, setGoalYaw] = useState('0.0');
  const [frameId] = useState('map');

  const [activeGoal, setActiveGoal] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute robot current map-frame pose from TF if available
  const robotPose = useMemo(() => {
    if (!hasPose || !transform?.translation) return null;
    const x = transform.translation.x;
    const y = transform.translation.y;
    const yaw = getYawFromQuaternion(transform.rotation);
    return { x, y, yaw };
  }, [hasPose, transform]);

  // Check occupancy for destination coordinates
  const occupancyCheck = useMemo(() => {
    const numX = Number(goalX);
    const numY = Number(goalY);
    if (!goalX.trim() || !goalY.trim() || !Number.isFinite(numX) || !Number.isFinite(numY) || !grid.hasData) {
      return null;
    }

    try {
      const { canvasPx, canvasPy, isInside } = worldToScreen({
        wx: numX,
        wy: numY,
        width: grid.width,
        height: grid.height,
        resolution: grid.resolution,
        origin: grid.origin,
      });

      if (!isInside) {
        return { type: 'out_of_bounds', message: 'Outside map boundary' };
      }

      const col = Math.floor(canvasPx);
      const row = grid.height - 1 - Math.floor(canvasPy);
      const occ = getCellOccupancy(col, row, grid.width, grid.height, grid.data);

      return occ;
    } catch {
      return null;
    }
  }, [goalX, goalY, grid]);

  const isDisconnected = connectionStatus !== 'connected';
  const canSend = !isDisconnected && mapActivation?.status === 'ready' && !isEnvironmentMismatch && hasPose && grid.hasData && occupancyCheck?.type === 'free';

  const handleSendGoal = () => {
    setFeedback(null);
    setIsSubmitting(true);

    try {
      if (!canSend) throw new Error('A localized robot and free destination cell on the active map are required.');
      const res = RobotCommandService.sendIndoorGoal({
        x: goalX,
        y: goalY,
        yaw: goalYaw,
        frameId,
      });

      setActiveGoal({
        state: res.state, // 'SENT_UNCONFIRMED'
        x: goalX,
        y: goalY,
        yaw: goalYaw,
        timestamp: Date.now(),
      });

      setFeedback({
        state: res.state,
        label: 'Goal sent to Nav2 action server (/navigate_to_pose). Unconfirmed by robot.',
      });

      // Wire feedback listeners if goal handle supports it
      if (res.goal?.on) {
        const onFeedback = fb => setActiveGoal(prev => prev ? { ...prev, state: fb.status === 'accepted' ? 'ACCEPTED' : 'EXECUTING' } : null);
        const onResult = result => {
          const mappedState =
            result.status === 'succeeded'
              ? 'REACHED'
              : result.status === 'canceled'
                ? 'CANCELED'
                : ['failed', 'aborted', 'rejected', 'timeout'].includes(result.status)
                  ? 'FAILED'
                  : result.succeeded
                    ? 'REACHED'
                    : 'FAILED';
          setActiveGoal(prev => (prev ? { ...prev, state: mappedState, result } : null));
          if (mappedState === 'FAILED') {
            setFeedback({
              state: 'FAILED',
              label: result.error || `Navigation goal failed: ${result.status || 'unknown error'}`,
            });
          } else if (mappedState === 'REACHED') {
            setFeedback({
              state: 'CONFIRMED',
              label: 'Destination reached.',
            });
          }
        };
        res.goal.on('feedback', onFeedback);
        res.goal.on('result', onResult);
        subscriptions.current.push(() => { res.goal.off?.('feedback', onFeedback); res.goal.off?.('result', onResult); });
      }
    } catch (err) {
      setFeedback({
        state: 'FAILED',
        label: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelGoal = async () => {
    try {
      await RobotCommandService.stop();
      setActiveGoal((prev) => (prev ? { ...prev, state: 'CANCEL_PENDING' } : null));
      setFeedback({
        state: 'SENT_UNCONFIRMED',
        label: 'Stop/Cancel command dispatched.',
      });
    } catch (err) {
      setFeedback({
        state: 'FAILED',
        label: err.message,
      });
    }
  };

  return (
    <div className="flex h-full flex-col p-4 bg-deck-950 text-ink-high overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-deck-line">
        <div>
          <h2 className="font-mono text-sm font-bold tracking-wider text-ink-high uppercase">
            Indoor Nav Planner
          </h2>
          <div className="text-[11px] font-mono text-ink-low mt-0.5">
            {selectedMap?.name && <span className="text-ink-high mr-2 font-semibold">[{selectedMap.name}]</span>}
            Frame: <span className="text-signal-cyan font-medium">{frameId}</span> · Units: <span className="text-signal-cyan">meters / radians</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SignalDot tone={isDisconnected ? 'critical' : 'live'} />
          <span className="font-mono text-xs text-ink-mid uppercase">
            {connectionStatus}
          </span>
        </div>
      </div>

      {/* Robot Current Pose */}
      <div className="mt-3 p-2.5 rounded border border-deck-line bg-deck-900/60 font-mono text-xs">
        <div className="text-[10px] text-ink-low uppercase tracking-wider mb-1">
          Current Robot Pose (TF: map → base_link)
        </div>
        {robotPose ? (
          <div className="grid grid-cols-3 gap-2 text-ink-high">
            <div>X: <span className="text-signal-cyan font-bold">{robotPose.x.toFixed(2)}m</span></div>
            <div>Y: <span className="text-signal-cyan font-bold">{robotPose.y.toFixed(2)}m</span></div>
            <div>Yaw: <span className="text-signal-cyan font-bold">{((robotPose.yaw * 180) / Math.PI).toFixed(1)}°</span></div>
          </div>
        ) : (
          <div className="text-ink-low italic">No live TF transform from map to base_link</div>
        )}
      </div>

      {selectedMap && <SavedMapPreview map={selectedMap} onPick={point => { setGoalX(point.x); setGoalY(point.y); }} />}
      {/* Target Destination Inputs */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="text-xs font-mono font-bold tracking-wider uppercase text-ink-mid">
          Target Destination
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block font-mono text-[10px] text-ink-low uppercase">X (meters)</label>
            <input
              type="number"
              step="0.1"
              value={goalX}
              onChange={(e) => setGoalX(e.target.value)}
              disabled={isDisconnected}
              className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-ink-low uppercase">Y (meters)</label>
            <input
              type="number"
              step="0.1"
              value={goalY}
              onChange={(e) => setGoalY(e.target.value)}
              disabled={isDisconnected}
              className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-ink-low uppercase">Yaw (rad)</label>
            <input
              type="number"
              step="0.05"
              value={goalYaw}
              onChange={(e) => setGoalYaw(e.target.value)}
              disabled={isDisconnected}
              className="w-full rounded border border-deck-line bg-deck-900 px-2 py-1.5 font-mono text-xs text-ink-high outline-none focus:border-signal-cyan disabled:opacity-50"
            />
          </div>
        </div>

        {/* Occupancy Grid Verification */}
        {occupancyCheck && (
          <div className="text-[11px] font-mono flex items-center gap-2">
            <span className="text-ink-low">Occupancy check:</span>
            {occupancyCheck.type === 'occupied' && (
              <span className="text-signal-red font-bold">WARNING: Cell is OCCUPIED (costmap check required)</span>
            )}
            {occupancyCheck.type === 'unknown' && (
              <span className="text-signal-amber">NOTE: Cell is UNKNOWN</span>
            )}
            {occupancyCheck.type === 'free' && (
              <span className="text-signal-cyan">Cell is FREE</span>
            )}
            {occupancyCheck.type === 'out_of_bounds' && (
              <span className="text-signal-red">Outside map boundaries</span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSendGoal}
            disabled={!canSend || isSubmitting}
            className="flex-1 rounded border border-signal-cyan/50 bg-signal-cyan/20 px-3 py-2 font-mono text-xs font-bold text-signal-cyan hover:bg-signal-cyan/30 disabled:opacity-30 transition-colors uppercase tracking-wider"
          >
            Send Goal
          </button>

          <button
            type="button"
            onClick={handleCancelGoal}
            disabled={isDisconnected}
            className="rounded border border-signal-red/50 bg-signal-red/10 px-3 py-2 font-mono text-xs font-bold text-signal-red hover:bg-signal-red/20 disabled:opacity-30 transition-colors uppercase"
          >
            Cancel
          </button>
        </div>

        {/* Feedback display */}
        {feedback && (
          <div className="mt-2">
            <CommandFeedback feedback={feedback} />
          </div>
        )}

        {/* Active Goal card */}
        {activeGoal && (
          <div className="mt-3 p-3 rounded border border-deck-line bg-deck-900/40 font-mono text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-ink-low uppercase text-[10px]">Active Goal Status</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                  activeGoal.state === 'REACHED'
                    ? 'bg-signal-cyan/20 text-signal-cyan'
                    : activeGoal.state === 'CANCELED' || activeGoal.state === 'FAILED'
                      ? 'bg-signal-red/20 text-signal-red'
                      : 'bg-signal-amber/20 text-signal-amber'
                }`}
              >
                {activeGoal.state}
              </span>
            </div>
            <div className="text-ink-mid text-[11px]">
              Target: X={Number(activeGoal.x).toFixed(2)}, Y={Number(activeGoal.y).toFixed(2)}, Yaw={Number(activeGoal.yaw).toFixed(2)} rad
            </div>
            <div className="text-[10px] text-ink-low">
              Dispatched at {new Date(activeGoal.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
