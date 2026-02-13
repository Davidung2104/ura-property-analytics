const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchJSON(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.success && json.error) throw new Error(json.error);
  return json.data || json;
}

export const fetchTransactions = () => fetchJSON('/api/transactions');
export const fetchDistrictSummary = () => fetchJSON('/api/districts/summary');
export const fetchPropertyTypes = () => fetchJSON('/api/property-types/summary');
export const fetchStats = () => fetchJSON('/api/stats');
export const searchProjects = (q) => fetchJSON(`/api/projects/search?q=${encodeURIComponent(q)}`);

export async function fetchRental() {
  try { return await fetchJSON('/api/rental/transactions'); }
  catch { return null; }
}

export async function fetchAll() {
  const [tx, dist, types, stats, rental] = await Promise.allSettled([
    fetchTransactions(), fetchDistrictSummary(), fetchPropertyTypes(), fetchStats(), fetchRental()
  ]);
  return {
    transactions: tx.status==='fulfilled' ? tx.value : [],
    districts: dist.status==='fulfilled' ? dist.value : [],
    propertyTypes: types.status==='fulfilled' ? types.value : [],
    stats: stats.status==='fulfilled' ? stats.value : null,
    rental: rental.status==='fulfilled' ? rental.value : null,
    errors: [tx,dist,types,stats,rental].filter(r=>r.status==='rejected').map(r=>r.reason?.message),
  };
}
