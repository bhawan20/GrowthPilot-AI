const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.message || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const query = (path, workspaceId) => `${path}?workspaceId=${encodeURIComponent(workspaceId)}`;
