// src/components/MatchSummary.tsx
import { useEffect, useRef, useState } from 'react';
import { useLiveScore } from '../hooks/useLiveScore';
import { useScorecardStore } from '../context/ScorecardContext';
import type { MatchState } from '../store/scorecardStore';

/**
 * Given the full match state at the moment an innings ends, return summary
 * text — synchronously or via a Promise (e.g. a real call to an LLM).
 * The library never makes this call itself; it only renders the result.
 */
export type GenerateSummaryFn = (matchState: MatchState) => Promise<string> | string;

interface MatchSummaryProps {
  generateSummary?: GenerateSummaryFn;
}

export default function MatchSummary({ generateSummary }: MatchSummaryProps) {
  const store = useScorecardStore();
  const { inningsComplete } = useLiveScore((state) => ({
    inningsComplete: state.volatile.inningsComplete,
  }));
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same false→true edge-detection pattern as onInningsComplete — fires
  // once per innings ending, including again for the second innings.
  const prevInningsCompleteRef = useRef(false);

  useEffect(() => {
    if (!generateSummary) return;

    if (inningsComplete && !prevInningsCompleteRef.current) {
      setIsLoading(true);
      setError(null);
      const matchState = store.getState();

      // Supports both a plain string and a Promise<string> return, so a
      // real async call to an AI provider works exactly like a sync one.
      Promise.resolve(generateSummary(matchState))
        .then((text) => setSummary(text))
        .catch((err) => {
          // A failed summary is never allowed to break the scorecard —
          // it just quietly shows nothing beyond a small inline notice.
          console.error('[react-sports-scorecard] generateSummary failed:', err);
          setError('Summary unavailable');
        })
        .finally(() => setIsLoading(false));
    }

    if (!inningsComplete && prevInningsCompleteRef.current) {
      // A new innings just started — clear the previous summary so stale
      // text doesn't linger once the chase is underway.
      setSummary(null);
      setError(null);
    }

    prevInningsCompleteRef.current = inningsComplete;
  }, [inningsComplete, generateSummary, store]);

  if (!generateSummary) return null;
  if (!isLoading && !summary && !error) return null;

  return (
    <div className="px-4 py-3 bg-gray-900/60 border-t border-gray-800 text-sm text-gray-300 italic">
      {isLoading && 'Generating summary…'}
      {error && <span className="text-red-400 not-italic">{error}</span>}
      {summary && <span>{summary}</span>}
    </div>
  );
}
