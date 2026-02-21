/**
 * useAppStore.ts — Unified Zustand store for all app state
 * Replaces 30+ useState calls and eliminates prop-drilling
 */
import { create } from 'zustand';
import type { AppState, MarketData, Filters, ProjectData, CompProject, SavedSearch } from '../types';
import {
  fetchDashboard, refreshDashboard, fetchFilteredDashboard,
  fetchFilterOptions, fetchProject, loadUserData, saveUserData,
} from '../services/api';

const INIT_FILTERS: Filters = { district: 'all', year: 'all', segment: 'all', propertyType: 'all', tenure: 'all' };

interface AppActions {
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  updateFilter: (key: keyof Filters, value: string) => Promise<void>;
  resetFilters: () => void;
  selectProject: (name: string) => Promise<void>;
  setCmpSelected: (selected: string[]) => void;
  updatePortfolio: (p: AppState['portfolio']) => void;
  updateClientReports: (r: AppState['clientReports']) => void;
  saveSearch: (name: string, filters: Filters, tab: string) => void;
  applySavedSearch: (saved: SavedSearch) => Promise<string>;
  deleteSavedSearch: (idx: number) => void;
  _autoSelectComps: (name: string, data: ProjectData | null, cmpPool: CompProject[]) => void;
  _loadUserData: () => Promise<void>;
  _syncToServer: () => void;
  _syncTimer: ReturnType<typeof setTimeout> | null;
}

type Store = AppState & AppActions;

const useAppStore = create<Store>((set, get) => ({
  // ═══ MARKET STATE ═══
  mktData: null,
  unfilteredData: null,
  filterOpts: {},
  filters: { ...INIT_FILTERS },
  filtering: false,
  hasActiveFilters: false,

  // ═══ SHARED DATA ═══
  projList: [],
  projIndex: {},
  cmpPool: [],
  loading: true,
  refreshing: false,
  error: null,

  // ═══ PROJECT STATE ═══
  proj: '',
  projData: null,
  projLoading: false,
  cmpSelected: [],

  // ═══ USER DATA ═══
  portfolio: [],
  savedSearches: [],
  clientReports: [],
  syncStatus: 'idle',

  // ═══ ACTIONS: MARKET ═══

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchDashboard();
      if (!data?.totalTx) { set({ error: 'No data received', loading: false }); return; }

      set({
        mktData: data,
        unfilteredData: data,
        projList: data.projList || [],
        projIndex: data.projIndex || {},
        cmpPool: data.cmpPool || [],
        loading: false,
      });

      // Load filter options and user data in parallel (non-blocking)
      Promise.all([
        fetchFilterOptions().then(opts => { if (opts) set({ filterOpts: opts }); }).catch(() => {}),
        get()._loadUserData(),
      ]);

      // Auto-select first project for initial data
      if (data.cmpPool?.length > 0) {
        const first = data.cmpPool[0].name;
        set({ proj: first });
        try {
          const pd = await fetchProject(first);
          set({ projData: pd });
          get()._autoSelectComps(first, pd, data.cmpPool);
        } catch { /* ignore */ }
      }
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  refresh: async () => {
    set({ refreshing: true, error: null });
    try {
      const data = await refreshDashboard();
      if (!data?.totalTx) { set({ error: 'No data received', refreshing: false }); return; }
      set({
        mktData: data, unfilteredData: data,
        projList: data.projList || [], projIndex: data.projIndex || {}, cmpPool: data.cmpPool || [],
        filters: { ...INIT_FILTERS }, hasActiveFilters: false, refreshing: false,
      });
      const { proj } = get();
      if (proj) try { set({ projData: await fetchProject(proj) }); } catch { /* ignore */ }
    } catch (err) { set({ error: (err as Error).message, refreshing: false }); }
  },

  updateFilter: async (key, value) => {
    const next = { ...get().filters, [key]: value } as Filters;
    const active = Object.values(next).some(v => v !== 'all');
    set({ filters: next, hasActiveFilters: active });
    if (!active) {
      set({ mktData: get().unfilteredData });
      return;
    }
    set({ filtering: true });
    try {
      const data = await fetchFilteredDashboard(next);
      if (data?.totalTx) {
        set({
          mktData: data, projList: data.projList || [],
          projIndex: data.projIndex || {}, cmpPool: data.cmpPool || [],
        });
      }
    } catch (err) { console.warn('Filter failed:', (err as Error).message); }
    set({ filtering: false });
  },

  resetFilters: () => {
    const { unfilteredData } = get();
    set({
      filters: { ...INIT_FILTERS }, hasActiveFilters: false,
      mktData: unfilteredData,
      projList: unfilteredData?.projList || [],
      projIndex: unfilteredData?.projIndex || {},
      cmpPool: unfilteredData?.cmpPool || [],
    });
  },

  // ═══ ACTIONS: PROJECT ═══

  selectProject: async (name) => {
    if (!name) { set({ proj: '', projData: null }); return; }
    set({ proj: name, projData: null, projLoading: true });
    try {
      const data = await fetchProject(name);
      set({ projData: data, projLoading: false });
      get()._autoSelectComps(name, data, get().cmpPool);
    } catch {
      set({ projData: null, projLoading: false });
      set(s => ({ cmpSelected: [name, ...s.cmpSelected.filter(n => n !== name)].slice(0, 8) }));
    }
  },

  setCmpSelected: (selected) => set({ cmpSelected: selected }),

  _autoSelectComps: (name, data, cmpPool) => {
    if (data?.nearbyProjects?.length) {
      const street = data.nearbyProjects.filter(p => p.rel === 'street').slice(0, 3).map(p => p.name);
      const dist = data.nearbyProjects.filter(p => p.rel === 'district').slice(0, 4 - street.length).map(p => p.name);
      set({ cmpSelected: [name, ...street, ...dist].slice(0, 5) });
    } else if (cmpPool?.length) {
      const self = cmpPool.find(p => p.name === name);
      if (self) {
        const sameStreet = cmpPool.filter(p => p.street === self.street && p.name !== name).slice(0, 2).map(p => p.name);
        const sameDist = cmpPool.filter(p => p.dist === self.dist && p.name !== name && !sameStreet.includes(p.name)).slice(0, 3 - sameStreet.length).map(p => p.name);
        const other = cmpPool.filter(p => p.dist !== self.dist && p.name !== name).slice(0, 2).map(p => p.name);
        set({ cmpSelected: [name, ...sameStreet, ...sameDist, ...other].slice(0, 5) });
      } else {
        set(s => ({ cmpSelected: [name, ...s.cmpSelected.filter(n => n !== name)].slice(0, 8) }));
      }
    }
  },

  // ═══ ACTIONS: USER DATA ═══

  _loadUserData: async () => {
    try {
      const data = await loadUserData();
      if (data?.portfolio?.length) set({ portfolio: data.portfolio });
      if (data?.savedSearches?.length) set({ savedSearches: data.savedSearches });
      if (data?.clientReports?.length) set({ clientReports: data.clientReports });
    } catch { /* ignore */ }
  },

  _syncTimer: null,
  _syncToServer: () => {
    const { portfolio, savedSearches, clientReports, _syncTimer } = get();
    try {
      localStorage.setItem('sg_portfolio', JSON.stringify(portfolio));
      localStorage.setItem('sg_saved_searches', JSON.stringify(savedSearches));
      localStorage.setItem('sg_client_reports', JSON.stringify(clientReports));
    } catch { /* ignore */ }
    if (_syncTimer) clearTimeout(_syncTimer);
    set({ syncStatus: 'saving' });
    const timer = setTimeout(async () => {
      try {
        await saveUserData({ portfolio, savedSearches, clientReports });
        set({ syncStatus: 'saved' });
        setTimeout(() => { if (get().syncStatus === 'saved') set({ syncStatus: 'idle' }); }, 2000);
      } catch { set({ syncStatus: 'error' }); }
    }, 1000);
    set({ _syncTimer: timer });
  },

  updatePortfolio: (p) => { set({ portfolio: p }); get()._syncToServer(); },
  updateClientReports: (r) => { set({ clientReports: r }); get()._syncToServer(); },

  saveSearch: (name, filters, tab) => {
    const next = [...get().savedSearches, { name: name.trim(), filters: { ...filters }, tab, createdAt: new Date().toISOString() }];
    set({ savedSearches: next }); get()._syncToServer();
  },

  applySavedSearch: async (saved) => {
    const active = Object.values(saved.filters).some(v => v !== 'all');
    set({ filters: saved.filters, hasActiveFilters: active });
    if (!active) {
      set({ mktData: get().unfilteredData });
      return saved.tab;
    }
    set({ filtering: true });
    try {
      const data = await fetchFilteredDashboard(saved.filters);
      if (data?.totalTx) set({ mktData: data });
    } catch { /* ignore */ }
    set({ filtering: false });
    return saved.tab;
  },

  deleteSavedSearch: (idx) => {
    const next = get().savedSearches.filter((_, i) => i !== idx);
    set({ savedSearches: next }); get()._syncToServer();
  },
}));

export default useAppStore;
