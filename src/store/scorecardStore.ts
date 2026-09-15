export interface VolatileState {
  score: number;
  wickets: number;
  overs: number;
  currentOverTimeline: string[];
  inningsComplete: boolean;
  inningsCompleteReason: 'all_out' | 'overs_completed' | 'target_reached' | null;
  /** Which innings is currently in progress. */
  innings: 1 | 2;
  /** Runs needed to win — set once the second innings starts (score of the first innings + 1). Null during the first innings. */
  target: number | null;
}

export interface MetadataState {
  teamA: string | null;
  teamB: string | null;
  matchFormat: string | null;
  oversLimit: number | null;
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

const DEFAULT_VOLATILE_STATE: VolatileState = {
  score: 0,
  wickets: 0,
  overs: 0,
  currentOverTimeline: [],
  inningsComplete: false,
  inningsCompleteReason: null,
  innings: 1,
  target: null,
};

const DEFAULT_METADATA_STATE: MetadataState = {
  teamA: null,
  teamB: null,
  matchFormat: null,
  oversLimit: null,
};

/**
 * Accepts a PARTIAL initial state and fills in safe defaults for anything
 * missing — deliberately, not just for convenience. If a consumer (or an
 * older version of their own code) supplies an `initialData.volatile` that
 * predates a field added later (e.g. `innings`/`target`), a naive object
 * spread would leave that field `undefined` at runtime, which can then
 * silently satisfy loose-equality checks like `undefined != null` (false)
 * in ways that look like real data — e.g. incorrectly reporting a tied
 * match at the end of the first innings. Merging against explicit
 * defaults here means every field is always a well-formed value, no
 * matter how incomplete the caller's input is.
 */
/** Recursively partial — unlike Partial<MatchState>, this also allows individual fields inside volatile/metadata to be omitted, matching what createStore actually does: merging each nested object against defaults field by field. */
export interface PartialMatchState {
  volatile?: Partial<VolatileState>;
  metadata?: Partial<MetadataState>;
}

export function createStore(initialState?: PartialMatchState): ScorecardStore {
  let state: MatchState = {
    volatile: { ...DEFAULT_VOLATILE_STATE, ...(initialState?.volatile ?? {}) },
    metadata: { ...DEFAULT_METADATA_STATE, ...(initialState?.metadata ?? {}) },
  };
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

export const scorecardStore = createStore();