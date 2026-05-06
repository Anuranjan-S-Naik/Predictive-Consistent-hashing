import axios from 'axios';
import { API_BASE_URL, API_KEY } from '@/constants';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const msg = error.response?.data?.detail || error.message || 'Unknown error';
    console.error(`[API] ${error.config?.method?.toUpperCase()} ${error.config?.url}: ${msg}`);
    return Promise.reject(error);
  }
);
