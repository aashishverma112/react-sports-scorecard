// src/components/InningsStatus.tsx
import { useLiveScore } from '../hooks/useLiveScore';
import { MAX_WICKETS } from '../ingestion/socketIngestion';

export default function InningsStatus() {
  const { inningsComplete, inningsCompleteReason, score, wickets, innings, target, teamA, teamB } = useLiveScore(
    (state) => ({
      inningsComplete: state.volatile.inningsComplete,
      inningsCompleteReason: state.volatile.inningsCompleteReason,
      score: state.volatile.score,
      wickets: state.volatile.wickets,
      innings: state.volatile.innings,
      target: state.volatile.target,
      // Convention: teamA bats first, teamB chases in the second innings.
      teamA: state.metadata.teamA,
      teamB: state.metadata.teamB,
    })
  );

  if (!inningsComplete) {
    return null;
  }

  let message: string;

  if (innings === 1) {
    const base =
      inningsCompleteReason === 'all_out'
        ? `Innings over — all out for ${score}`
        : 'Innings over — overs limit reached';
    message = `${base}. Target: ${score + 1}`;
  } else if (inningsCompleteReason === 'target_reached') {
    const wicketsInHand = MAX_WICKETS - wickets;
    const winner = teamB ?? 'Chasing team';
    message = `${winner} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}`;
  } else {
    const margin = target != null ? target - 1 - score : 0;
    if (margin <= 0) {
      message = 'Match tied';
    } else {
      const winner = teamA ?? 'Defending team';
      message = `${winner} won by ${margin} run${margin === 1 ? '' : 's'}`;
    }
  }

  return (
    <div
      role="status"
      aria-live="assertive"
      className="flex items-center justify-center p-3 bg-red-950/60 text-red-200 text-sm font-semibold border-t border-red-900 rounded-b-xl"
    >
      {message}
    </div>
  );
}
