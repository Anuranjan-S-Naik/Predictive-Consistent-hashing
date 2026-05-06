'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useWsStore } from '@/stores';
import { connectSocket, disconnectSocket, subscribeToEvent, type WsEvent } from '@/websocket/socket';

/**
 * Hook: Auto-refreshing query with configurable interval
 */
export function usePollingQuery<T>(
  key: string[],
  fetcher: () => Promise<T>,
  interval: number,
  options?: Partial<UseQueryOptions<T>>
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: fetcher,
    refetchInterval: interval,
    ...options,
  });
}

/**
 * Hook: WebSocket connection lifecycle
 */
export function useWebSocket() {
  const setConnected = useWsStore((s) => s.setConnected);
  const setPing = useWsStore((s) => s.setPing);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('connect', () => {
      setConnected(true);
      console.log('[WS] Connected');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('[WS] Disconnected');
    });

    socket.on('pong', () => {
      setPing(Date.now());
    });

    return () => {
      disconnectSocket();
      setConnected(false);
    };
  }, [setConnected, setPing]);
}

/**
 * Hook: Subscribe to a WebSocket event
 */
export function useWsEvent<T>(event: WsEvent, handler: (data: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = subscribeToEvent<T>(event, (data) => handlerRef.current(data));
    return unsub;
  }, [event]);
}

/**
 * Hook: Debounced callback
 */
export function useDebounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timeoutRef = useRef<NodeJS.Timeout>();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delay);
    }) as T,
    [delay]
  );
}
