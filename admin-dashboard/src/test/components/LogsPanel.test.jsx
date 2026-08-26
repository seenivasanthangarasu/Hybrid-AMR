/**
 * LogsPanel.test.jsx
 *
 * Tests for the ROS & System Logs console.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LogsPanel from '../../components/LogsPanel.jsx';

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('LogsPanel – empty state', () => {
  it('shows "No log output available" placeholder when fetchLogs returns []', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => {
      expect(screen.getByText(/no log output available/i)).toBeInTheDocument();
    });
  });
});

describe('LogsPanel – initial fetch on mount', () => {
  it('calls fetchLogs on mount with default source "ros"', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());
    const [source] = fetchLogs.mock.calls[0];
    expect(source).toBe('ros');
  });
});

describe('LogsPanel – log line rendering', () => {
  it('renders log lines returned by fetchLogs', async () => {
    const lines = ['[INFO] Node started', '[WARN] Low battery', '[ERROR] Motor fault'];
    const fetchLogs = vi.fn().mockResolvedValue(lines);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => {
      expect(screen.getByText(/Node started/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Low battery/)).toBeInTheDocument();
    expect(screen.getByText(/Motor fault/)).toBeInTheDocument();
  });

  it('applies rose colour class to lines containing "error"', async () => {
    const fetchLogs = vi.fn().mockResolvedValue(['[ERROR] Critical failure']);
    const { container } = render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() =>
      expect(screen.getByText(/Critical failure/)).toBeInTheDocument()
    );
    // The line div should have a rose text class
    const line = container.querySelector('.text-rose-400');
    expect(line).not.toBeNull();
  });

  it('applies amber colour class to lines containing "warn"', async () => {
    const fetchLogs = vi.fn().mockResolvedValue(['[WARN] Sensor timeout']);
    const { container } = render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(screen.getByText(/Sensor timeout/)).toBeInTheDocument());
    const line = container.querySelector('.text-amber-300');
    expect(line).not.toBeNull();
  });

  it('applies cyan colour class to lines containing "info"', async () => {
    const fetchLogs = vi.fn().mockResolvedValue(['[INFO] Navigation started']);
    const { container } = render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(screen.getByText(/Navigation started/)).toBeInTheDocument());
    const line = container.querySelector('.text-cyan-300');
    expect(line).not.toBeNull();
  });
});

describe('LogsPanel – source and line count selectors', () => {
  it('fetches with source=journalctl when journalctl option is selected', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());

    fireEvent.change(screen.getByDisplayValue(/ros 2 log/i), {
      target: { value: 'journalctl' },
    });

    await waitFor(() => {
      const lastCall = fetchLogs.mock.calls[fetchLogs.mock.calls.length - 1];
      expect(lastCall[0]).toBe('journalctl');
    });
  });

  it('fetches with lines=200 when 200 lines option is selected', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());

    fireEvent.change(screen.getByDisplayValue('100 lines'), {
      target: { value: '200' },
    });

    await waitFor(() => {
      const lastCall = fetchLogs.mock.calls[fetchLogs.mock.calls.length - 1];
      expect(lastCall[1]).toBe(200);
    });
  });
});

describe('LogsPanel – manual refresh button', () => {
  it('calls fetchLogs when manual refresh button is clicked', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());

    const initialCount = fetchLogs.mock.calls.length;
    // The RefreshCw button has title "Refresh Logs"
    const refreshBtn = screen.getByTitle(/refresh logs/i);
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(fetchLogs.mock.calls.length).toBeGreaterThan(initialCount);
    });
  });
});

describe('LogsPanel – auto-scroll toggle', () => {
  it('renders auto-scroll toggle button', () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    // The ArrowDown button has title "Auto-scroll"
    expect(screen.getByTitle(/auto-scroll/i)).toBeInTheDocument();
  });

  it('toggles auto-scroll off when button is clicked', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    const { container } = render(<LogsPanel fetchLogs={fetchLogs} />);

    const toggleBtn = screen.getByTitle(/auto-scroll/i);
    // Initially active (has cyan class)
    expect(toggleBtn.className).toMatch(/cyan/);
    fireEvent.click(toggleBtn);
    // After toggle, should no longer be active
    expect(toggleBtn.className).not.toMatch(/cyan/);
  });
});

describe('LogsPanel – auto-polling', () => {
  it('re-fetches every 3 seconds', async () => {
    const fetchLogs = vi.fn().mockResolvedValue([]);
    render(<LogsPanel fetchLogs={fetchLogs} />);
    await waitFor(() => expect(fetchLogs).toHaveBeenCalled());

    const afterMount = fetchLogs.mock.calls.length;
    vi.advanceTimersByTime(3000);
    await waitFor(() =>
      expect(fetchLogs.mock.calls.length).toBeGreaterThan(afterMount)
    );
  });
});
