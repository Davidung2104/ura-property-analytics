const API = import.meta.env.VITE_API_URL || '';

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

/**
 * fetchDashboard — loads the static snapshot file first (instant, works for ALL users).
 * Falls back to API call if snapshot doesn't exist yet (first deploy).
 * Retries on cold start since server may still be loading URA data.
 */
export async function fetchDashboard() {
  // 1. Try static snapshot (instant — served like any other static file)
  try {
    const res = await fetch('/snapshot.json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.totalTx) return data;
    }
  } catch {}

  // 2. Fallback to API with retry (cold start: server may still be loading)
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 5000)); // Wait 5s between retries
      return await get('/api/dashboard');
    } catch (err) {
      lastError = err;
      console.warn(`Dashboard fetch attempt ${attempt + 1} failed:`, err.message);
    }
  }
  throw lastError || new Error('Failed to load dashboard data');
}

/**
 * Force-fetch fresh dashboard from server (bypasses snapshot)
 */
export async function refreshDashboard() {
  return await get('/api/dashboard');
}

/**
 * Fetch dashboard data with filters applied.
 * Runs on server's in-memory data — fast (~50ms), no URA API calls.
 */
export async function fetchFilteredDashboard(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v && v !== 'all') params.set(k, v);
  });
  const qs = params.toString();
  // No filters = use snapshot for instant load
  if (!qs) return await fetchDashboard();
  return await get(`/api/dashboard/filtered?${qs}`);
}

/**
 * Fetch available filter options (districts, years, segments, etc.)
 */
export async function fetchFilterOptions() {
  return await get('/api/filters');
}

/**
 * Force backend to re-fetch from URA API, then get fresh data
 */
export async function forceRefreshFromURA() {
  await fetch(`${API}/api/refresh`, { method: 'POST' });
  return await get('/api/dashboard');
}

export async function fetchProject(name) {
  return await get(`/api/project/${encodeURIComponent(name)}`);
}

// Paginated search (always live)
export function searchSales({ q, district, segment, type, tenure, page, limit, sort } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (district) params.set('district', district);
  if (segment) params.set('segment', segment);
  if (type) params.set('type', type);
  if (tenure) params.set('tenure', tenure);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  if (sort) params.set('sort', sort);
  return get(`/api/sales/search?${params}`);
}

export function searchRental({ q, district, segment, bedrooms, areaSqft, page, limit, sort } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (district) params.set('district', district);
  if (segment) params.set('segment', segment);
  if (bedrooms) params.set('bedrooms', bedrooms);
  if (areaSqft) params.set('areaSqft', areaSqft);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  if (sort) params.set('sort', sort);
  return get(`/api/rental/search?${params}`);
}

// fetchFilterOptions already exported above — no duplicate needed

// ═══ User data (portfolio + saved searches) ═══

/** Get or create a stable user ID */
export function getUserId() {
  let id = localStorage.getItem('sg_user_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `u-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('sg_user_id', id);
  }
  return id;
}

/** Load user data from server */
export async function loadUserData() {
  try {
    return await get(`/api/user/${getUserId()}`);
  } catch {
    return { portfolio: [], savedSearches: [] };
  }
}

/** Save user data to server */
export async function saveUserData(data) {
  const res = await fetch(`${API}/api/user/${getUserId()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}
