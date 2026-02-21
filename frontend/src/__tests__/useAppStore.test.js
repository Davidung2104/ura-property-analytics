import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

// Mock API module before importing store
vi.mock('../services/api', () => ({
  fetchDashboard: vi.fn(),
  refreshDashboard: vi.fn(),
  fetchFilteredDashboard: vi.fn(),
  fetchFilterOptions: vi.fn(),
  fetchProject: vi.fn(),
  loadUserData: vi.fn(),
  saveUserData: vi.fn(),
}));

import useAppStore from '../stores/useAppStore';
import * as api from '../services/api';

const MOCK_DASHBOARD = {
  totalTx: 5000,
  avgPsf: 1800,
  medPsf: 1650,
  projList: ['RIVIERE', 'MARINA ONE', 'PARC CLEMATIS'],
  projIndex: {
    'RIVIERE': { psf: 2200, dist: 'D03', seg: 'CCR', n: 150, yield: '2.8' },
    'MARINA ONE': { psf: 2500, dist: 'D01', seg: 'CCR', n: 300, yield: '2.5' },
    'PARC CLEMATIS': { psf: 1500, dist: 'D05', seg: 'RCR', n: 200, yield: '3.2' },
  },
  cmpPool: [
    { name: 'RIVIERE', psf: 2200, dist: 'D03', street: 'JIAK KIM ST', segment: 'CCR' },
    { name: 'MARINA ONE', psf: 2500, dist: 'D01', street: 'MARINA WAY', segment: 'CCR' },
  ],
  lastUpdated: '2025-01-01',
  segCounts: { CCR: 1500, RCR: 2000, OCR: 1500 },
};

const MOCK_PROJECT = {
  projInfo: { name: 'RIVIERE', district: 'D03', segment: 'CCR', avgPsf: 2200, totalTx: 150 },
  txs: [
    { year: '2024', psf: 2300, area: 800, beds: '2', saleType: 'New Sale', tenure: '99-year', floorMid: 15 },
    { year: '2023', psf: 2100, area: 800, beds: '2', saleType: 'Resale', tenure: '99-year', floorMid: 10 },
  ],
  nearbyProjects: [
    { name: 'MARTIN MODERN', rel: 'street' },
    { name: 'RIVER VALLEY PT', rel: 'district' },
  ],
};

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      mktData: null, unfilteredData: null, filterOpts: {},
      filters: { district: 'all', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' },
      filtering: false, projList: [], projIndex: {}, cmpPool: [],
      loading: true, refreshing: false, error: null,
      proj: '', projData: null, projLoading: false, cmpSelected: [],
      portfolio: [], savedSearches: [], clientReports: [], syncStatus: 'idle',
    });
    vi.clearAllMocks();
  });

  describe('bootstrap', () => {
    it('loads dashboard data and sets all state', async () => {
      api.fetchDashboard.mockResolvedValue(MOCK_DASHBOARD);
      api.fetchFilterOptions.mockResolvedValue({ districts: ['D01', 'D03'] });
      api.loadUserData.mockResolvedValue({ portfolio: [], savedSearches: [], clientReports: [] });
      api.fetchProject.mockResolvedValue(MOCK_PROJECT);

      await act(async () => { await useAppStore.getState().bootstrap(); });

      const state = useAppStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.mktData.totalTx).toBe(5000);
      expect(state.projList).toEqual(['RIVIERE', 'MARINA ONE', 'PARC CLEMATIS']);
      expect(state.projIndex['RIVIERE'].psf).toBe(2200);
      expect(state.cmpPool).toHaveLength(2);
    });

    it('handles API failure gracefully', async () => {
      api.fetchDashboard.mockRejectedValue(new Error('Network error'));

      await act(async () => { await useAppStore.getState().bootstrap(); });

      const state = useAppStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
      expect(state.mktData).toBeNull();
    });

    it('handles empty data gracefully', async () => {
      api.fetchDashboard.mockResolvedValue({ totalTx: 0 });

      await act(async () => { await useAppStore.getState().bootstrap(); });

      const state = useAppStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBe('No data received');
    });
  });

  describe('filters', () => {
    it('updates filter and triggers API call', async () => {
      useAppStore.setState({
        mktData: MOCK_DASHBOARD, unfilteredData: MOCK_DASHBOARD, loading: false,
      });
      const filteredData = { ...MOCK_DASHBOARD, totalTx: 1500 };
      api.fetchFilteredDashboard.mockResolvedValue(filteredData);

      await act(async () => { await useAppStore.getState().updateFilter('district', 'D03'); });

      expect(api.fetchFilteredDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ district: 'D03' })
      );
      expect(useAppStore.getState().mktData.totalTx).toBe(1500);
    });

    it('resets to unfiltered data when all filters are "all"', async () => {
      useAppStore.setState({
        mktData: { totalTx: 1500 },
        unfilteredData: MOCK_DASHBOARD,
        filters: { district: 'D03', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' },
        loading: false,
      });

      await act(async () => { await useAppStore.getState().updateFilter('district', 'all'); });

      expect(api.fetchFilteredDashboard).not.toHaveBeenCalled();
      expect(useAppStore.getState().mktData.totalTx).toBe(5000);
    });

    it('resetFilters restores unfiltered state', () => {
      useAppStore.setState({
        mktData: { totalTx: 100 },
        unfilteredData: MOCK_DASHBOARD,
        filters: { district: 'D03', year: '2024', segment: 'CCR', propertyType: 'all', tenure: 'all' },
      });

      useAppStore.getState().resetFilters();

      const state = useAppStore.getState();
      expect(state.filters.district).toBe('all');
      expect(state.filters.year).toBe('all');
      expect(state.filters.segment).toBe('all');
      expect(state.mktData.totalTx).toBe(5000);
    });
  });

  describe('selectProject', () => {
    it('loads project data and auto-selects comparisons', async () => {
      useAppStore.setState({ cmpPool: MOCK_DASHBOARD.cmpPool, loading: false });
      api.fetchProject.mockResolvedValue(MOCK_PROJECT);

      await act(async () => { await useAppStore.getState().selectProject('RIVIERE'); });

      const state = useAppStore.getState();
      expect(state.proj).toBe('RIVIERE');
      expect(state.projData.projInfo.name).toBe('RIVIERE');
      expect(state.projLoading).toBe(false);
      expect(state.cmpSelected).toContain('RIVIERE');
      expect(state.cmpSelected).toContain('MARTIN MODERN');
    });

    it('clears project on empty name', async () => {
      useAppStore.setState({ proj: 'RIVIERE', projData: MOCK_PROJECT });

      await act(async () => { await useAppStore.getState().selectProject(''); });

      expect(useAppStore.getState().proj).toBe('');
      expect(useAppStore.getState().projData).toBeNull();
    });

    it('handles project load failure', async () => {
      useAppStore.setState({ cmpPool: MOCK_DASHBOARD.cmpPool, loading: false });
      api.fetchProject.mockRejectedValue(new Error('Not found'));

      await act(async () => { await useAppStore.getState().selectProject('NONEXISTENT'); });

      const state = useAppStore.getState();
      expect(state.proj).toBe('NONEXISTENT');
      expect(state.projData).toBeNull();
      expect(state.projLoading).toBe(false);
    });
  });

  describe('user data', () => {
    it('saves and syncs portfolio', async () => {
      vi.useFakeTimers();
      api.saveUserData.mockResolvedValue({});

      useAppStore.getState().updatePortfolio([{ name: 'RIVIERE', units: 1 }]);

      expect(useAppStore.getState().portfolio).toHaveLength(1);
      expect(useAppStore.getState().syncStatus).toBe('saving');

      // Advance past debounce timer
      await vi.advanceTimersByTimeAsync(1500);

      expect(api.saveUserData).toHaveBeenCalledWith(
        expect.objectContaining({ portfolio: [{ name: 'RIVIERE', units: 1 }] })
      );
      vi.useRealTimers();
    });

    it('saves search with filters and tab', () => {
      vi.useFakeTimers();
      api.saveUserData.mockResolvedValue({});
      useAppStore.setState({ portfolio: [], clientReports: [] });

      useAppStore.getState().saveSearch('CCR Only', { district: 'all', year: 'all', segment: 'CCR', propertyType: 'all', tenure: 'all' }, 'sales');

      const ss = useAppStore.getState().savedSearches;
      expect(ss).toHaveLength(1);
      expect(ss[0].name).toBe('CCR Only');
      expect(ss[0].filters.segment).toBe('CCR');
      expect(ss[0].tab).toBe('sales');
      vi.useRealTimers();
    });

    it('deletes saved search by index', () => {
      vi.useFakeTimers();
      api.saveUserData.mockResolvedValue({});
      useAppStore.setState({
        savedSearches: [
          { name: 'A', filters: {}, tab: 'overview' },
          { name: 'B', filters: {}, tab: 'sales' },
        ],
        portfolio: [], clientReports: [],
      });

      useAppStore.getState().deleteSavedSearch(0);

      expect(useAppStore.getState().savedSearches).toHaveLength(1);
      expect(useAppStore.getState().savedSearches[0].name).toBe('B');
      vi.useRealTimers();
    });
  });

  describe('hasActiveFilters', () => {
    it('returns false when all filters are "all"', () => {
      expect(useAppStore.getState().hasActiveFilters).toBe(false);
    });

    it('returns true when any filter is set', () => {
      useAppStore.setState({
        filters: { district: 'D03', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' },
        hasActiveFilters: true,
      });
      expect(useAppStore.getState().hasActiveFilters).toBe(true);
    });
  });
});

// ═══ Additional edge case tests ═══

describe('useAppStore edge cases', () => {
  beforeEach(() => {
    useAppStore.setState({
      mktData: null, unfilteredData: null, filterOpts: {},
      filters: { district: 'all', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' },
      hasActiveFilters: false,
      projList: [], projIndex: {}, cmpPool: [],
      loading: true, refreshing: false, error: null,
      proj: '', projData: null, projLoading: false, cmpSelected: [],
      portfolio: [], savedSearches: [], clientReports: [], syncStatus: 'idle',
    });
  });

  describe('selectProject', () => {
    it('clears project when empty name given', async () => {
      useAppStore.setState({ proj: 'RIVIERE', projData: { projInfo: {} } });
      await useAppStore.getState().selectProject('');
      expect(useAppStore.getState().proj).toBe('');
      expect(useAppStore.getState().projData).toBeNull();
    });

    it('sets projLoading during fetch', async () => {
      let resolveProject;
      api.fetchProject.mockReturnValue(new Promise(r => { resolveProject = r; }));
      const promise = useAppStore.getState().selectProject('TEST');
      expect(useAppStore.getState().projLoading).toBe(true);
      resolveProject({ projInfo: { name: 'TEST' }, txs: [] });
      await promise;
      expect(useAppStore.getState().projLoading).toBe(false);
    });
  });

  describe('savedSearches', () => {
    it('adds and deletes saved searches', () => {
      const filters = { district: 'D03', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' };
      useAppStore.getState().saveSearch('Test Search', filters, 'overview');
      expect(useAppStore.getState().savedSearches).toHaveLength(1);
      expect(useAppStore.getState().savedSearches[0].name).toBe('Test Search');

      useAppStore.getState().deleteSavedSearch(0);
      expect(useAppStore.getState().savedSearches).toHaveLength(0);
    });
  });

  describe('portfolio', () => {
    it('updates portfolio and triggers sync', () => {
      const portfolio = [{ name: 'RIVIERE', addedAt: '2025-01-01' }];
      useAppStore.getState().updatePortfolio(portfolio);
      expect(useAppStore.getState().portfolio).toEqual(portfolio);
      expect(useAppStore.getState().syncStatus).toBe('saving');
    });
  });

  describe('resetFilters', () => {
    it('restores unfiltered data', () => {
      const original = { totalTx: 5000, projList: ['A', 'B'], projIndex: {}, cmpPool: [] };
      useAppStore.setState({
        unfilteredData: original,
        mktData: { totalTx: 100, projList: ['A'], projIndex: {}, cmpPool: [] },
        filters: { district: 'D03', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' },
        hasActiveFilters: true,
      });
      useAppStore.getState().resetFilters();
      expect(useAppStore.getState().mktData).toEqual(original);
      expect(useAppStore.getState().hasActiveFilters).toBe(false);
      expect(useAppStore.getState().filters.district).toBe('all');
    });
  });
});
