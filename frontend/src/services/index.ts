import { api } from './api-client';
import { API_BASE_URL } from '@/constants';

// --- Node & Metrics ---
export const nodeService = {
  listNodes: () => api.get('/api/v1/nodes').then(r => r.data),
  getNodeMetrics: (id: string) => api.get(`/api/v1/nodes/${id}`).then(r => r.data),
};

// --- Routing & Ring ---
export const routingService = {
  submitRequest: (payload: Record<string, unknown>) =>
    api.post('/api/v1/request', payload).then(r => r.data),
  getRing: () => api.get('/api/v1/ring').then(r => r.data),
};

// --- DAA & Feedback ---
export const systemService = {
  daaStatus: () => api.get('/api/v1/daa').then(r => r.data),
  feedbackStatus: () => api.get('/api/v1/feedback').then(r => r.data),
  datastoreHealth: () => api.get('/api/v1/datastores').then(r => r.data),
};

// --- Health ---
export const healthService = {
  check: () => fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) })
    .then(r => r.ok ? r.json() : Promise.reject('unhealthy'))
    .catch(() => null),
};
