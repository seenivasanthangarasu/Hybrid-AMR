import ROSLIB from 'roslib';
import rosService from './RosConnectionService.js';

/**
 * Nav2ParameterService
 * ----------------------
 * Reads/writes the curated Nav2 threshold set (src/config/nav2Thresholds.js)
 * via generic `rcl_interfaces/srv/GetParameters` / `SetParameters` calls over
 * rosbridge — data-handling-nav2-tasks.md REQ-B1.
 *
 * Targets the robot-side whitelisting gatekeeper node
 * (`/nav2_param_gatekeeper`, see docs/robot-repo-tasks.md), not Nav2's own
 * per-node parameter services directly: that doc's security-decision section
 * chose a small server-side whitelist over exposing Nav2's full parameter
 * surface on an unauthenticated rosbridge link, at the cost of one gatekeeper
 * node fronting all three Nav2 nodes behind a single service pair. That is
 * why every id here is a single flat `<node>.<plugin>.<param>` string rather
 * than a separate `(node, name)` pair per call.
 *
 * Nav2 is not deployed anywhere yet (see the same doc), so every call here
 * must only report success on an actual response — never assume delivery —
 * and time out into an honest `NAV2_UNAVAILABLE`-shaped failure otherwise,
 * mirroring `RobotCommandService`'s dispatch() wrapper (REQ-02 precedent):
 * this service must never silently swallow a failure.
 */

const GATEKEEPER_NODE = '/nav2_param_gatekeeper';
const GET_SERVICE_TYPE = 'rcl_interfaces/srv/GetParameters';
const SET_SERVICE_TYPE = 'rcl_interfaces/srv/SetParameters';
const PARAMETER_DOUBLE = 3;
const PARAMETER_NOT_SET = 0;

// No Nav2 node exists in this workspace to answer these calls, and rosbridge
// itself does not time out a call to a service with no server — without this,
// a missing gatekeeper would hang the panel's "current value" fetch forever
// instead of surfacing NAV2_UNAVAILABLE.
export const RESPONSE_TIMEOUT_MS = 4000;

export class Nav2ParameterError extends Error {
  constructor(code, cause) {
    super(
      code === 'DISCONNECTED'
        ? 'Not connected to ROSBridge'
        : code === 'REJECTED'
          ? cause || 'Nav2 parameter gatekeeper rejected the value'
          : 'No response from the Nav2 parameter gatekeeper',
    );
    this.code = code; // 'DISCONNECTED' | 'NO_RESPONSE' | 'REJECTED'
    this.cause = cause;
  }
}

function requireConnected() {
  if (rosService.status !== 'connected') throw new Nav2ParameterError('DISCONNECTED');
}

/** Wraps a roslib callService in a promise with a hard timeout — see RESPONSE_TIMEOUT_MS. */
function callWithTimeout(service, request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Nav2ParameterError('NO_RESPONSE'));
    }, RESPONSE_TIMEOUT_MS);

    service.callService(
      request,
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Nav2ParameterError('NO_RESPONSE', err));
      },
    );
  });
}

const Nav2ParameterService = {
  /**
   * @param {string[]} names - full `<node>.<plugin>.<param>` ids
   * @returns {Promise<Map<string, number|undefined>>} value per name; a name
   *   with no value (unset/unknown to the gatekeeper) is omitted from the map
   *   rather than mapped to a fabricated number.
   */
  async getParameters(names) {
    requireConnected();
    const service = rosService.getService({
      name: `${GATEKEEPER_NODE}/get_parameters`,
      serviceType: GET_SERVICE_TYPE,
    });
    const request = new ROSLIB.ServiceRequest({ names });
    const result = await callWithTimeout(service, request);

    const values = result?.values ?? [];
    const out = new Map();
    names.forEach((name, i) => {
      const v = values[i];
      if (v && v.type !== PARAMETER_NOT_SET) out.set(name, v.double_value);
    });
    return out;
  },

  /** @returns {Promise<number|undefined>} */
  async getParameter(name) {
    const values = await this.getParameters([name]);
    return values.get(name);
  },

  /** @throws {Nav2ParameterError} REJECTED if the gatekeeper's whitelist/range check declines the value. */
  async setParameter(name, value) {
    requireConnected();
    const service = rosService.getService({
      name: `${GATEKEEPER_NODE}/set_parameters`,
      serviceType: SET_SERVICE_TYPE,
    });
    const request = new ROSLIB.ServiceRequest({
      parameters: [{ name, value: { type: PARAMETER_DOUBLE, double_value: Number(value) } }],
    });
    const result = await callWithTimeout(service, request);

    const outcome = result?.results?.[0];
    if (!outcome?.successful) {
      throw new Nav2ParameterError('REJECTED', outcome?.reason);
    }
  },
};

export default Nav2ParameterService;
