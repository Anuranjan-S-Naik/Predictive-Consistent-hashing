'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Something went wrong</h3>
          <p className="text-sm text-zinc-500 max-w-md mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="btn-glow flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Retry Card ---
export function RetryCard({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="glass-card p-8 text-center max-w-md mx-auto">
      <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-zinc-500 mb-4">{message}</p>
      <button onClick={onRetry} className="btn-glow flex items-center gap-2 mx-auto">
        <RefreshCw className="w-4 h-4" /> Retry
      </button>
    </div>
  );
}

// --- Offline Banner ---
export function OfflineBanner() {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 backdrop-blur-xl flex items-center gap-2 text-sm text-rose-400 animate-slide-up shadow-lg">
      <WifiOff className="w-4 h-4" />
      <span className="font-medium">Connection lost — attempting to reconnect...</span>
    </div>
  );
}
