import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./RosConnectionService.js', () => ({
  default: {
    status: 'connected',
    getService: vi.fn(),
  },
}));

import Nav2ParameterService, { Nav2ParameterError, RESPONSE_TIMEOUT_MS } from './Nav2ParameterService.js';
import rosService from './RosConnectionService.js';

function fakeService({ onGet, onSet } = {}) {
  return {
    callService: (request, callback, failedCallback) => {
      try {
        const result = request.parameters ? onSet?.(request) : onGet?.(request);
        if (result === undefined) return; // simulate "never responds"
        callback(result);
      } catch (err) {
        failedCallback(err);
      }
    },
  };
}

describe('Nav2ParameterService', () => {
  beforeEach(() => {
    rosService.status = 'connected';
    rosService.getService.mockReset();
  });

  it('getParameters returns a value per requested name on a successful round-trip', async () => {
    rosService.getService.mockReturnValue(
      fakeService({
        onGet: (req) => ({
          values: req.names.map((n) => ({ type: 3, double_value: n === 'controller_server.FollowPath.max_vel_x' ? 0.6 : 0.25 })),
        }),
      }),
    );

    const values = await Nav2ParameterService.getParameters([
      'controller_server.FollowPath.max_vel_x',
      'controller_server.general_goal_checker.xy_goal_tolerance',
    ]);

    expect(values.get('controller_server.FollowPath.max_vel_x')).toBe(0.6);
    expect(values.get('controller_server.general_goal_checker.xy_goal_tolerance')).toBe(0.25);
    expect(rosService.getService).toHaveBeenCalledWith(
      expect.objectContaining({ name: '/nav2_param_gatekeeper/get_parameters' }),
    );
  });

  it('getParameter omits a name the gatekeeper reports as PARAMETER_NOT_SET, rather than fabricating a value', async () => {
    rosService.getService.mockReturnValue(fakeService({ onGet: () => ({ values: [{ type: 0 }] }) }));
    const value = await Nav2ParameterService.getParameter('controller_server.FollowPath.max_vel_x');
    expect(value).toBeUndefined();
  });

  it('setParameter resolves on a successful outcome', async () => {
    rosService.getService.mockReturnValue(fakeService({ onSet: () => ({ results: [{ successful: true }] }) }));
    await expect(Nav2ParameterService.setParameter('controller_server.FollowPath.max_vel_x', 0.6)).resolves.toBeUndefined();
  });

  it('setParameter throws Nav2ParameterError("REJECTED") with the gatekeeper\'s reason when it declines', async () => {
    rosService.getService.mockReturnValue(
      fakeService({ onSet: () => ({ results: [{ successful: false, reason: 'outside allowed range [0.05, 1.5]' }] }) }),
    );

    await expect(Nav2ParameterService.setParameter('controller_server.FollowPath.max_vel_x', 99)).rejects.toMatchObject(
      { code: 'REJECTED', message: 'outside allowed range [0.05, 1.5]' },
    );
  });

  it('rejects with DISCONNECTED and never calls the service when the link is down', async () => {
    rosService.status = 'closed';
    rosService.getService.mockReturnValue(fakeService({ onGet: () => ({ values: [] }) }));

    await expect(Nav2ParameterService.getParameter('controller_server.FollowPath.max_vel_x')).rejects.toBeInstanceOf(
      Nav2ParameterError,
    );
    await expect(Nav2ParameterService.getParameter('controller_server.FollowPath.max_vel_x')).rejects.toMatchObject({
      code: 'DISCONNECTED',
    });
    expect(rosService.getService).not.toHaveBeenCalled();
  });

  it('times out into NO_RESPONSE when nothing answers — no Nav2 node exists to reply', async () => {
    vi.useFakeTimers();
    try {
      rosService.getService.mockReturnValue(fakeService({})); // onGet undefined -> "never responds"

      const promise = Nav2ParameterService.getParameter('controller_server.FollowPath.max_vel_x');
      const assertion = expect(promise).rejects.toMatchObject({ code: 'NO_RESPONSE' });
      await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a transport-level failedCallback as NO_RESPONSE too', async () => {
    rosService.getService.mockReturnValue(
      fakeService({
        onGet: () => {
          throw new Error('service not advertised');
        },
      }),
    );
    await expect(Nav2ParameterService.getParameter('controller_server.FollowPath.max_vel_x')).rejects.toMatchObject({
      code: 'NO_RESPONSE',
    });
  });
});
