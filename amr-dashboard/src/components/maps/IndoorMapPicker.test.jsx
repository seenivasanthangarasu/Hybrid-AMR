import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import IndoorMapPicker from './IndoorMapPicker.jsx';
import mapStorage from '../../services/MapStorageService.js';

describe('IndoorMapPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state with option to go to mapping mode', async () => {
    vi.spyOn(mapStorage, 'listMaps').mockResolvedValue({ status: 'empty', maps: [] });
    const onGoToMapping = vi.fn();
    const onClose = vi.fn();

    render(
      <IndoorMapPicker
        open={true}
        onClose={onClose}
        onGoToMapping={onGoToMapping}
      />,
    );

    expect(await screen.findByText('NO INDOOR MAPS FOUND')).toBeInTheDocument();
    const createBtn = screen.getByRole('button', { name: /CREATE MAP IN MAPPING MODE/i });
    expect(createBtn).toBeInTheDocument();

    await userEvent.click(createBtn);
    expect(onGoToMapping).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders map cards and calls onSelectMap', async () => {
    const mockMap = {
      map_id: 'map-warehouse-1',
      revision: 1,
      name: 'Main Warehouse',
      environment: 'indoor',
      created_at: '2026-09-25T10:00:00.000Z',
      grid: { width: 200, height: 100, resolution: 0.05, origin: {} },
      source: { robot_id: 'amr-1' },
    };

    vi.spyOn(mapStorage, 'listMaps').mockResolvedValue({
      status: 'ready',
      maps: [mockMap],
    });

    const onSelectMap = vi.fn();
    const onClose = vi.fn();

    render(
      <IndoorMapPicker
        open={true}
        onClose={onClose}
        onSelectMap={onSelectMap}
      />,
    );

    expect(await screen.findByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText(/10.0m × 5.0m/)).toBeInTheDocument();

    const selectBtn = screen.getByRole('button', { name: /SELECT MAP/i });
    await userEvent.click(selectBtn);

    expect(onSelectMap).toHaveBeenCalledWith(mockMap);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders needs-permission state', async () => {
    vi.spyOn(mapStorage, 'listMaps').mockResolvedValue({
      status: 'needs-permission',
      maps: [],
    });

    render(<IndoorMapPicker open={true} onClose={() => {}} />);
    expect(await screen.findByText('PERMISSION REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GRANT PERMISSION/i })).toBeInTheDocument();
  });
});
