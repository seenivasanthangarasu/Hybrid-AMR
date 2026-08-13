import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const commandMock = vi.hoisted(() => ({
  sendWaypoints: vi.fn(() => ({ state: 'SENT_UNCONFIRMED', goal: {} })),
}));

vi.mock('../services/RobotCommandService.js', async () => {
  const actual = await vi.importActual('../services/RobotCommandService.js');
  return {
    ...actual,
    default: commandMock,
  };
});

import { CommandError } from '../services/RobotCommandService.js';
import { MissionProvider } from '../context/MissionContext.jsx';
import { __resetWaypointIds } from '../utils/waypoints.js';
import MissionPlanner from './MissionPlanner.jsx';

function renderPlanner(connectionStatus = 'connected') {
  return render(
    <MissionProvider>
      <MissionPlanner connectionStatus={connectionStatus} />
    </MissionProvider>,
  );
}

async function addWaypoint(user, name, lat, lon) {
  await user.clear(screen.getByLabelText(/waypoint name/i));
  await user.type(screen.getByLabelText(/waypoint name/i), name);
  await user.type(screen.getByLabelText(/latitude/i), lat);
  await user.type(screen.getByLabelText(/longitude/i), lon);
  await user.click(screen.getByRole('button', { name: /add waypoint/i }));
}

const rows = () => screen.queryAllByRole('listitem');

beforeEach(() => {
  __resetWaypointIds();
  commandMock.sendWaypoints.mockClear();
  commandMock.sendWaypoints.mockImplementation(() => ({ state: 'SENT_UNCONFIRMED', goal: {} }));
});

describe('MissionPlanner route building', () => {
  it('starts with an empty route and a disabled send', () => {
    renderPlanner();
    expect(screen.getByText(/no waypoints/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send route/i })).toBeDisabled();
    expect(screen.getByText(/add at least one waypoint/i)).toBeInTheDocument();
  });

  it('appends waypoints in order and clears the entry fields', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '12.9716', '77.5946');
    await addWaypoint(user, 'DOCK_B', '13.0827', '80.2707');

    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText('DOCK_A')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('DOCK_B')).toBeInTheDocument();
    expect(screen.getByLabelText(/waypoint name/i)).toHaveValue('');
  });

  it('refuses an incomplete entry and says exactly what is missing', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText(/latitude/i), '12.97');
    await user.click(screen.getByRole('button', { name: /add waypoint/i }));

    expect(screen.getByText(/enter a waypoint name/i)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it('rejects an out-of-range coordinate rather than sending it', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'BAD', '999', '77.5946');

    expect(screen.getByText(/latitude between -90 and 90/i)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it('reorders the route with the row controls', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await addWaypoint(user, 'DOCK_B', '3', '4');
    await user.click(screen.getByRole('button', { name: /move DOCK_B earlier/i }));

    expect(within(rows()[0]).getByText('DOCK_B')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('DOCK_A')).toBeInTheDocument();
  });

  it('disables the reorder controls at the ends of the route', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await addWaypoint(user, 'DOCK_B', '3', '4');

    expect(screen.getByRole('button', { name: /move DOCK_A earlier/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move DOCK_B later/i })).toBeDisabled();
  });

  it('removes a single waypoint', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await addWaypoint(user, 'DOCK_B', '3', '4');

    await user.click(screen.getByRole('button', { name: /remove DOCK_A/i }));
    expect(rows()).toHaveLength(1);
    expect(within(rows()[0]).getByText('DOCK_B')).toBeInTheDocument();
  });

  it('adds a waypoint when Enter is pressed in an entry field', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText(/waypoint name/i), 'DOCK_A');
    await user.type(screen.getByLabelText(/latitude/i), '1');
    await user.type(screen.getByLabelText(/longitude/i), '2{Enter}');

    expect(rows()).toHaveLength(1);
  });

  it('reports the straight-line route length, labelled as such', async () => {
    const user = userEvent.setup();
    renderPlanner();

    // ~111 km apart: one degree of latitude at the equator.
    await addWaypoint(user, 'DOCK_A', '0', '0');
    await addWaypoint(user, 'DOCK_B', '1', '0');

    // Never presented as a drive distance or an ETA — the robot's real path is
    // Nav2's business, and no speed is known.
    expect(screen.getByText(/111 km straight-line/i)).toBeInTheDocument();
  });
});

describe('MissionPlanner clearing the route', () => {
  it('does not discard the route on a single click', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/discard all 1/i);
  });

  it('clears the route once the discard is confirmed', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /discard/i }));

    expect(screen.getByText(/no waypoints/i)).toBeInTheDocument();
  });

  it('keeps the route when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    await user.click(screen.getByRole('button', { name: /keep/i }));

    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MissionPlanner dispatch', () => {
  it('sends the whole route in one call, in list order', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await addWaypoint(user, 'DOCK_B', '3', '4');
    await user.click(screen.getByRole('button', { name: /send route/i }));

    expect(commandMock.sendWaypoints).toHaveBeenCalledTimes(1);
    const sent = commandMock.sendWaypoints.mock.calls[0][0];
    expect(sent.map((w) => w.name)).toEqual(['DOCK_A', 'DOCK_B']);
  });

  it('counts the route on the send button', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    expect(screen.getByRole('button', { name: /send route \(1\)/i })).toBeInTheDocument();
  });

  // The route is on the wire; the robot has acknowledged nothing.
  it('reports a successful dispatch as unconfirmed, never as done', async () => {
    const user = userEvent.setup();
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await user.click(screen.getByRole('button', { name: /send route/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/unconfirmed \(no robot ack\)/i);
  });

  it('surfaces a failed dispatch instead of swallowing it', async () => {
    const user = userEvent.setup();
    commandMock.sendWaypoints.mockImplementation(() => {
      throw new CommandError('PUBLISH_FAILED', new Error('socket closed'));
    });
    renderPlanner();

    await addWaypoint(user, 'DOCK_A', '1', '2');
    await user.click(screen.getByRole('button', { name: /send route/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/failed — publish failed/i);
  });

  it('blocks dispatch while disconnected and names the link as the blocker', async () => {
    const user = userEvent.setup();
    renderPlanner('closed');

    // Building a route offline is allowed — only the dispatch is gated.
    await addWaypoint(user, 'DOCK_A', '1', '2');
    expect(rows()).toHaveLength(1);

    expect(screen.getByRole('button', { name: /send route/i })).toBeDisabled();
    expect(screen.getByText(/disconnected — commands unavailable/i)).toBeInTheDocument();
    expect(commandMock.sendWaypoints).not.toHaveBeenCalled();
  });
});
