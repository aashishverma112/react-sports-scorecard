# React Sports Scorecard 🏏

A hyper-optimized, real-time cricket scorecard UI component library for React, engineered for low-latency live sports data ingestion — with correct cricket rules (10-wicket innings, overs limits, a full second-innings run chase) built in.

[![CI](https://github.com/aashishverma112/react-sports-scorecard/actions/workflows/ci.yml/badge.svg)](https://github.com/aashishverma112/react-sports-scorecard/actions/workflows/ci.yml)
[![NPM Version](https://img.shields.io/npm/v/react-sports-scorecard.svg)](https://www.npmjs.com/package/react-sports-scorecard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo →](https://react-sports-scorecard.vercel.app/)**

## Features

- 🚀 **High-Frequency WebSocket Ingestion Engine:** Frame-buffered using `requestAnimationFrame` to batch rapid network bursts and guarantee smooth UI performance.
- 🛡️ **Zero-Duplicate Packet Guard:** Built-in message deduplication and malformed payload resilience.
- 🏏 **Correct Cricket Rules:** Innings ends automatically at 10 wickets or a configurable overs limit; a full second-innings target chase, with the match ending the instant the target is reached — even mid-over — and an accurate win/tie result once it's over.
- 📊 **Live Match Stats:** Standard `2.3`-overs notation, current run rate, team name shown right next to the score (e.g. `India 49/4`), and a live "need X runs off Y balls" chase line during the second innings.
- 🤖 **AI-Ready Summary Hook:** An optional `generateSummary` prop lets you plug in a real call to any AI provider (or your own backend) to generate a plain-language recap once an innings ends — the library never calls an AI itself, it only renders the result.
- ♿ **Accessible by Default:** Ball-by-ball updates and match results are announced via `aria-live` regions for screen readers, with no visible layout impact.
- ⚡ **Surgical Reactivity:** Powered by lightweight custom stores and `useSyncExternalStore` to prevent unnecessary component re-renders.
- 🧩 **Multi-Instance Safe:** Each `<LiveCricketScorecard>` owns its own isolated store via React Context, so multiple concurrent matches can render on the same page without state bleeding between them. (The [live demo](https://react-sports-scorecard.vercel.app/) has a "Spawn a second live match" button that shows this directly — two independent scores ticking side by side.)
- 🧱 **Error-Contained:** Wrapped in an internal error boundary — a rendering failure inside the widget won't crash your whole app.
- 📦 **Strict TypeScript & ESM/UMD Support:** Built under strict modern compiler rules with zero bloat.

## Installation

```bash
npm install react-sports-scorecard
```

Requires React 18+ or 19 (`react` and `react-dom` are peer dependencies, not bundled), and Node.js `^20.19.0 || >=22.12.0` for local development.

### Tailwind CSS setup (required)

Components are styled entirely with Tailwind utility classes and **do not ship compiled CSS**. If your app doesn't already have Tailwind configured, the components will render completely unstyled.

**If you're on Tailwind v4:**
```bash
npm install tailwindcss @tailwindcss/vite
```
In your Vite config:
```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), /* ...your other plugins */],
})
```
In your main CSS file:
```css
@import "tailwindcss";
```

**If you're on Tailwind v3:**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
In `tailwind.config.js`, make sure this package's compiled output is included in `content` so its class names aren't purged:
```js
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/react-sports-scorecard/dist/**/*.{js,cjs}',
  ],
  // ...
}
```
This last line matters — without it, Tailwind's purge step can strip out the utility classes this library relies on, since it only scans your own source by default.

If your project can't adopt Tailwind, use the [headless `useLiveScore` hook](#headless-usage) instead and build your own styled UI on top of the raw state.

## Usage

```tsx
import { LiveCricketScorecard } from 'react-sports-scorecard';

function App() {
  const socket = useMemo(() => new WebSocket('wss://your-data-source/match/123'), []);

  return (
    <LiveCricketScorecard
      socket={socket}
      theme="dark"
      oversLimit={20}
      initialData={{
        metadata: { teamA: 'India', teamB: 'Australia', matchFormat: 'T20' },
      }}
    />
  );
}
```

`initialData` accepts a **partial** match state — any field you don't supply (score, wickets, `innings`, `target`, etc.) is filled in with safe defaults automatically, so you only need to pass what actually differs from a fresh 0/0 start, like team names. The `oversLimit` prop takes precedence over `initialData.metadata.oversLimit` if you set both.

The component listens for `message` events on the socket you pass in — it never owns or opens the connection itself, so you're free to use any WebSocket provider, reconnect logic, or auth scheme.

### Expected packet shape

```ts
{
  id: string;              // unique per event — used for de-duplication
  type: 'BALL_BOWLED' | 'OVER_COMPLETE' | 'START_SECOND_INNINGS';
  payload?: {
    runs?: number;
    isWicket?: boolean;
    extras?: { runs?: number };
    ballText?: string;      // e.g. "4", "6", "W", "1"
    newOverCount?: number;  // OVER_COMPLETE only
  };
}
```

If your data source uses a different shape, translate it to this format before forwarding events to the component, or use the lower-level exports below to build a custom translation layer.

### Second innings & target chase

Once the first innings ends (10 wickets or the overs limit), send a `START_SECOND_INNINGS` packet from your server whenever you're ready to start the chase:

```ts
socket.send(JSON.stringify({ id: 'start2', type: 'START_SECOND_INNINGS' }));
```

This resets score, wickets, overs, and the current-over timeline, and sets `target` to the first innings' final score + 1. From that point on:

- `<ScoreHeader>` shows a live **"Target 151 — need 45 runs off 30 balls"** line
- Reaching the target ends the match **immediately**, even mid-over
- Falling short (all out or overs exhausted) computes the actual result — a win by runs, or a tie if scores finish level

Use `onInningsComplete` to know when to send that packet:

```tsx
<LiveCricketScorecard
  socket={socket}
  oversLimit={20}
  onInningsComplete={(reason, innings) => {
    // reason: 'all_out' | 'overs_completed' | 'target_reached'
    if (innings === 1) {
      // e.g. show a "Start 2nd innings" button, then send START_SECOND_INNINGS
    } else {
      // the match is now fully over
    }
  }}
/>
```

### AI-generated match summaries

`generateSummary` is called once an innings ends, with the full match state — return a string or a `Promise<string>` from any source you like:

```tsx
import type { GenerateSummaryFn } from 'react-sports-scorecard';

const generateSummary: GenerateSummaryFn = async (matchState) => {
  const response = await fetch('/api/summarize', {
    method: 'POST',
    body: JSON.stringify(matchState),
  });
  const { summary } = await response.json();
  return summary; // e.g. a real call to Claude, OpenAI, or your own backend
};

<LiveCricketScorecard socket={socket} generateSummary={generateSummary} />
```

The library shows a loading state while your function runs and never lets a failed summary affect the rest of the widget.

### Headless usage

Not every app wants the pre-styled components (or has Tailwind available). `useLiveScore` gives you the raw state with the same batching/dedup guarantees, so you can build your own UI on top:

```tsx
import { useLiveScore } from 'react-sports-scorecard';

function CustomScoreDisplay() {
  const { score, wickets } = useLiveScore((state) => ({
    score: state.volatile.score,
    wickets: state.volatile.wickets,
  }));

  return <div>{score}/{wickets}</div>;
}
```

Note: `useLiveScore` must be called from a component rendered inside `<LiveCricketScorecard>` (or your own provider built on the exported `createStore`), since it reads from context.

## Components & exports

| Export | Description |
|---|---|
| `LiveCricketScorecard` | Full pre-built widget — score header, over timeline, innings/match status, optional AI summary, wired to a socket, error-boundary wrapped |
| `ScoreHeader` | Score, overs, CRR, team names, and the live chase line, standalone |
| `OverTimeline` | Ball-by-ball badges for the current over, standalone, with screen-reader announcements |
| `InningsStatus` | The innings/match result banner (all out, overs limit, target reached, or a tie) |
| `MatchSummary` | Renders the result of your `generateSummary` function, with a loading and error state |
| `ScorecardErrorBoundary` | The error boundary used internally, exported for custom compositions |
| `useLiveScore` | Headless hook for building custom UI on the live state |
| `ScorecardIngestion` | The batching/dedup/rules engine, exported for advanced/custom use |
| `createStore` | Create your own isolated match store, for advanced/custom use |
| `MatchState`, `PartialMatchState`, `VolatileState`, `MetadataState`, `WebSocketPacket`, `GenerateSummaryFn` | Exported TypeScript types |

## Local development

```bash
git clone https://github.com/aashishverma112/react-sports-scorecard.git
cd react-sports-scorecard
npm install
npm run dev          # runs the local demo app with a simulated live match
npm test             # runs the test suite
npm run build        # builds the publishable library to dist/
npm run build:demo   # builds the demo app to dist-demo/ (used for Vercel deployment)
```

## Status

Cricket-only, single and second innings with a full target chase. Built as an open, real-world example of handling high-frequency real-time state correctly in React. Issues and PRs welcome.

## License

MIT