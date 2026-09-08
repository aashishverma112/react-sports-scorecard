// src/hooks/useLiveScore.ts
import { useSyncExternalStore, useRef } from 'react';
import { useScorecardStore } from '../context/ScorecardContext';
import type { MatchState } from '../store/scorecardStore';

function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => (a as any)[k] === (b as any)[k]);
}

export function useLiveScore<T>(selector: (state: MatchState) => T): T {
  const store = useScorecardStore();
  const lastSnapshot = useRef<T | undefined>(undefined);

  const getSnapshot = (): T => {
    const next = selector(store.getState());
    if (lastSnapshot.current !== undefined && shallowEqual(lastSnapshot.current, next)) {
      return lastSnapshot.current;
    }
    lastSnapshot.current = next;
    return next;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot);
}