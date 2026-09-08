# React Sports Scorecard 🏏

A hyper-optimized, real-time cricket scorecard UI component library for React, engineered for low-latency live sports data ingestion.

[![CI](https://github.com/aashishverma112/react-sports-scorecard/actions/workflows/ci.yml/badge.svg)](https://github.com/aashishverma112/react-sports-scorecard/actions/workflows/ci.yml)
[![NPM Version](https://img.shields.io/npm/v/react-sports-scorecard.svg)](https://www.npmjs.com/package/react-sports-scorecard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo →](https://react-sports-scorecard.vercel.app/)**

## Features

- 🚀 **High-Frequency WebSocket Ingestion Engine:** Frame-buffered using `requestAnimationFrame` to batch rapid network bursts and guarantee smooth UI performance.
- 🛡️ **Zero-Duplicate Packet Guard:** Built-in message deduplication and malformed payload resilience.
- ⚡ **Surgical Reactivity:** Powered by lightweight custom stores and `useSyncExternalStore` to prevent unnecessary component re-renders.
- 🧩 **Multi-Instance Safe:** Each `<LiveCricketScorecard>` owns its own isolated store via React Context, so multiple concurrent matches can render on the same page without state bleeding between them.
- 🧱 **Error-Contained:** Wrapped in an internal error boundary — a rendering failure inside the widget won't crash your whole app.
- 📦 **Strict TypeScript & ESM/UMD Support:** Built under strict modern compiler rules with zero bloat.

## Installation

```bash
npm install react-sports-scorecard
```

Requires React 18+ or 19 (`react` and `react-dom` are peer dependencies, not bundled).

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

  return <LiveCricketScorecard socket={socket} theme="dark" />;
}
```

The component listens for `message` events on the socket you pass in — it never owns or opens the connection itself, so you're free to use any WebSocket provider, reconnect logic, or auth scheme.

### Expected packet shape

```ts
{
  id: string;              // unique per event — used for de-duplication
  type: 'BALL_BOWLED' | 'OVER_COMPLETE';
  payload: {
    runs?: number;
    isWicket?: boolean;
    extras?: { runs?: number };
    ballText?: string;      // e.g. "4", "6", "W", "1"
    newOverCount?: number;  // OVER_COMPLETE only
  };
}
```

If your data source uses a different shape, translate it to this format before forwarding events to the component, or use the lower-level exports below to build a custom translation layer.

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

## Components

| Export | Description |
|---|---|
| `LiveCricketScorecard` | Full pre-built widget — score header + over timeline, wired to a socket, error-boundary wrapped |
| `ScoreHeader` | Score/wickets/overs display, standalone |
| `OverTimeline` | Ball-by-ball badges for the current over, standalone |
| `ScorecardErrorBoundary` | The error boundary used internally, exported for custom compositions |
| `useLiveScore` | Headless hook for building custom UI on the live state |
| `ScorecardIngestion` | The batching/dedup ingestion engine, exported for advanced/custom use |
| `createStore` | Create your own isolated match store, for advanced/custom use |

## Local development

```bash
git clone https://github.com/aashishverma112/react-sports-scorecard.git
cd react-sports-scorecard
npm install
npm run dev     # runs the local demo app with a simulated live match
npm test        # runs the test suite
npm run build   # builds the publishable library to dist/
```

## Status

Early — cricket-only, two components. Built as an open, real-world example of handling high-frequency real-time state in React. Issues and PRs welcome.

## License

MIT