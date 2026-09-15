// src/components/LiveCricketScorecard.tsx
import { useEffect, useMemo, useRef } from 'react';
import { ScorecardProvider, useScorecardStore } from '../context/ScorecardContext';
import { ScorecardIngestion } from '../ingestion/socketIngestion';
import { useLiveScore } from '../hooks/useLiveScore';
import ScoreHeader from './ScoreHeader';
import OverTimeline from './OverTimeline';
import InningsStatus from './InningsStatus';
import MatchSummary, { type GenerateSummaryFn } from './MatchSummary';
import { ScorecardErrorBoundary } from './ScorecardErrorBoundary';
import type { MatchState } from '../store/scorecardStore';

interface LiveCricketScorecardProps {
  socket: WebSocket;
  theme?: 'dark' | 'light';
  className?: string;
  initialData?: MatchState;
  /** Innings ends automatically once this many overs are completed. Omit for no limit. */
  oversLimit?: number;
  /** Fires each time an innings ends (all out, overs limit, or target reached), with which innings just finished. */
  onInningsComplete?: (reason: 'all_out' | 'overs_completed' | 'target_reached', innings: 1 | 2) => void;
  /** Optional: generate summary text (e.g. via a real AI call) once an innings ends. The library only renders the result — it never calls an AI itself. */
  generateSummary?: GenerateSummaryFn;
}

interface ScorecardCoreProps {
  socket: WebSocket;
  onInningsComplete?: (reason: 'all_out' | 'overs_completed' | 'target_reached', innings: 1 | 2) => void;
  generateSummary?: GenerateSummaryFn;
}

function ScorecardCore({ socket, onInningsComplete, generateSummary }: ScorecardCoreProps) {
  const store = useScorecardStore();
  const ingestion = useMemo(() => new ScorecardIngestion(store), [store]);
  const { inningsComplete, inningsCompleteReason, innings } = useLiveScore((state) => ({
    inningsComplete: state.volatile.inningsComplete,
    inningsCompleteReason: state.volatile.inningsCompleteReason,
    innings: state.volatile.innings,
  }));
  // Tracks the previous inningsComplete value so the callback fires on
  // every false→true transition — not just once ever. Without this, the
  // callback would silently stop working for the second innings, since
  // starting it resets inningsComplete back to false and it becomes true
  // again once innings 2 also ends.
  const prevInningsCompleteRef = useRef(false);

  useEffect(() => {
    if (!socket) return;

    const messageHandler = (event: MessageEvent) => ingestion.handleMessage(event);
    socket.addEventListener('message', messageHandler);

    return () => {
      ingestion.destroy();
      socket.removeEventListener('message', messageHandler);
    };
  }, [socket, ingestion]);

  useEffect(() => {
    if (inningsComplete && !prevInningsCompleteRef.current && inningsCompleteReason) {
      onInningsComplete?.(inningsCompleteReason, innings);
    }
    prevInningsCompleteRef.current = inningsComplete;
  }, [inningsComplete, inningsCompleteReason, innings, onInningsComplete]);

  return (
    <div className="flex flex-col w-full">
      <ScoreHeader />
      <OverTimeline />
      <InningsStatus />
      <MatchSummary generateSummary={generateSummary} />
    </div>
  );
}

const DEFAULT_INITIAL_DATA: MatchState = {
  volatile: {
    score: 0,
    wickets: 0,
    overs: 0.0,
    currentOverTimeline: [],
    inningsComplete: false,
    inningsCompleteReason: null,
    innings: 1,
    target: null,
  },
  metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: null },
};

export default function LiveCricketScorecard({ 
  socket, 
  theme = 'dark', 
  className = '',
  initialData = DEFAULT_INITIAL_DATA,
  oversLimit,
  onInningsComplete,
  generateSummary,
}: LiveCricketScorecardProps) {
  const themeClasses = theme === 'dark' 
    ? 'bg-gray-900 text-white border-gray-800' 
    : 'bg-white text-gray-900 border-gray-200';

  return (
    <ScorecardErrorBoundary>
      <ScorecardProvider initialData={initialData} oversLimit={oversLimit}>
        <div className={`rounded-xl border shadow-lg overflow-hidden max-w-md w-full font-sans ${themeClasses} ${className}`}>
          <ScorecardCore socket={socket} onInningsComplete={onInningsComplete} generateSummary={generateSummary} />
        </div>
      </ScorecardProvider>
    </ScorecardErrorBoundary>
  );
}