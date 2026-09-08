export interface VolatileState {
  score: number;
  wickets: number;
  overs: number;
  currentOverTimeline: string[];
}

export interface MetadataState {
  teamA: string | null;
  teamB: string | null;
  matchFormat: string | null;
}

export interface MatchState {
  volatile: VolatileState;
  metadata: MetadataState;
}

export type Listener = () => void;

export interface ScorecardStore {
  getState: () => MatchState;
  setState: (partial: Partial<MatchState> | ((state: MatchState) => MatchState)) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createStore(initialState: MatchState): ScorecardStore {
  let state = initialState;
  const listeners = new Set<Listener>();

  function getState(): MatchState {
    return state;
  }

  function setState(partial: Partial<MatchState> | ((state: MatchState) => MatchState)) {
    state = typeof partial === 'function' ? partial(state) : { ...state, ...partial };
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}

export const scorecardStore = createStore({
  volatile: {
    score: 0,
    wickets: 0,
    overs: 0.0,
    currentOverTimeline: [],
  },
  metadata: {
    teamA: null,
    teamB: null,
    matchFormat: null,
  },
});