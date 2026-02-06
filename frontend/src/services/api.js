// Use environment variable in production, fallback to proxy in development
const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

async function fetchApi(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}

export async function getDistrictSummary() {
  const result = await fetchApi('/districts/summary');
  return result.data;
}

export async function getPropertyTypeSummary() {
  const result = await fetchApi('/property-types/summary');
  return result.data;
}

export async function searchProjects(query = '', filters = {}) {
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (filters.district) params.append('district', filters.district);
  if (filters.propertyType) params.append('propertyType', filters.propertyType);
  if (filters.minPrice) params.append('minPrice', filters.minPrice);
  if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
  
  const result = await fetchApi(`/projects/search?${params.toString()}`);
  return result.data;
}

export async function getFilterOptions() {
  const result = await fetchApi('/filters');
  return result.data;
}

export async function getTransactions(filters = {}) {
  const params = new URLSearchParams();
  if (filters.district) params.append('district', filters.district);
  if (filters.propertyType) params.append('propertyType', filters.propertyType);
  
  const result = await fetchApi(`/transactions?${params.toString()}`);
  return result.data;
}
