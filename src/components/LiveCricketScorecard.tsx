// src/components/LiveCricketScorecard.tsx
import { useEffect, useMemo } from 'react';
import { ScorecardProvider, useScorecardStore } from '../context/ScorecardContext';
import { ScorecardIngestion } from '../ingestion/socketIngestion';
import ScoreHeader from './ScoreHeader';
import OverTimeline from './OverTimeline';
import { ScorecardErrorBoundary } from './ScorecardErrorBoundary';
import type { MatchState } from '../store/scorecardStore';

interface LiveCricketScorecardProps {
  socket: WebSocket;
  theme?: 'dark' | 'light';
  className?: string;
  initialData?: MatchState;
}

interface ScorecardCoreProps {
  socket: WebSocket;
}

function ScorecardCore({ socket }: ScorecardCoreProps) {
  const store = useScorecardStore();
  const ingestion = useMemo(() => new ScorecardIngestion(store), [store]);

  useEffect(() => {
    if (!socket) return;

    const messageHandler = (event: MessageEvent) => ingestion.handleMessage(event);
    socket.addEventListener('message', messageHandler);

    return () => {
      ingestion.destroy();
      socket.removeEventListener('message', messageHandler);
    };
  }, [socket, ingestion]);

  return (
    <div className="flex flex-col w-full">
      <ScoreHeader />
      <OverTimeline />
    </div>
  );
}

export default function LiveCricketScorecard({ 
  socket, 
  theme = 'dark', 
  className = '',
  initialData = {
    volatile: { score: 0, wickets: 0, overs: 0.0, currentOverTimeline: [] },
    metadata: { teamA: null, teamB: null, matchFormat: null }
  }
}: LiveCricketScorecardProps) {
  const themeClasses = theme === 'dark' 
    ? 'bg-gray-900 text-white border-gray-800' 
    : 'bg-white text-gray-900 border-gray-200';

  return (
    <ScorecardErrorBoundary>
      <ScorecardProvider initialData={initialData}>
        <div className={`rounded-xl border shadow-lg overflow-hidden max-w-md w-full font-sans ${themeClasses} ${className}`}>
          <ScorecardCore socket={socket} />
        </div>
      </ScorecardProvider>
    </ScorecardErrorBoundary>
  );
}