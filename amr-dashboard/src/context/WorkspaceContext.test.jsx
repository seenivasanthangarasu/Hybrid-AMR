import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkspaceProvider,
  useWorkspace,
  isValidCombination,
} from './WorkspaceContext.jsx';
import rosService from '../services/RosConnectionService.js';

describe('isValidCombination', () => {
  it('allows indoor manual, mapping, and navigation', () => {
    expect(isValidCombination('indoor', 'manual')).toBe(true);
    expect(isValidCombination('indoor', 'mapping')).toBe(true);
    expect(isValidCombination('indoor', 'navigation')).toBe(true);
  });

  it('allows outdoor manual and navigation, but FORBIDS outdoor mapping', () => {
    expect(isValidCombination('outdoor', 'manual')).toBe(true);
    expect(isValidCombination('outdoor', 'navigation')).toBe(true);
    expect(isValidCombination('outdoor', 'mapping')).toBe(false);
  });

  it('allows hybrid manual, mapping, and navigation', () => {
    expect(isValidCombination('hybrid', 'manual')).toBe(true);
    expect(isValidCombination('hybrid', 'mapping')).toBe(true);
    expect(isValidCombination('hybrid', 'navigation')).toBe(true);
  });

  it('rejects invalid environments or modes', () => {
    expect(isValidCombination('space', 'manual')).toBe(false);
    expect(isValidCombination('indoor', 'flying')).toBe(false);
    expect(isValidCombination(null, 'manual')).toBe(false);
    expect(isValidCombination('indoor', null)).toBe(false);
  });
});

describe('WorkspaceProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('initializes with null when unconfigured', () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => <WorkspaceProvider>{children}</WorkspaceProvider>,
    });

    expect(result.current.isConfigured).toBe(false);
    expect(result.current.environment).toBeNull();
    expect(result.current.operatingMode).toBeNull();
  });

  it('accepts initialConfig when valid', () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider initialConfig={{ environment: 'indoor', mode: 'manual' }}>
          {children}
        </WorkspaceProvider>
      ),
    });

    expect(result.current.isConfigured).toBe(true);
    expect(result.current.environment).toBe('indoor');
    expect(result.current.operatingMode).toBe('manual');
    expect(result.current.effectiveEnvironment).toBe('indoor');
  });

  it('generates a fresh navigationEntryId each time navigation mode is entered', () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => <WorkspaceProvider>{children}</WorkspaceProvider>,
    });

    act(() => {
      result.current.setWorkspace({ environment: 'indoor', mode: 'navigation' });
    });

    const firstEntryId = result.current.navigationEntryId;
    expect(firstEntryId).toBeTruthy();

    act(() => {
      result.current.setOperatingMode('manual');
    });
    expect(result.current.navigationEntryId).toBeNull();

    act(() => {
      result.current.setOperatingMode('navigation');
    });
    const secondEntryId = result.current.navigationEntryId;
    expect(secondEntryId).toBeTruthy();
    expect(secondEntryId).not.toBe(firstEntryId);
  });

  it('rejects setting outdoor mapping mode', () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider initialConfig={{ environment: 'outdoor', mode: 'manual' }}>
          {children}
        </WorkspaceProvider>
      ),
    });

    expect(() => {
      act(() => {
        result.current.setOperatingMode('mapping');
      });
    }).toThrow(/not available in outdoor environment/);
  });

  it('manages hybrid activeSegment and updates effectiveEnvironment', () => {
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider initialConfig={{ environment: 'hybrid', mode: 'manual', activeSegment: 'indoor' }}>
          {children}
        </WorkspaceProvider>
      ),
    });

    expect(result.current.environment).toBe('hybrid');
    expect(result.current.activeSegment).toBe('indoor');
    expect(result.current.effectiveEnvironment).toBe('indoor');

    act(() => {
      result.current.setActiveSegment('outdoor');
    });

    expect(result.current.activeSegment).toBe('outdoor');
    expect(result.current.effectiveEnvironment).toBe('outdoor');
  });

  it('invalidates pending map activation on ROS disconnect', () => {
    let statusCallback;
    vi.spyOn(rosService, 'onStatusChange').mockImplementation((cb) => {
      statusCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useWorkspace(), {
      wrapper: ({ children }) => (
        <WorkspaceProvider initialConfig={{ environment: 'indoor', mode: 'navigation' }}>
          {children}
        </WorkspaceProvider>
      ),
    });

    act(() => {
      result.current.setSelectedMap({map_id:'test-map'});
    });
    expect(result.current.mapActivation.status).toBe('validating');

    act(() => {
      statusCallback('disconnected');
    });
    expect(result.current.mapActivation.status).toBe('unavailable');
    expect(result.current.mapActivation.error).toMatch(/disconnected/i);
  });
});

it('rejects hybrid outdoor mapping and ignores stale map activation patches', () => {
  const {result} = renderHook(()=>useWorkspace(), {wrapper:({children})=><WorkspaceProvider initialConfig={{environment:'hybrid',mode:'mapping',activeSegment:'indoor'}}>{children}</WorkspaceProvider>});
  act(()=>result.current.setActiveSegment('outdoor'));
  expect(result.current.activeSegment).toBe('indoor');
  expect(result.current.transitionError).toMatch(/Manual or Navigation/);
  act(()=>result.current.setOperatingMode('navigation'));
  act(()=>result.current.setSelectedMap({map_id:'a'}));
  const oldId=result.current.mapActivation.operationId;
  act(()=>result.current.setSelectedMap({map_id:'b'}));
  act(()=>result.current.updateMapActivation({operationId:oldId,status:'ready'}));
  expect(result.current.mapActivation.status).toBe('validating');
});
