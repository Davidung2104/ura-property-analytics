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
