// src/components/OverTimeline.tsx
import { useLiveScore } from '../hooks/useLiveScore';

function describeBall(ball: string): string {
  if (ball === 'W') return 'Wicket';
  if (ball === '0') return 'Dot ball';
  return `${ball} run${ball === '1' ? '' : 's'}`;
}

export default function OverTimeline() {
  const { timeline, inningsComplete } = useLiveScore((state) => ({
    timeline: state.volatile.currentOverTimeline,
    inningsComplete: state.volatile.inningsComplete,
  }));

  const latestBall = timeline[timeline.length - 1];

  return (
    <div className="flex items-center gap-2 p-3 bg-gray-900 text-white border-b border-gray-800">
      <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">This Over:</span>
      <div className="flex gap-1.5 flex-wrap">
        {timeline.map((ball, index) => {
          let badgeColor = 'bg-gray-700 text-gray-200';
          if (ball === '4' || ball === '6') badgeColor = 'bg-blue-600 text-white font-bold';
          if (ball === 'W') badgeColor = 'bg-red-600 text-white font-bold';
          if (ball === '0') badgeColor = 'bg-gray-800 text-gray-400';

          return (
            <div 
              key={index} 
              className={`animate-ball-enter w-7 h-7 flex items-center justify-center rounded-full text-xs shadow-sm ${badgeColor}`}
            >
              {ball}
            </div>
          );
        })}
        {timeline.length === 0 && (
          <span className="text-xs italic text-gray-500">
            {inningsComplete ? 'Innings complete' : 'Waiting for next ball...'}
          </span>
        )}
      </div>
      {/* Visually hidden — announces each new ball to screen readers without
          a visible element, so the widget stays accessible in a live feed. */}
      <span className="sr-only" role="status" aria-live="polite">
        {latestBall ? describeBall(latestBall) : ''}
      </span>
    </div>
  );
}