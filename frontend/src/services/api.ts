import type { MarketData, FilterOptions, ProjectData, Filters, UserData, SearchResults, Transaction, RentalTransaction } from '../types';

const API = import.meta.env.VITE_API_URL || '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data as T;
}

/**
 * fetchDashboard — loads the static snapshot file first (instant, works for ALL users).
 * Falls back to API call if snapshot doesn't exist yet (first deploy).
 * Retries on cold start since server may still be loading URA data.
 */
export async function fetchDashboard(): Promise<MarketData> {
  // 1. Try static snapshot (instant — served like any other static file)
  try {
    const res = await fetch('/snapshot.json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.totalTx) return data as MarketData;
    }
  } catch { /* snapshot unavailable, fall through */ }

  // 2. Fallback to API with retry (cold start: server may still be loading)
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 5000));
      return await get<MarketData>('/api/v1/dashboard');
    } catch (err) {
      lastError = err as Error;
      console.warn(`Dashboard fetch attempt ${attempt + 1} failed:`, lastError.message);
    }
  }
  throw lastError || new Error('Failed to load dashboard data');
}

export async function refreshDashboard(): Promise<MarketData> {
  return await get<MarketData>('/api/v1/dashboard');
}

export async function fetchFilteredDashboard(filters: Partial<Filters> = {}): Promise<MarketData> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== 'all') params.set(k, v);
  });
  const qs = params.toString();
  if (!qs) return await fetchDashboard();
  return await get<MarketData>(`/api/v1/dashboard/filtered?${qs}`);
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  return await get<FilterOptions>('/api/v1/filters');
}

export async function fetchProject(name: string): Promise<ProjectData> {
  return await get<ProjectData>(`/api/v1/project/${encodeURIComponent(name)}`);
}

// Paginated search (always live)
export function searchSales(params: {
  q?: string; district?: string; segment?: string; type?: string; tenure?: string;
  page?: number; limit?: number; sort?: string;
} = {}): Promise<SearchResults<Transaction>> {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null) sp.set(k, String(v)); });
  return get<SearchResults<Transaction>>(`/api/v1/sales/search?${sp}`);
}

export function searchRental(params: {
  q?: string; district?: string; segment?: string; bedrooms?: string; areaSqft?: string;
  page?: number; limit?: number; sort?: string;
} = {}): Promise<SearchResults<RentalTransaction>> {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null) sp.set(k, String(v)); });
  return get<SearchResults<RentalTransaction>>(`/api/v1/rental/search?${sp}`);
}

// ═══ User data (portfolio + saved searches) ═══

export function getUserId(): string {
  let id = localStorage.getItem('sg_user_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `u-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('sg_user_id', id);
  }
  return id;
}

export async function loadUserData(): Promise<UserData> {
  try {
    return await get<UserData>(`/api/v1/user/${getUserId()}`);
  } catch {
    return { portfolio: [], savedSearches: [], clientReports: [] };
  }
}

export async function saveUserData(data: Partial<UserData>): Promise<UserData> {
  const res = await fetch(`${API}/api/v1/user/${getUserId()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  const json = await res.json();
  return json.data as UserData;
}
