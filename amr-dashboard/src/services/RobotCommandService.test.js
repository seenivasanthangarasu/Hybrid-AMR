import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the connection singleton: a mutable status + a getTopic that records
// every publish so we can assert the exact e-stop payload (spec REQ-09 / REQ-02).
const rosMock = vi.hoisted(() => {
  const obj = {
    ros: {},
    status: 'connected',
    publishes: [],
    // Action goals land here, recorded as { name, actionType, goal } where
    // `goal` is the payload we handed ROSLIB.Goal (roslib wraps it under a
    // `goal` key alongside a generated goal_id).
    actionGoals: [],
    getTopic({ name }) {
      return { publish: (msg) => obj.publishes.push({ name, msg }) };
    },
    // ROSLIB.Goal writes into `actionClient.goals` and publishes via
    // `actionClient.goalTopic`, so the stub has to provide both to be
    // constructible at all.
    getActionClient({ name, actionType } = {}) {
      return {
        goals: {},
        goalTopic: {
          publish: (msg) => obj.actionGoals.push({ name, actionType, goal: msg.goal }),
        },
        cancelTopic: { publish: () => {} },
        cancel: () => {},
      };
    },
  };
  return obj;
});

vi.mock('./RosConnectionService.js', () => ({ default: rosMock }));

import RobotCommandService, { CommandError } from './RobotCommandService.js';

describe('RobotCommandService.emergencyStop', () => {
  beforeEach(() => {
    rosMock.status = 'connected';
    rosMock.publishes.length = 0;
  });

  it('publishes Bool(true) on /emergency_stop and zeroes /cmd_vel when connected', () => {
    const res = RobotCommandService.emergencyStop();
    expect(res).toEqual({ state: 'SENT_UNCONFIRMED' });

    const estop = rosMock.publishes.find((p) => p.name === '/emergency_stop');
    const cmd = rosMock.publishes.find((p) => p.name === '/cmd_vel');
    expect(estop).toBeTruthy();
    expect(estop.msg.data).toBe(true);
    expect(cmd).toBeTruthy();
    expect(cmd.msg.linear).toEqual({ x: 0, y: 0, z: 0 });
    expect(cmd.msg.angular).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('throws a DISCONNECTED CommandError and publishes nothing when not connected', () => {
    rosMock.status = 'disconnected';
    let thrown;
    try {
      RobotCommandService.emergencyStop();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CommandError);
    expect(thrown.code).toBe('DISCONNECTED');
    expect(rosMock.publishes.length).toBe(0);
  });
});

describe('RobotCommandService mission state commands', () => {
  beforeEach(() => {
    rosMock.status = 'connected';
    rosMock.publishes.length = 0;
  });

  it.each([
    ['start', 'START'],
    ['pause', 'PAUSE'],
    ['resume', 'RESUME'],
  ])('%s publishes "%s" on /mission_state_cmd', (method, state) => {
    const res = RobotCommandService[method]();
    expect(res).toEqual({ state: 'SENT_UNCONFIRMED' });
    expect(rosMock.publishes).toEqual([{ name: '/mission_state_cmd', msg: { data: state } }]);
  });

  // STOP must both end the mission state and cancel the in-flight Nav2 goal;
  // publishing STOP alone would leave the robot driving to its old goal.
  it('stop publishes STOP and cancels the active navigation goal', () => {
    const cancel = vi.fn();
    const original = rosMock.getActionClient;
    rosMock.getActionClient = () => ({ cancel });

    const res = RobotCommandService.stop();
    expect(res).toEqual({ state: 'SENT_UNCONFIRMED' });
    expect(rosMock.publishes).toEqual([{ name: '/mission_state_cmd', msg: { data: 'STOP' } }]);
    expect(cancel).toHaveBeenCalled();

    rosMock.getActionClient = original;
  });

  it('stop still succeeds against an action client with no cancel support', () => {
    const original = rosMock.getActionClient;
    rosMock.getActionClient = () => ({});
    expect(() => RobotCommandService.stop()).not.toThrow();
    rosMock.getActionClient = original;
  });

  it.each(['start', 'pause', 'resume', 'stop'])(
    '%s refuses to publish while disconnected',
    (method) => {
      rosMock.status = 'disconnected';
      expect(() => RobotCommandService[method]()).toThrow(CommandError);
      expect(rosMock.publishes.length).toBe(0);
    },
  );
});

describe('RobotCommandService.clearEmergencyStop', () => {
  beforeEach(() => {
    rosMock.status = 'connected';
    rosMock.publishes.length = 0;
  });

  it('publishes Bool(false) on /emergency_stop and leaves /cmd_vel alone', () => {
    const res = RobotCommandService.clearEmergencyStop();
    expect(res).toEqual({ state: 'SENT_UNCONFIRMED' });
    expect(rosMock.publishes).toEqual([{ name: '/emergency_stop', msg: { data: false } }]);
  });

  it('refuses to clear the e-stop while disconnected', () => {
    rosMock.status = 'disconnected';
    expect(() => RobotCommandService.clearEmergencyStop()).toThrow(CommandError);
    expect(rosMock.publishes.length).toBe(0);
  });
});

describe('RobotCommandService.sendGoal', () => {
  beforeEach(() => {
    rosMock.status = 'connected';
    rosMock.publishes.length = 0;
  });

  it('publishes the goal on /mission_goal with numeric coordinates', () => {
    const res = RobotCommandService.sendGoal({
      goalName: 'Dock A',
      latitude: '12.9716',
      longitude: '77.5946',
    });
    expect(res).toEqual({ state: 'SENT_UNCONFIRMED' });
    expect(rosMock.publishes).toEqual([
      { name: '/mission_goal', msg: { name: 'Dock A', latitude: 12.9716, longitude: 77.5946 } },
    ]);
    // Form inputs arrive as strings; ROS message fields must be real numbers.
    const { msg } = rosMock.publishes[0];
    expect(typeof msg.latitude).toBe('number');
    expect(typeof msg.longitude).toBe('number');
  });

  it('refuses to send a goal while disconnected', () => {
    rosMock.status = 'disconnected';
    expect(() =>
      RobotCommandService.sendGoal({ goalName: 'A', latitude: '1', longitude: '2' }),
    ).toThrow(CommandError);
    expect(rosMock.publishes.length).toBe(0);
  });
});

describe('RobotCommandService.sendWaypoints', () => {
  const route = [
    { id: 'wp-1', name: 'A', latitude: 12.9716, longitude: 77.5946 },
    { id: 'wp-2', name: 'B', latitude: 13.0827, longitude: 80.2707 },
  ];

  beforeEach(() => {
    rosMock.status = 'connected';
    rosMock.publishes.length = 0;
    rosMock.actionGoals.length = 0;
  });

  it('sends one FollowGPSWaypoints goal carrying the whole route', () => {
    const res = RobotCommandService.sendWaypoints(route);
    expect(res.state).toBe('SENT_UNCONFIRMED');

    // One goal, not one per waypoint: the action server sequences the route,
    // the dashboard does not walk it.
    expect(rosMock.actionGoals).toHaveLength(1);
    expect(rosMock.actionGoals[0].name).toBe('/follow_gps_waypoints');
    expect(rosMock.actionGoals[0].actionType).toBe('nav2_msgs/action/FollowGPSWaypoints');
  });

  it('preserves route order in gps_poses', () => {
    RobotCommandService.sendWaypoints(route);
    const { gps_poses: poses } = rosMock.actionGoals[0].goal;

    expect(poses).toHaveLength(2);
    expect(poses[0].position.latitude).toBe(12.9716);
    expect(poses[1].position.latitude).toBe(13.0827);
  });

  it('coerces string coordinates to numbers', () => {
    RobotCommandService.sendWaypoints([{ id: 'x', name: 'A', latitude: '1.25', longitude: '2.5' }]);
    const { position } = rosMock.actionGoals[0].goal.gps_poses[0];

    expect(position.latitude).toBe(1.25);
    expect(typeof position.longitude).toBe('number');
  });

  // The operator picks a position, never a heading — an invented goal yaw
  // would make the robot turn to face a direction nobody asked for.
  it('sends an identity orientation for every waypoint', () => {
    RobotCommandService.sendWaypoints(route);
    rosMock.actionGoals[0].goal.gps_poses.forEach((pose) => {
      expect(pose.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    });
  });

  it('throws EMPTY_ROUTE and sends nothing for an empty or missing route', () => {
    [[], undefined].forEach((empty) => {
      let thrown;
      try {
        RobotCommandService.sendWaypoints(empty);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(CommandError);
      expect(thrown.code).toBe('EMPTY_ROUTE');
    });
    expect(rosMock.actionGoals.length).toBe(0);
  });

  it('refuses to send a route while disconnected', () => {
    rosMock.status = 'disconnected';
    expect(() => RobotCommandService.sendWaypoints(route)).toThrow(CommandError);
    expect(rosMock.actionGoals.length).toBe(0);
  });

  it('returns the goal handle so per-waypoint feedback can be wired later', () => {
    const res = RobotCommandService.sendWaypoints(route);
    // Nothing consumes this yet — Nav2 is not deployed — but it is the only
    // sanctioned route to a status beyond SENT_UNCONFIRMED.
    expect(typeof res.goal?.on).toBe('function');
  });
});

describe('CommandError', () => {
  beforeEach(() => {
    rosMock.status = 'connected';
    rosMock.publishes.length = 0;
  });

  // A publish that blows up mid-flight must surface as PUBLISH_FAILED, not
  // escape as a raw roslib error the operator UI has no handling for.
  it('wraps a throwing publish as PUBLISH_FAILED and keeps the cause', () => {
    const original = rosMock.getTopic;
    const boom = new Error('socket closed');
    rosMock.getTopic = () => ({
      publish: () => {
        throw boom;
      },
    });

    let thrown;
    try {
      RobotCommandService.start();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(CommandError);
    expect(thrown.code).toBe('PUBLISH_FAILED');
    expect(thrown.cause).toBe(boom);

    rosMock.getTopic = original;
  });

  it('carries a distinct human-readable message per code', () => {
    expect(new CommandError('DISCONNECTED').message).toBe('Not connected to ROSBridge');
    expect(new CommandError('PUBLISH_FAILED').message).toBe('Failed to publish command');
  });

  // No command topic has a robot-side ack yet, so nothing may ever resolve to
  // CONFIRMED — that would tell the operator the robot acted when it may not have.
  it('never reports a command as CONFIRMED', () => {
    const results = [
      RobotCommandService.start(),
      RobotCommandService.pause(),
      RobotCommandService.resume(),
      RobotCommandService.emergencyStop(),
      RobotCommandService.clearEmergencyStop(),
      RobotCommandService.sendGoal({ goalName: 'A', latitude: 1, longitude: 2 }),
      RobotCommandService.sendWaypoints([{ id: 'x', name: 'A', latitude: 1, longitude: 2 }]),
    ];
    results.forEach((r) => expect(r.state).toBe('SENT_UNCONFIRMED'));
  });
});
