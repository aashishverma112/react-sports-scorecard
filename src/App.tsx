// src/App.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Github, Package, Pause, Play, Plus, X, Radio } from 'lucide-react';
import LiveCricketScorecard from './components/LiveCricketScorecard';
import type { WebSocketPacket } from './ingestion/socketIngestion';
import type { MatchState } from './store/scorecardStore';

/**
 * Stand-in for a real AI call. In production, replace the body of this
 * function with an actual request to your provider of choice (Claude,
 * OpenAI, your own backend, etc.) — generateSummary only needs to return
 * a string or a Promise<string>; the library never calls an AI itself,
 * it only renders whatever text this function returns. The artificial
 * delay below just simulates realistic network latency for the demo.
 */
async function mockGenerateSummary(matchState: MatchState): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 900));

  const { volatile, metadata } = matchState;
  const { score, wickets, overs, innings, target, inningsCompleteReason } = volatile;
  const { teamA, teamB } = metadata;
  const battingFirst = teamA ?? 'The batting side';
  const chasing = teamB ?? 'the chasing side';

  if (innings === 1) {
    return `${battingFirst} posted ${score}/${wickets} in ${overs} overs. ${chasing} will need ${score + 1} to win.`;
  }

  if (inningsCompleteReason === 'target_reached') {
    const wicketsInHand = 10 - wickets;
    return `${chasing} chased the target down with ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'} in hand — a comfortable win.`;
  }

  const margin = target != null ? target - 1 - score : 0;
  if (margin <= 0) {
    return 'A nail-biter — the scores finished level and the match ended in a tie.';
  }
  return `${battingFirst} held on to win by ${margin} run${margin === 1 ? '' : 's'}, denying ${chasing} a memorable chase.`;
}

// A lightweight mock WebSocket to simulate live match data locally
class MockWebSocket {
  private listeners: EventListener[] = [];
  public readyState = WebSocket.OPEN;

  public addEventListener(type: string, listener: EventListener): void {
    if (type === 'message') {
      this.listeners.push(listener);
    }
  }

  public removeEventListener(type: string, listener: EventListener): void {
    if (type === 'message') {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
  }

  // Simulate an incoming live packet from the server
  public simulateMessage(packet: WebSocketPacket): void {
    const event = new MessageEvent('message', {
      data: JSON.stringify(packet),
    });
    this.listeners.forEach((listener) => listener(event));
  }
}

interface FeedStats {
  packetsSent: number;
  runsScored: number;
  wickets: number;
  oversCompleted: number;
}

const EMPTY_STATS: FeedStats = {
  packetsSent: 0,
  runsScored: 0,
  wickets: 0,
  oversCompleted: 0,
};

type InningsCompleteReason = 'all_out' | 'overs_completed' | 'target_reached';

/**
 * Drives one independent simulated match feed: its own socket, its own
 * ball/over generator, and its own pause control. Each call to this hook
 * is fully isolated from every other — mounting it twice (see the
 * "second match" toggle below) proves the store isolation fix directly,
 * since neither feed can see or affect the other's state.
 *
 * `resetKey` lets a caller force a brand-new socket + fresh counters —
 * used when the overs limit changes, since that's genuinely a new match,
 * not a live update to the one in progress. `startSecondInnings`, by
 * contrast, resets the ball generator WITHOUT a new socket — this is a
 * continuation of the same match into its second innings.
 */
function useLiveFeed(intervalMs: number, resetKey: number = 0) {
  const socket = useMemo(() => new MockWebSocket(), [resetKey]);
  const [stats, setStats] = useState<FeedStats>(EMPTY_STATS);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const isFinishedRef = useRef(isFinished);
  isFinishedRef.current = isFinished;
  const hasStartedRef = useRef(hasStarted);
  hasStartedRef.current = hasStarted;

  // Mutable generator counters live in refs (not effect-local variables)
  // so startSecondInnings() can reset them from outside the effect,
  // without tearing down and recreating the interval/socket.
  const ballIndexRef = useRef(1);
  const ballsInOverRef = useRef(0);
  const completedOversRef = useRef(0);

  useEffect(() => {
    setStats(EMPTY_STATS);
    setIsPaused(false);
    setIsFinished(false);
    // Picking a new overs limit (which bumps resetKey) always returns to
    // an un-started state — choosing a number alone should never make the
    // scoreboard start ticking on its own; only an explicit start() call
    // (the "Start Match" button) should.
    setHasStarted(false);
    ballIndexRef.current = 1;
    ballsInOverRef.current = 0;
    completedOversRef.current = 0;

    const interval = setInterval(() => {
      if (!hasStartedRef.current || isPausedRef.current || isFinishedRef.current) return;

      const runsArray = [0, 1, 2, 4, 6];
      const runs = runsArray[Math.floor(Math.random() * runsArray.length)];
      const isWicket = Math.random() < 0.12;

      const ballPacket: WebSocketPacket = {
        id: `ball_${Date.now()}_${ballIndexRef.current++}`,
        type: 'BALL_BOWLED',
        payload: {
          runs: isWicket ? 0 : runs,
          isWicket,
          ballText: isWicket ? 'W' : runs.toString(),
        },
      };

      socket.simulateMessage(ballPacket);
      ballsInOverRef.current += 1;

      setStats((prev) => ({
        ...prev,
        packetsSent: prev.packetsSent + 1,
        runsScored: prev.runsScored + (isWicket ? 0 : runs),
        wickets: prev.wickets + (isWicket ? 1 : 0),
      }));

      if (ballsInOverRef.current === 6) {
        completedOversRef.current += 1;
        ballsInOverRef.current = 0;
        const completedOversSnapshot = completedOversRef.current;

        const overCompletePacket: WebSocketPacket = {
          id: `over_${Date.now()}_${completedOversSnapshot}`,
          type: 'OVER_COMPLETE',
          payload: { newOverCount: completedOversSnapshot },
        };

        setTimeout(() => {
          if (isFinishedRef.current) return;
          socket.simulateMessage(overCompletePacket);
          setStats((prev) => ({ ...prev, packetsSent: prev.packetsSent + 1, oversCompleted: completedOversSnapshot }));
        }, 2000);
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [socket, intervalMs]);

  const startSecondInnings = () => {
    // Fresh generator state for the new innings, but the SAME socket and
    // the SAME underlying widget/store — this is a continuation of one
    // match, not a new one (unlike resetKey, which starts an unrelated match).
    ballIndexRef.current = 1;
    ballsInOverRef.current = 0;
    completedOversRef.current = 0;
    setStats(EMPTY_STATS);
    setIsFinished(false);
    socket.simulateMessage({ id: `start2_${Date.now()}`, type: 'START_SECOND_INNINGS' });
  };

  return {
    socket,
    stats,
    isPaused,
    isFinished,
    hasStarted,
    start: () => setHasStarted(true),
    togglePause: () => setIsPaused((p) => !p),
    stop: () => setIsFinished(true),
    startSecondInnings,
  };
}

function useUptime(resetKey: number = 0, active: boolean = true) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
  }, [resetKey]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active, resetKey]);
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function TelemetryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-2.5 border-b border-surface-raised last:border-0">
      <span className="text-sm text-mist">{label}</span>
      <span className="font-score text-lg text-ink">{value}</span>
    </div>
  );
}

function SecondMatch({ onRemove }: { onRemove: () => void }) {
  const feed = useLiveFeed(1800);
  const [currentInnings, setCurrentInnings] = useState<1 | 2>(1);

  const handleInningsComplete = (_reason: InningsCompleteReason, innings: 1 | 2) => {
    feed.stop();
    setCurrentInnings(innings);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-mist">Match 2 — independent store</h3>
        <div className="flex items-center gap-4">
          {feed.isFinished ? (
            currentInnings === 1 ? (
              <button
                onClick={() => {
                  feed.startSecondInnings();
                  setCurrentInnings(2);
                }}
                className="flex items-center gap-1.5 text-sm text-floodlight hover:text-ink transition-colors font-medium"
              >
                <Play size={14} /> Start 2nd innings
              </button>
            ) : (
              <span className="text-sm text-wicket">Match complete</span>
            )
          ) : (
            <button
              onClick={feed.togglePause}
              className="flex items-center gap-1.5 text-sm text-mist hover:text-ink transition-colors"
            >
              {feed.isPaused ? <Play size={14} /> : <Pause size={14} />}
              {feed.isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-sm text-wicket hover:text-ink transition-colors"
          >
            <X size={14} /> Remove
          </button>
        </div>
      </div>
      <LiveCricketScorecard
        socket={feed.socket as unknown as WebSocket}
        theme="dark"
        onInningsComplete={handleInningsComplete}
        generateSummary={mockGenerateSummary}
        initialData={{
          volatile: {
            score: 0,
            wickets: 0,
            overs: 0.0,
            currentOverTimeline: [],
            inningsComplete: false,
            inningsCompleteReason: null,
            innings: 1,
            target: null,
          },
          metadata: { teamA: 'Mumbai', teamB: 'Chennai', matchFormat: 'ODI', oversLimit: null },
        }}
      />
    </section>
  );
}

export default function App() {
  const [oversLimit, setOversLimit] = useState<number>(5);
  const [resetKey, setResetKey] = useState(0);
  const primary = useLiveFeed(2500, resetKey);
  const [currentInnings, setCurrentInnings] = useState<1 | 2>(1);
  const [showSecondMatch, setShowSecondMatch] = useState(false);
  const uptime = useUptime(resetKey, primary.hasStarted);

  // Changing the overs limit starts a genuinely new match: a fresh
  // socket/feed (via resetKey) and a fresh widget mount (via the same
  // key on LiveCricketScorecard below), so the new limit takes effect
  // cleanly rather than trying to retrofit it onto a match in progress.
  const handleOversChange = (value: number) => {
    setOversLimit(value);
    setResetKey((k) => k + 1);
    setCurrentInnings(1);
  };

  const handleInningsComplete = (_reason: InningsCompleteReason, innings: 1 | 2) => {
    primary.stop();
    setCurrentInnings(innings);
  };

  const handleStartSecondInnings = () => {
    primary.startSecondInnings();
    setCurrentInnings(2);
  };

  return (
    <div className="min-h-screen text-ink font-display">
      {/* Top bar */}
      <header className="sticky top-0 z-10 surface-panel border-b border-surface-raised">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-floodlight" />
            </span>
            <h1 className="text-base font-semibold tracking-tight">
              react-sports-scorecard
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-mist">
            <a
              href="https://github.com/aashishverma112/react-sports-scorecard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-ink transition-colors"
            >
              <Github size={16} /> GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/react-sports-scorecard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-ink transition-colors"
            >
              <Package size={16} /> npm
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-8">
        <p className="text-sm text-floodlight font-medium mb-3">Live demo</p>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight max-w-xl leading-tight">
          A scorecard built to survive a real ball-by-ball feed.
        </h2>
        <p className="text-mist mt-3 max-w-lg">
          This page runs a simulated WebSocket firing ball events every 2.5 seconds.
          The widget below batches every burst into a single frame update, drops
          duplicate packets, ends each innings at 10 wickets or the overs limit,
          tracks a real run chase in the second innings, generates a plain-language
          recap once it ends, and keeps two concurrent matches fully isolated.
        </p>
      </div>

      {/* Match center + telemetry */}
      <div className="max-w-6xl mx-auto px-6 pb-16 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-6">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-medium text-mist">Match 1</h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-mist">
                  Overs
                  <select
                    value={oversLimit}
                    onChange={(e) => handleOversChange(Number(e.target.value))}
                    className="surface-panel border border-surface-raised rounded-md text-sm text-ink px-2 py-1 focus:outline-none focus:border-floodlight"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {!primary.hasStarted ? (
                  <button
                    onClick={primary.start}
                    className="flex items-center gap-1.5 text-sm text-floodlight hover:text-ink transition-colors font-medium"
                  >
                    <Play size={14} /> Start Match
                  </button>
                ) : primary.isFinished ? (
                  currentInnings === 1 ? (
                    <button
                      onClick={handleStartSecondInnings}
                      className="flex items-center gap-1.5 text-sm text-floodlight hover:text-ink transition-colors font-medium"
                    >
                      <Play size={14} /> Start 2nd innings
                    </button>
                  ) : (
                    <span className="text-sm text-wicket">Match complete</span>
                  )
                ) : (
                  <button
                    onClick={primary.togglePause}
                    className="flex items-center gap-1.5 text-sm text-mist hover:text-ink transition-colors"
                  >
                    {primary.isPaused ? <Play size={14} /> : <Pause size={14} />}
                    {primary.isPaused ? 'Resume' : 'Pause'}
                  </button>
                )}
              </div>
            </div>
            <LiveCricketScorecard
              key={resetKey}
              socket={primary.socket as unknown as WebSocket}
              theme="dark"
              oversLimit={oversLimit}
              onInningsComplete={handleInningsComplete}
              generateSummary={mockGenerateSummary}
              initialData={{
                volatile: {
                  score: 0,
                  wickets: 0,
                  overs: 0.0,
                  currentOverTimeline: [],
                  inningsComplete: false,
                  inningsCompleteReason: null,
                  innings: 1,
                  target: null,
                },
                metadata: { teamA: 'India', teamB: 'Australia', matchFormat: `${oversLimit} Overs`, oversLimit: null },
              }}
            />
          </section>

          {showSecondMatch ? (
            <SecondMatch onRemove={() => setShowSecondMatch(false)} />
          ) : (
            <button
              onClick={() => setShowSecondMatch(true)}
              className="w-full max-w-md flex items-center justify-center gap-2 surface-panel rounded-xl border border-dashed border-surface-raised py-4 text-sm text-mist hover:text-ink hover:border-floodlight transition-colors"
            >
              <Plus size={16} /> Spawn a second live match
            </button>
          )}
        </div>

        {/* Telemetry sidebar */}
        <aside className="surface-panel rounded-xl border border-surface-raised p-5 h-fit">
          <div className="flex items-center gap-2 mb-1">
            <Radio size={14} className="text-floodlight" />
            <h3 className="text-sm font-medium text-ink">Feed telemetry</h3>
          </div>
          <p className="text-xs text-mist mb-4">
            Match 1, Innings {currentInnings} —{' '}
            {!primary.hasStarted
              ? 'not started'
              : primary.isFinished
              ? currentInnings === 2
                ? 'match complete'
                : 'innings complete'
              : 'live'}
          </p>

          <TelemetryRow label="Packets sent" value={primary.stats.packetsSent} />
          <TelemetryRow label="Runs scored" value={primary.stats.runsScored} />
          <TelemetryRow label="Wickets" value={primary.stats.wickets} />
          <TelemetryRow label="Overs completed" value={primary.stats.oversCompleted} />
          <TelemetryRow label="Uptime" value={uptime} />

          <p className="text-xs text-mist mt-4 pt-4 border-t border-surface-raised">
            Every packet above is batched by <code className="font-score text-turf">requestAnimationFrame</code> before
            it ever touches React state.
          </p>
        </aside>
      </div>
    </div>
  );
}
