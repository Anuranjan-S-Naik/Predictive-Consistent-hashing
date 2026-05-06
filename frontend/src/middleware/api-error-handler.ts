import type { AxiosError } from 'axios';
import { toast } from 'sonner';

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}

export function handleApiError(error: unknown): ApiError {
  const axiosErr = error as AxiosError<{ detail?: string }>;

  if (axiosErr.response) {
    const status = axiosErr.response.status;
    const detail = axiosErr.response.data?.detail || axiosErr.message;

    const messages: Record<number, string> = {
      400: 'Bad request — check your input',
      401: 'Unauthorized — invalid API key',
      403: 'Forbidden',
      404: 'Resource not found',
      408: 'Request timeout',
      429: 'Rate limit exceeded — slow down',
      500: 'Internal server error',
      502: 'Bad gateway — backend unavailable',
      503: 'Service unavailable — backend starting up',
    };

    const message = messages[status] || `Error ${status}`;

    toast.error(message, { description: detail, duration: 5000 });

    return { status, message, detail };
  }

  if (axiosErr.code === 'ECONNABORTED') {
    toast.error('Request timeout', { description: 'Backend did not respond in time' });
    return { status: 408, message: 'Request timeout' };
  }

  if (axiosErr.message === 'Network Error') {
    toast.error('Network error', { description: 'Cannot reach the backend server' });
    return { status: 0, message: 'Network error' };
  }

  toast.error('Unknown error', { description: String(error) });
  return { status: 0, message: 'Unknown error' };
}
