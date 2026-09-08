// src/components/ScoreHeader.tsx
import { useLiveScore } from '../hooks/useLiveScore';

export default function ScoreHeader() {
  const { score, wickets, overs } = useLiveScore((state) => ({
    score: state.volatile.score,
    wickets: state.volatile.wickets,
    overs: state.volatile.overs,
  }));

  return (
    <div className="flex justify-between items-center p-4 bg-gray-950 text-white rounded-t-xl border-b border-gray-800 font-sans">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight">
          {score}/{wickets}
        </span>
        <span className="text-sm font-medium text-gray-400">
          ({overs} Ov)
        </span>
      </div>
    </div>
  );
}