import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ScorecardErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ScorecardErrorBoundaryState {
  hasError: boolean;
}

/**
 * Contains runtime failures to the scorecard widget itself instead of
 * crashing the consumer's entire app. This does NOT catch errors inside
 * ScorecardIngestion (those are already handled per-packet in socketIngestion.ts) —
 * it catches unexpected render-time errors in the component tree.
 */
export class ScorecardErrorBoundary extends Component<
  ScorecardErrorBoundaryProps,
  ScorecardErrorBoundaryState
> {
  constructor(props: ScorecardErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ScorecardErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[react-sports-scorecard] widget crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-xl border border-red-800 bg-red-950 text-red-200 p-4 text-sm font-sans max-w-md w-full">
            Scorecard failed to render.
          </div>
        )
      );
    }

    return this.props.children;
  }
}