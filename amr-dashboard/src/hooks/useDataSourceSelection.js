import { useCallback, useEffect, useState } from 'react';
import { dataSources } from '../config/dataSources.js';

/**
 * Persisted enabled/disabled set for the "Data & Backups" source picker
 * (data-handling-nav2-tasks.md REQ-A4). Same simple localStorage-preference
 * pattern as useTheme.js — a plain id->bool map, keyed by data source id so
 * adding/removing an entry in dataSources.js doesn't strand old state.
 */
const STORAGE_KEY = 'amr-data-source-selection';

const ALL_IDS = dataSources.map((s) => s.id);

function defaults() {
  return Object.fromEntries(dataSources.map((s) => [s.id, s.defaultEnabled]));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    // Keep only known ids, backfill anything new from its shipped default —
    // a stored selection from an older build must not silently vanish or
    // silently gain sources the operator never opted into.
    const base = defaults();
    for (const id of ALL_IDS) {
      if (typeof saved[id] === 'boolean') base[id] = saved[id];
    }
    return base;
  } catch {
    return defaults();
  }
}

export default function useDataSourceSelection() {
  const [enabled, setEnabled] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    } catch {
      /* storage unavailable — selection stays in-memory only */
    }
  }, [enabled]);

  const toggle = useCallback((id) => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const selectAll = useCallback((category) => {
    setEnabled((prev) => {
      const next = { ...prev };
      for (const s of dataSources) {
        if (!category || s.category === category) next[s.id] = true;
      }
      return next;
    });
  }, []);

  const selectNone = useCallback((category) => {
    setEnabled((prev) => {
      const next = { ...prev };
      for (const s of dataSources) {
        if (!category || s.category === category) next[s.id] = false;
      }
      return next;
    });
  }, []);

  const applyRecommendedDefaults = useCallback(() => setEnabled(defaults()), []);

  const enabledSources = dataSources.filter((s) => enabled[s.id]);

  return {
    enabled,
    enabledSources,
    toggle,
    selectAll,
    selectNone,
    applyRecommendedDefaults,
  };
}
