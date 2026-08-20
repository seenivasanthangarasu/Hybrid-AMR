import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useDataSourceSelection from './useDataSourceSelection.js';
import { dataSources } from '../config/dataSources.js';

describe('useDataSourceSelection', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts from each source\'s shipped defaultEnabled when nothing is stored', () => {
    const { result } = renderHook(() => useDataSourceSelection());
    for (const s of dataSources) {
      expect(result.current.enabled[s.id]).toBe(s.defaultEnabled);
    }
  });

  it('toggling one source does not affect others', () => {
    const { result } = renderHook(() => useDataSourceSelection());
    const [first, second] = dataSources;
    const secondBefore = result.current.enabled[second.id];

    act(() => result.current.toggle(first.id));

    expect(result.current.enabled[first.id]).toBe(!first.defaultEnabled);
    expect(result.current.enabled[second.id]).toBe(secondBefore);
  });

  it('selectAll/selectNone affect only the given category when one is passed', () => {
    const { result } = renderHook(() => useDataSourceSelection());
    const category = dataSources[0].category;

    act(() => result.current.selectNone(category));
    for (const s of dataSources.filter((s) => s.category === category)) {
      expect(result.current.enabled[s.id]).toBe(false);
    }

    act(() => result.current.selectAll(category));
    for (const s of dataSources.filter((s) => s.category === category)) {
      expect(result.current.enabled[s.id]).toBe(true);
    }
  });

  it('selectAll/selectNone with no category affects every source', () => {
    const { result } = renderHook(() => useDataSourceSelection());
    act(() => result.current.selectNone());
    expect(Object.values(result.current.enabled).every((v) => v === false)).toBe(true);

    act(() => result.current.selectAll());
    expect(Object.values(result.current.enabled).every((v) => v === true)).toBe(true);
  });

  it('applyRecommendedDefaults restores the shipped defaults after changes', () => {
    const { result } = renderHook(() => useDataSourceSelection());
    act(() => result.current.selectAll());
    act(() => result.current.applyRecommendedDefaults());
    for (const s of dataSources) {
      expect(result.current.enabled[s.id]).toBe(s.defaultEnabled);
    }
  });

  it('enabledSources derives the live list of enabled entries', () => {
    const { result } = renderHook(() => useDataSourceSelection());
    act(() => result.current.selectNone());
    act(() => result.current.toggle('/odom'));
    expect(result.current.enabledSources.map((s) => s.id)).toEqual(['/odom']);
  });

  it('persists selection across remounts', () => {
    const { result, unmount } = renderHook(() => useDataSourceSelection());
    act(() => result.current.toggle('/map'));
    const after = result.current.enabled['/map'];
    unmount();

    const { result: fresh } = renderHook(() => useDataSourceSelection());
    expect(fresh.current.enabled['/map']).toBe(after);
  });

  it('backfills a newly-added source id with its default rather than dropping it', () => {
    window.localStorage.setItem(
      'amr-data-source-selection',
      JSON.stringify({ '/odom': false, 'some-removed-id': true }),
    );
    const { result } = renderHook(() => useDataSourceSelection());
    expect(result.current.enabled['/odom']).toBe(false); // stored value kept
    expect(result.current.enabled['/scan']).toBe(dataSources.find((s) => s.id === '/scan').defaultEnabled); // backfilled
    expect(result.current.enabled['some-removed-id']).toBeUndefined(); // stale id dropped
  });
});
