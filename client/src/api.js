async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),
  components: () => req('/api/components'),
  createComponent: (body) => req('/api/components', { method: 'POST', body }),
  updateComponent: (id, body) => req(`/api/components/${id}`, { method: 'PUT', body }),
  deleteComponent: (id) => req(`/api/components/${id}`, { method: 'DELETE' }),
  incidents: () => req('/api/incidents'),
  createIncident: (body) => req('/api/incidents', { method: 'POST', body }),
  postUpdate: (id, body) => req(`/api/incidents/${id}/updates`, { method: 'POST', body }),
  deleteIncident: (id) => req(`/api/incidents/${id}`, { method: 'DELETE' }),
  maintenance: () => req('/api/maintenance'),
  createMaintenance: (body) => req('/api/maintenance', { method: 'POST', body }),
  deleteMaintenance: (id) => req(`/api/maintenance/${id}`, { method: 'DELETE' }),
  subscribers: () => req('/api/subscribers'),
  deleteSubscriber: (id) => req(`/api/subscribers/${id}`, { method: 'DELETE' }),
  settings: () => req('/api/settings'),
  saveSettings: (body) => req('/api/settings', { method: 'PUT', body }),
  testEmail: (to) => req('/api/settings/test-email', { method: 'POST', body: { to } })
};

export function timeAgo(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
