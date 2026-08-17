import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// useTheme keeps its state at module scope so every consumer shares it, which
// means each test needs a fresh module instance to exercise initialisation.
async function loadTheme() {
  vi.resetModules();
  return (await import('./useTheme.js')).default;
}

function stubPrefersLight(matches) {
  window.matchMedia = vi.fn().mockReturnValue({ matches, media: '', addEventListener() {}, removeEventListener() {} });
}

describe('useTheme initialisation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    stubPrefersLight(false);
  });
  afterEach(() => {
    delete window.matchMedia;
  });

  it('defaults to dark with no stored choice and no light preference', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('follows the OS light preference when nothing is stored', async () => {
    stubPrefersLight(true);
    const useTheme = await loadTheme();
    expect(renderHook(() => useTheme()).result.current.theme).toBe('light');
  });

  // An explicit choice must win over the OS preference, in both directions.
  it.each(['light', 'dark'])('restores the stored %s choice over the OS preference', async (saved) => {
    window.localStorage.setItem('amr-theme', saved);
    stubPrefersLight(saved === 'dark');
    const useTheme = await loadTheme();
    expect(renderHook(() => useTheme()).result.current.theme).toBe(saved);
  });

  it('ignores a corrupted stored value and falls back', async () => {
    window.localStorage.setItem('amr-theme', 'neon');
    const useTheme = await loadTheme();
    expect(renderHook(() => useTheme()).result.current.theme).toBe('dark');
  });

  // CSS variables key off data-theme, so it must be set before the first paint,
  // not on the first toggle — otherwise a stored light theme flashes dark.
  it('applies data-theme at module load, before any component renders', async () => {
    window.localStorage.setItem('amr-theme', 'light');
    await loadTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('useTheme toggling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    stubPrefersLight(false);
  });
  afterEach(() => {
    delete window.matchMedia;
  });

  it('toggles dark → light → dark', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('dark');
  });

  it('writes the new theme to the document and to storage', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('amr-theme')).toBe('light');
  });

  it('setTheme applies an explicit value', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    expect(result.current.theme).toBe('light');
  });

  it('setTheme to the current value is a no-op that does not touch storage', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => useTheme());
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    act(() => result.current.setTheme('dark'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // The header toggle and the canvas views are separate consumers; a theme
  // change that only reached one of them would leave a half-recoloured UI.
  it('propagates one change to every consumer', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => ({ header: useTheme(), canvas: useTheme() }));
    act(() => result.current.header.toggle());
    expect(result.current.canvas.theme).toBe('light');
  });

  it('still applies the theme when storage throws (private mode)', async () => {
    const useTheme = await loadTheme();
    const { result } = renderHook(() => useTheme());
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    spy.mockRestore();
  });

  it('stops notifying a consumer once it unmounts', async () => {
    const useTheme = await loadTheme();
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    b.unmount();
    act(() => a.result.current.toggle());
    expect(a.result.current.theme).toBe('light');
  });
});
