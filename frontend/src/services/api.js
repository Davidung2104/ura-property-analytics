const API = import.meta.env.VITE_API_URL || '';

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json.data;
}

export const fetchDashboard = () => get('/api/dashboard');
export const fetchProject = (name) => get(`/api/project/${encodeURIComponent(name)}`);

// Paginated search
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

export function searchRental({ q, district, segment, bed, page, limit, sort } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (district) params.set('district', district);
  if (segment) params.set('segment', segment);
  if (bed) params.set('bed', bed);
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  if (sort) params.set('sort', sort);
  return get(`/api/rental/search?${params}`);
}

export const fetchFilters = () => get('/api/filters');
