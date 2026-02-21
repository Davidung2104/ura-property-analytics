/**
 * useMarketStore.js — Zustand store for market dashboard state
 * Replaces 15+ useState calls and deep prop-drilling in Dashboard.jsx
 */
import { create } from 'zustand';
import {
  fetchDashboard, refreshDashboard, fetchFilteredDashboard,
  fetchFilterOptions,
} from '../services/api';

const INIT_FILTERS = { district: 'all', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' };

const useMarketStore = create((set, get) => ({
  // ── Data ──
  mktData: null,
  unfilteredData: null,
  filterOpts: {},

  // ── UI ──
  loading: true,
  refreshing: false,
  filtering: false,
  error: null,

  // ── Filters ──
  filters: { ...INIT_FILTERS },
  hasActiveFilters: false,

  // ── Actions ──

  /** Initial load — fetches dashboard + filter options */
  loadDashboard: async () => {
    set({ loading: true, error: null });
    try {
      const [data, opts] = await Promise.all([
        fetchDashboard(),
        fetchFilterOptions().catch(() => ({})),
      ]);
      set({
        mktData: data,
        unfilteredData: data,
        filterOpts: opts || {},
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message || 'Failed to load dashboard', loading: false });
      throw err;
    }
  },

  /** Force refresh from URA API */
  refresh: async () => {
    set({ refreshing: true });
    try {
      await refreshDashboard();
      const data = await fetchDashboard();
      set({
        mktData: data,
        unfilteredData: data,
        refreshing: false,
      });
    } catch (err) {
      set({ refreshing: false });
      throw err;
    }
  },

  /** Apply dashboard filters */
  setFilter: (key, value) => {
    const filters = { ...get().filters, [key]: value };
    const hasActive = Object.values(filters).some(v => v !== 'all');
    set({ filters, hasActiveFilters: hasActive });
  },

  /** Apply all filters and fetch filtered data */
  applyFilters: async () => {
    const { filters, unfilteredData } = get();
    const hasActive = Object.values(filters).some(v => v !== 'all');
    if (!hasActive) {
      set({ mktData: unfilteredData, filtering: false });
      return;
    }
    set({ filtering: true });
    try {
      const data = await fetchFilteredDashboard(filters);
      set({ mktData: data, filtering: false });
    } catch {
      set({ mktData: unfilteredData, filtering: false });
    }
  },

  /** Reset all filters */
  resetFilters: () => {
    const { unfilteredData } = get();
    set({
      filters: { ...INIT_FILTERS },
      hasActiveFilters: false,
      mktData: unfilteredData,
      filtering: false,
    });
  },
}));

export default useMarketStore;
