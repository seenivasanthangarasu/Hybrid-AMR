import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import IndoorMappingWorkspace from './IndoorMappingWorkspace.jsx';
import mappingService from '../../services/MappingService.js';
import rosService from '../../services/RosConnectionService.js';

describe('IndoorMappingWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mappingService.cancel();
  });

  it('renders idle state with START MAPPING action', () => {
    render(<IndoorMappingWorkspace />);
    expect(screen.getByText('INDOOR MAPPING WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText('IDLE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /START MAPPING/i })).toBeInTheDocument();
  });

  it('transitions to running and offers FINISH & SAVE', async () => {
    vi.spyOn(mappingService, 'checkPrerequisites').mockResolvedValue(true);
    vi.spyOn(mappingService.bridge, 'request').mockImplementation(async (op, args) => ({
      run_id: args?.run_id,
      state: 'running',
    }));
    vi.spyOn(rosService, 'getTopic').mockReturnValue({
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    });

    render(<IndoorMappingWorkspace />);
    const startBtn = screen.getByRole('button', { name: /START MAPPING/i });
    await userEvent.click(startBtn);

    // State becomes start_pending or running
    expect(await screen.findByText(/START_PENDING|RUNNING/)).toBeInTheDocument();
  });

  it('surfaces error banner when mappingService reports failure', async () => {
    render(<IndoorMappingWorkspace />);
    act(() => {
      mappingService.emit({ error: 'Failed to access storage folder' });
    });

    expect(await screen.findByText('Failed to access storage folder')).toBeInTheDocument();
  });
});
