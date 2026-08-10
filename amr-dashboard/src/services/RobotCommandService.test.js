import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the connection singleton: a mutable status + a getTopic that records
// every publish so we can assert the exact e-stop payload (spec REQ-09 / REQ-02).
const rosMock = vi.hoisted(() => {
  const obj = {
    ros: {},
    status: 'connected',
    publishes: [],
    getTopic({ name }) {
      return { publish: (msg) => obj.publishes.push({ name, msg }) };
    },
    getActionClient() {
      return { cancel: () => {} };
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
