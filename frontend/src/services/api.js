// API Service - Connects to Railway Backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Fetch wrapper with error handling
async function fetchAPI(endpoint) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    throw error;
  }
}

// Get all transactions with optional filters
export async function getTransactions(filters = {}) {
  const params = new URLSearchParams();
  if (filters.district) params.append('district', filters.district);
  if (filters.propertyType) params.append('propertyType', filters.propertyType);
  if (filters.year) params.append('year', filters.year);
  if (filters.project) params.append('project', filters.project);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchAPI(`/api/transactions${query}`);
  return data.data || [];
}

// Get district summary
export async function getDistrictSummary() {
  const data = await fetchAPI('/api/districts/summary');
  return data.data || [];
}

// Get property type summary
export async function getPropertyTypeSummary() {
  const data = await fetchAPI('/api/property-types/summary');
  return data.data || [];
}

// Search projects
export async function searchProjects(query = '', filters = {}) {
  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (filters.district) params.append('district', filters.district);
  if (filters.propertyType) params.append('propertyType', filters.propertyType);
  
  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const data = await fetchAPI(`/api/projects/search${queryStr}`);
  return data.data || [];
}

// Get filter options
export async function getFilterOptions() {
  const data = await fetchAPI('/api/filters');
  return data.data || { districts: [], propertyTypes: [], years: [] };
}

// Get stats
export async function getStats() {
  const data = await fetchAPI('/api/stats');
  return data.data || {};
}

// Health check
export async function healthCheck() {
  const data = await fetchAPI('/health');
  return data;
}
