// src/context/ScorecardContext.tsx
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore } from '../store/scorecardStore';
import type { PartialMatchState, ScorecardStore } from '../store/scorecardStore';

const ScorecardContext = createContext<ScorecardStore | null>(null);

interface ScorecardProviderProps {
  children: ReactNode;
  initialData?: PartialMatchState;
  /** Convenience prop — merged into initialData.metadata.oversLimit at mount time. */
  oversLimit?: number;
}

export function ScorecardProvider({ children, initialData, oversLimit }: ScorecardProviderProps) {
  // useState's lazy initializer runs exactly once, on mount — unlike
  // useMemo, it is NOT re-triggered if the parent passes a new `initialData`
  // object reference on a later render (which happens on every render if
  // the consumer doesn't memoize it themselves, e.g. via an inline default
  // parameter). This keeps the store stable for the component's lifetime.
  // oversLimit is merged in here too, at the same one-time point — changing
  // it later requires remounting (a genuinely new innings), not a live update.
  // createStore fills in any field initialData doesn't provide, so this
  // stays safe even with a partial or outdated initialData object.
  const [store] = useState(() =>
    createStore({
      ...initialData,
      metadata: {
        ...initialData?.metadata,
        oversLimit: oversLimit ?? initialData?.metadata?.oversLimit ?? null,
      },
    })
  );

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