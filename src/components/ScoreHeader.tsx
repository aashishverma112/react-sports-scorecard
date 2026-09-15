// src/components/ScoreHeader.tsx
import { useLiveScore } from '../hooks/useLiveScore';

export default function ScoreHeader() {
  const { score, wickets, overs, ballsInOver, teamA, teamB, matchFormat, innings, target, inningsComplete, oversLimit } =
    useLiveScore((state) => ({
      score: state.volatile.score,
      wickets: state.volatile.wickets,
      overs: state.volatile.overs,
      ballsInOver: state.volatile.currentOverTimeline.length,
      teamA: state.metadata.teamA,
      teamB: state.metadata.teamB,
      matchFormat: state.metadata.matchFormat,
      innings: state.volatile.innings,
      target: state.volatile.target,
      inningsComplete: state.volatile.inningsComplete,
      oversLimit: state.metadata.oversLimit,
    }));

  // Standard cricket notation: "2.3" means 2 completed overs plus 3 balls
  // into the current one — not a decimal fraction of an over.
  const oversDisplay = ballsInOver > 0 ? `${overs}.${ballsInOver}` : overs;

  // Current run rate needs the true decimal overs (balls / 6), not the
  // "2.3" display notation above — those are not the same number.
  const totalBalls = overs * 6 + ballsInOver;
  const oversForMath = totalBalls / 6;
  const runRate = oversForMath > 0 ? (score / oversForMath).toFixed(2) : '0.00';

  const showMatchLine = teamA || teamB || matchFormat;
  const isChasing = innings === 2 && target != null && !inningsComplete;
  const runsNeeded = isChasing ? target! - score : 0;
  const ballsRemaining = isChasing && oversLimit != null ? oversLimit * 6 - totalBalls : null;
  // Convention: teamA bats first (innings 1), teamB chases (innings 2).
  const battingTeam = innings === 1 ? teamA : teamB;

  return (
    <div className="bg-gray-950 text-white rounded-t-xl border-b border-gray-800 font-sans">
      {showMatchLine && (
        <div className="flex items-center justify-between px-4 pt-3 text-xs text-gray-400">
          <span>{[teamA, teamB].filter(Boolean).join(' vs ')}</span>
          {matchFormat && <span className="uppercase tracking-wider">{matchFormat}</span>}
        </div>
      )}
      <div className="flex justify-between items-center p-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          {battingTeam && (
            <span className="text-base font-semibold text-gray-300 mr-1">{battingTeam}</span>
          )}
          <span className="text-3xl font-black tracking-tight">
            {score}/{wickets}
          </span>
          <span className="text-sm font-medium text-gray-400">
            ({oversDisplay} Ov)
          </span>
        </div>
        <span className="text-sm font-medium text-gray-400">
          CRR <span className="text-gray-200 font-semibold">{runRate}</span>
        </span>
      </div>
      {isChasing && (
        <div className="px-4 pb-3 text-sm text-amber-400 font-medium">
          Target {target} — need {runsNeeded} run{runsNeeded === 1 ? '' : 's'}
          {ballsRemaining != null && ballsRemaining >= 0 ? ` off ${ballsRemaining} ball${ballsRemaining === 1 ? '' : 's'}` : ''}
        </div>
      )}
    </div>
  );
}