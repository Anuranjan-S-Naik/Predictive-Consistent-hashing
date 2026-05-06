import { io, Socket } from 'socket.io-client';
import { WS_URL } from '@/constants';

export type WsEvent =
  | 'node_metrics'
  | 'request_flow'
  | 'forecasts'
  | 'alerts'
  | 'benchmark_progress'
  | 'queue_updates'
  | 'simulation_status';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function subscribeToEvent<T>(event: WsEvent, handler: (data: T) => void): () => void {
  const s = getSocket();
  s.on(event, handler);
  return () => { s.off(event, handler); };
}
