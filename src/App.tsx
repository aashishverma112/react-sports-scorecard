// src/App.tsx
import { useEffect, useState } from 'react';
import LiveCricketScorecard from './components/LiveCricketScorecard';
import type { WebSocketPacket } from './ingestion/socketIngestion';

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

export default function App() {
  const [mockSocket] = useState(() => new MockWebSocket());

  useEffect(() => {
    let ballIndex = 1;
    let ballsInCurrentOver = 0;
    let completedOvers = 0;

    // Simulate live ball-by-ball commentary feed every 2.5 seconds
    const interval = setInterval(() => {
      const runsArray = [0, 1, 2, 4, 6];
      const randomRuns = runsArray[Math.floor(Math.random() * runsArray.length)];
      const isWicket = Math.random() < 0.12; // ~12% chance of a wicket

      const ballPacket: WebSocketPacket = {
        id: `ball_${Date.now()}_${ballIndex++}`,
        type: 'BALL_BOWLED',
        payload: {
          runs: isWicket ? 0 : randomRuns,
          isWicket,
          ballText: isWicket ? 'W' : randomRuns.toString(),
        },
      };

      mockSocket.simulateMessage(ballPacket);
      ballsInCurrentOver += 1;

      // Every 6 legal deliveries, complete the over: bump the over count
      // and reset the current-over timeline, same as a real match feed would.
      if (ballsInCurrentOver === 6) {
        completedOvers += 1;
        ballsInCurrentOver = 0;

        const overCompletePacket: WebSocketPacket = {
          id: `over_${Date.now()}_${completedOvers}`,
          type: 'OVER_COMPLETE',
          payload: {
            newOverCount: completedOvers,
          },
        };

        // Delay the reset so the completed over stays visible for most of
        // the 2.5s gap, instead of clearing almost instantly after the 6th ball.
        setTimeout(() => mockSocket.simulateMessage(overCompletePacket), 2000);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [mockSocket]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-blue-400">
          React Sports Scorecard
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Live demo — simulated ball-by-ball WebSocket feed, rAF-batched ingestion
        </p>
      </div>

      {/* The Plug-and-Play Widget */}
      <LiveCricketScorecard 
        socket={mockSocket as unknown as WebSocket} 
        theme="dark" 
      />

      <a
        href="https://github.com/aashishverma112/react-sports-scorecard"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 text-xs text-gray-500 hover:text-gray-300 underline"
      >
        View source on GitHub
      </a>
    </div>
  );
}