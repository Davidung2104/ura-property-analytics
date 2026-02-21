/**
 * useProjectStore.js — Zustand store for project analysis + user data
 * Replaces 20+ useState calls and deep prop-drilling in Dashboard.jsx
 */
import { create } from 'zustand';
import { fetchProject, loadUserData, saveUserData } from '../services/api';

const USER_ID = 'default';

const useProjectStore = create((set, get) => ({
  // ── Project ──
  proj: '',
  projData: null,
  projLoading: false,

  // ── Comparison ──
  cmpSelected: [],
  cmpPool: [],

  // ── Project browser ──
  projList: [],
  projIndex: {},
  projFilters: { district: 'all', segment: 'all', type: 'all' },

  // ── User data ──
  portfolio: [],
  savedSearches: [],
  clientReports: [],
  syncStatus: 'idle', // idle | saving | saved | error

  // ── Computed ──
  get filteredProjList() {
    const { projList, projIndex, projFilters } = get();
    const { district, segment, type } = projFilters;
    if (district === 'all' && segment === 'all' && type === 'all') return projList;
    return projList.filter(name => {
      const p = projIndex[name];
      if (!p) return false;
      if (district !== 'all' && p.dist !== district) return false;
      if (segment !== 'all' && p.seg !== segment) return false;
      if (type !== 'all' && p.type !== type) return false;
      return true;
    });
  },

  get projFilterOpts() {
    const entries = Object.values(get().projIndex);
    return {
      districts: [...new Set(entries.map(p => p.dist))].sort((a, b) => (parseInt(a.replace('D', '')) || 0) - (parseInt(b.replace('D', '')) || 0)),
      segments: [...new Set(entries.map(p => p.seg))].filter(Boolean).sort(),
      types: [...new Set(entries.map(p => p.type))].filter(Boolean).sort(),
    };
  },

  // ── Actions ──

  /** Set project list and index from dashboard data */
  setProjectMeta: (projList, projIndex, cmpPool) => {
    set({ projList: projList || [], projIndex: projIndex || {}, cmpPool: cmpPool || [] });
  },

  /** Load a specific project */
  selectProject: async (name) => {
    if (!name) {
      set({ proj: '', projData: null });
      return;
    }
    set({ proj: name, projLoading: true, projData: null });
    try {
      const data = await fetchProject(name);
      set({ projData: data, projLoading: false });
    } catch (err) {
      console.error('Project load failed:', err);
      set({ projLoading: false });
    }
  },

  /** Update project browser filters */
  setProjFilter: (key, value) => {
    set(state => ({ projFilters: { ...state.projFilters, [key]: value } }));
  },

  /** Comparison selection */
  setCmpSelected: (selected) => set({ cmpSelected: selected }),
  toggleCmp: (name) => {
    const { cmpSelected } = get();
    if (cmpSelected.includes(name)) {
      set({ cmpSelected: cmpSelected.filter(n => n !== name) });
    } else if (cmpSelected.length < 5) {
      set({ cmpSelected: [...cmpSelected, name] });
    }
  },

  // ── User data persistence ──

  /** Load user data from server */
  loadUserData: async () => {
    try {
      const data = await loadUserData(USER_ID);
      if (data) {
        set({
          portfolio: data.portfolio || [],
          savedSearches: data.savedSearches || [],
          clientReports: data.clientReports || [],
        });
      }
    } catch (err) {
      console.warn('Failed to load user data:', err.message);
      // Fall back to localStorage
      try {
        set({
          portfolio: JSON.parse(localStorage.getItem('sg_portfolio') || '[]'),
          savedSearches: JSON.parse(localStorage.getItem('sg_saved_searches') || '[]'),
          clientReports: JSON.parse(localStorage.getItem('sg_client_reports') || '[]'),
        });
      } catch { /* ignore */ }
    }
  },

  /** Persist user data to server + localStorage */
  _sync: async () => {
    const { portfolio, savedSearches, clientReports } = get();
    const data = { portfolio, savedSearches, clientReports };
    // localStorage first (sync, fast)
    try {
      localStorage.setItem('sg_portfolio', JSON.stringify(portfolio));
      localStorage.setItem('sg_saved_searches', JSON.stringify(savedSearches));
      localStorage.setItem('sg_client_reports', JSON.stringify(clientReports));
    } catch { /* ignore */ }
    // Server (async, resilient)
    set({ syncStatus: 'saving' });
    try {
      await saveUserData(USER_ID, data);
      set({ syncStatus: 'saved' });
      setTimeout(() => { if (get().syncStatus === 'saved') set({ syncStatus: 'idle' }); }, 2000);
    } catch {
      set({ syncStatus: 'error' });
    }
  },

  setPortfolio: (portfolio) => { set({ portfolio }); get()._sync(); },
  setSavedSearches: (savedSearches) => { set({ savedSearches }); get()._sync(); },
  setClientReports: (clientReports) => { set({ clientReports }); get()._sync(); },

  addSavedSearch: (name, filters) => {
    const search = { id: Date.now().toString(36), name, filters, createdAt: new Date().toISOString() };
    const { savedSearches } = get();
    set({ savedSearches: [search, ...savedSearches].slice(0, 20) });
    get()._sync();
  },

  removeSavedSearch: (id) => {
    set(state => ({ savedSearches: state.savedSearches.filter(s => s.id !== id) }));
    get()._sync();
  },
}));

export default useProjectStore;
