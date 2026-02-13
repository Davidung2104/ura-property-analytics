const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchJSON(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  // Handle different response shapes:
  // Backend may return: {success:true, data:[...]} or raw URA: {Result:[...]} or just [...]
  if (json.data) return json.data;
  if (json.Result || json.result) return json.Result || json.result;
  if (Array.isArray(json)) return json;
  return json;
}

// Fetch all 4 batches of transactions
export async function fetchTransactions() {
  // Try fetching all batches in parallel
  const batches = [1, 2, 3, 4];
  const results = await Promise.allSettled(
    batches.map(b => fetchJSON(`/api/transactions?batch=${b}`))
  );

  // Combine all successful batches
  const all = [];
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      if (Array.isArray(r.value)) all.push(...r.value);
    }
  });

  // If batch param doesn't work, try without it
  if (all.length === 0) {
    const single = await fetchJSON('/api/transactions');
    if (Array.isArray(single)) return single;
    return single;
  }

  return all;
}

export const fetchDistrictSummary = () => fetchJSON('/api/districts/summary').catch(() => []);
export const fetchPropertyTypes = () => fetchJSON('/api/property-types/summary').catch(() => []);
export const fetchStats = () => fetchJSON('/api/stats').catch(() => null);
export const searchProjects = (q) => fetchJSON(`/api/projects/search?q=${encodeURIComponent(q)}`);

export async function fetchRental() {
  try { return await fetchJSON('/api/rental/transactions'); }
  catch { return null; }
}

export async function fetchAll() {
  const [transactions, stats, rental] = await Promise.allSettled([
    fetchTransactions(),
    fetchStats(),
    fetchRental(),
  ]);
  return {
    transactions: transactions.status==='fulfilled' ? transactions.value : [],
    stats: stats.status==='fulfilled' ? stats.value : null,
    rental: rental.status==='fulfilled' ? rental.value : null,
    errors: [transactions,stats,rental]
      .filter(r=>r.status==='rejected')
      .map(r=>r.reason?.message),
  };
}
