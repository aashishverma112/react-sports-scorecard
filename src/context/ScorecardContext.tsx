// src/context/ScorecardContext.tsx
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createStore } from '../store/scorecardStore';
import type { MatchState, ScorecardStore } from '../store/scorecardStore';

const ScorecardContext = createContext<ScorecardStore | null>(null);

interface ScorecardProviderProps {
  children: ReactNode;
  initialData: MatchState;
}

export function ScorecardProvider({ children, initialData }: ScorecardProviderProps) {
  const store = useMemo(() => createStore(initialData), [initialData]);

  return (
    <ScorecardContext.Provider value={store}>
      {children}
    </ScorecardContext.Provider>
  );
}

export function useScorecardStore(): ScorecardStore {
  const store = useContext(ScorecardContext);
  if (!store) {
    throw new Error('Scorecard components must be used within a LiveCricketScorecard component.');
  }
  return store;
}