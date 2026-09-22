# Engineering Deep Dive

This is the "why," not just the "what" — the design decisions behind `react-sports-scorecard`, including a couple of real bugs hit along the way and how they got fixed. If you're evaluating whether the code underneath is actually solid, this is the doc for that.

## The batching problem

Live cricket data can arrive faster than the browser paints — multiple ball events in the same frame during a flurry of scoring. Wire that straight into `setState` and every packet triggers a render, whether or not the browser is even ready to paint yet.

The fix is a buffer plus a single `requestAnimationFrame` flush:

```ts
handleMessage = (event) => {
  const packet = JSON.parse(event.data);
  this.buffer.push(packet);

  if (!this.isFlushing) {
    this.isFlushing = true;
    this.rafId = requestAnimationFrame(this.flushBatch);
  }
};

flushBatch = () => {
  const nextState = this.buffer.reduce(this.translateEvent, { ...currentState });
  this.store.setState({ volatile: nextState });
  this.buffer = [];
  this.isFlushing = false;
};
```

Ten packets arriving in one frame become one `reduce` over the buffer and one commit — not ten renders.

## De-duplication has a race condition most implementations miss

Reconnects happen. Servers replay events. The obvious fix is a `Set` of seen packet IDs — but where you check it matters more than it looks.

The first version checked for duplicates inside `flushBatch`, marking IDs as seen only once a batch actually flushed. That has a same-frame race: two duplicate packets arriving *before* the next animation frame both get pushed into the buffer, because neither has been marked "seen" yet — the mark only happens at flush time, one frame later.

The fix is checking (and marking) at **push time**, in `handleMessage`, not at flush time:

```ts
handleMessage = (event) => {
  const packet = JSON.parse(event.data);
  if (this.processedIds.has(packet.id)) return; // caught here, same frame
  this.processedIds.add(packet.id);
  this.buffer.push(packet);
  ...
};
```

`processedIds` is capped and FIFO-evicted so it can't grow unbounded over a long-running match.

## A store bug that only showed up under real load

`ScorecardProvider` originally created its store with:

```ts
const store = useMemo(() => createStore(initialData), [initialData]);
```

This looks reasonable. It's also broken, and the breakage is invisible until something makes the parent component re-render frequently — which a live telemetry sidebar (tracking packets/runs/wickets in real time) does constantly.

`initialData`'s default value was an inline object literal. JavaScript re-evaluates default parameters on every call, so a **new object reference** gets created on every render. `useMemo`'s dependency array sees that new reference, decides the dependency "changed," and **recreates the entire store from scratch** — silently resetting the match to 0/0.

The fix: `useState`'s lazy initializer runs exactly once, on mount, regardless of what reference `initialData` has on later renders.

```ts
const [store] = useState(() => createStore(initialData));
```

This is the kind of bug that passes every manual test (nobody's parent component re-renders 10 times a second during casual testing) and only shows up once real traffic hits it.

## Defensive defaults, because "partial data" is the normal case

`createStore` accepts a `PartialMatchState`, not a fully-formed one, and merges each field against explicit defaults:

```ts
volatile: { ...DEFAULT_VOLATILE_STATE, ...(initialState?.volatile ?? {}) }
```

This isn't just convenience. Fields get added to the state shape over time (`innings`, `target` were added when second-innings support shipped). Any `initialData` literal written *before* that — including, in one real case during development, our own demo's leftover example — would silently produce `innings: undefined` at runtime. `undefined != null` is `false` in JavaScript, which meant a stale piece of comparison logic (`margin <= 0`) evaluated as true and reported a match as **tied** when it had actually just finished its first innings normally.

Merging against defaults means a missing field is always a well-formed value, never `undefined` — the bug class is closed at the source, not patched at the call site.

## Ending a match correctly, not just eventually

The overs-limit and wicket-cap checks are boundary checks — they can only fire when an over completes, or when a ball is bowled. A target chase is different: the match has to end **the instant** the target is crossed, which can happen mid-over, on any ball:

```ts
const isTargetReached =
  volatileState.innings === 2 &&
  volatileState.target != null &&
  newScore >= volatileState.target;
```

Once `inningsComplete` is true, every subsequent packet is ignored outright — including a `START_SECOND_INNINGS` packet sent twice, or a late `BALL_BOWLED` from a feed that hasn't caught up to the match ending. The one deliberate exception is `START_SECOND_INNINGS` itself, which is checked *before* the completion guard, since it's the one valid transition out of a finished innings.

## Never owning the mechanism

Two places in this codebase accept a function and render whatever it returns, without knowing or caring how that result was produced:

- The **socket**: `LiveCricketScorecard` never opens a WebSocket connection. It accepts one and listens for `message` events — any reconnect logic, auth scheme, or provider is entirely up to the consumer.
- **`generateSummary`**: an optional prop that can return a string or a `Promise<string>`. In production this would call an LLM. The library has no AI dependency, no API key requirement, and no idea what's inside the function — it just shows a loading state, the result, or a quiet failure notice if the promise rejects.

Same principle both times: the library's job is to manage state correctly, not to own every external interaction that state depends on.

## What's tested

13 tests cover the ingestion engine specifically — batching, same-frame dedup, malformed-packet resilience, the 10-wicket cap, overs-limit enforcement, the full second-innings transition, target-reached-mid-over, and falling short of a target via all-out. Component-level testing (React Testing Library) isn't in place yet — the ingestion/state layer was prioritized first since it's where the actual complexity and past bugs lived.

## What would break this in production

Untested against a real feed so far — only a simulated one. Likely first real-world friction points: out-of-order packet delivery from a genuine WebSocket reconnect (the dedup guard handles *duplicates*, not *reordering*), and any data source whose event shape doesn't match the `BALL_BOWLED`/`OVER_COMPLETE`/`START_SECOND_INNINGS` contract exactly — which is why the ingestion layer is exported separately, for anyone who needs to write a translation layer in front of it.