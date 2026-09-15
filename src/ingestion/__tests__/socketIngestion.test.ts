// src/ingestion/__tests__/socketIngestion.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScorecardIngestion } from '../socketIngestion';
import { createStore } from '../../store/scorecardStore';
import type { ScorecardStore } from '../../store/scorecardStore';

describe('ScorecardIngestion Engine', () => {
  let mockStore: ScorecardStore;
  let ingestion: ScorecardIngestion;

  beforeEach(() => {
    // Default global stub for standard tests (executes immediately)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(0), 0) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));

    mockStore = createStore({
      volatile: { score: 0, wickets: 0, overs: 0.0, currentOverTimeline: [], inningsComplete: false, inningsCompleteReason: null, innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: null }
    });
    vi.spyOn(mockStore, 'setState');
    ingestion = new ScorecardIngestion(mockStore);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('correctly processes a valid BALL_BOWLED packet', async () => {
    const msg = {
      data: JSON.stringify({ id: 'msg_1', type: 'BALL_BOWLED', payload: { runs: 4, ballText: '4' } })
    } as MessageEvent;

    ingestion.handleMessage(msg);

    // Allow microtask/macrotask for rAF stub
    await new Promise((r) => setTimeout(r, 10));

    expect(mockStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        score: 4,
        currentOverTimeline: ['4']
      })
    });
  });

  it('drops duplicate packets with the same ID', async () => {
    const msg = {
      data: JSON.stringify({ id: 'msg_dup', type: 'BALL_BOWLED', payload: { runs: 6, ballText: '6' } })
    } as MessageEvent;

    ingestion.handleMessage(msg);
    ingestion.handleMessage(msg);

    await new Promise((r) => setTimeout(r, 10));

    expect(mockStore.setState).toHaveBeenCalledTimes(1);
  });

  it('gracefully handles malformed packets without throwing', () => {
    const badMsg = {
      data: JSON.stringify({ id: 'msg_bad', type: 'BALL_BOWLED', payload: null })
    } as MessageEvent;

    expect(() => ingestion.handleMessage(badMsg)).not.toThrow();
  });

  it('batches multiple packets arriving before the rAF flush into one commit', () => {
    let flushCallback: FrameRequestCallback = () => {};
    // Override stub specifically to trap the callback without auto-firing
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      flushCallback = cb;
      return 123;
    });

    const freshStore = createStore({
      volatile: { score: 0, wickets: 0, overs: 0.0, currentOverTimeline: [], inningsComplete: false, inningsCompleteReason: null, innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: null }
    });
    vi.spyOn(freshStore, 'setState');
    const freshIngestion = new ScorecardIngestion(freshStore);

    const msg1 = { data: JSON.stringify({ id: 'b1', type: 'BALL_BOWLED', payload: { runs: 4, ballText: '4' } }) } as MessageEvent;
    const msg2 = { data: JSON.stringify({ id: 'b2', type: 'BALL_BOWLED', payload: { runs: 1, ballText: '1' } }) } as MessageEvent;
    const msg3 = { data: JSON.stringify({ id: 'b3', type: 'BALL_BOWLED', payload: { runs: 6, ballText: '6' } }) } as MessageEvent;

    freshIngestion.handleMessage(msg1);
    freshIngestion.handleMessage(msg2);
    freshIngestion.handleMessage(msg3);

    expect(freshStore.setState).not.toHaveBeenCalled();

    // Manually trigger the trapped rAF callback
    flushCallback(0);

    expect(freshStore.setState).toHaveBeenCalledTimes(1);
    expect(freshStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        score: 11,
        currentOverTimeline: ['4', '1', '6'],
      }),
    });
  });

  it('resets the over timeline and updates over count on OVER_COMPLETE', async () => {
    const msg = {
      data: JSON.stringify({
        id: 'oc_1',
        type: 'OVER_COMPLETE',
        payload: { newOverCount: 5.0 },
      }),
    } as MessageEvent;

    ingestion.handleMessage(msg);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        overs: 5.0,
        currentOverTimeline: [],
      }),
    });
  });

  it('falls back to existing over count when OVER_COMPLETE payload is missing it', async () => {
    const customStore = createStore({
      volatile: { score: 10, wickets: 0, overs: 3.4, currentOverTimeline: ['1', '2'], inningsComplete: false, inningsCompleteReason: null, innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: null }
    });
    vi.spyOn(customStore, 'setState');
    const customIngestion = new ScorecardIngestion(customStore);

    const msg = {
      data: JSON.stringify({ id: 'oc_2', type: 'OVER_COMPLETE', payload: {} }),
    } as MessageEvent;

    customIngestion.handleMessage(msg);
    await new Promise((r) => setTimeout(r, 10));

    expect(customStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        overs: 3.4,
        currentOverTimeline: [],
      }),
    });
  });

  it('destroy() cancels pending rAF and clears internal state', () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
    
    const msg = { data: JSON.stringify({ id: 'd1', type: 'BALL_BOWLED', payload: { runs: 2, ballText: '2' } }) } as MessageEvent;

    ingestion.handleMessage(msg);
    ingestion.destroy();

    expect(cancelSpy).toHaveBeenCalled();
    expect(ingestion.processedIds.size).toBe(0);
  });

  it('caps wickets at 10 and marks the innings all out on the 10th wicket', async () => {
    const nineWicketsStore = createStore({
      volatile: { score: 50, wickets: 9, overs: 12.0, currentOverTimeline: [], inningsComplete: false, inningsCompleteReason: null, innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: null },
    });
    vi.spyOn(nineWicketsStore, 'setState');
    const nineWicketsIngestion = new ScorecardIngestion(nineWicketsStore);

    const wicketMsg = {
      data: JSON.stringify({ id: 'w10', type: 'BALL_BOWLED', payload: { runs: 0, isWicket: true, ballText: 'W' } }),
    } as MessageEvent;

    nineWicketsIngestion.handleMessage(wicketMsg);
    await new Promise((r) => setTimeout(r, 10));

    expect(nineWicketsStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        wickets: 10,
        inningsComplete: true,
        inningsCompleteReason: 'all_out',
      }),
    });
  });

  it('ignores further packets once the innings is already complete', async () => {
    const finishedStore = createStore({
      volatile: { score: 120, wickets: 10, overs: 15.0, currentOverTimeline: [], inningsComplete: true, inningsCompleteReason: 'all_out', innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: null },
    });
    vi.spyOn(finishedStore, 'setState');
    const finishedIngestion = new ScorecardIngestion(finishedStore);

    const lateBall = {
      data: JSON.stringify({ id: 'late1', type: 'BALL_BOWLED', payload: { runs: 4, ballText: '4' } }),
    } as MessageEvent;

    finishedIngestion.handleMessage(lateBall);
    await new Promise((r) => setTimeout(r, 10));

    // Score must NOT have moved past 120 — the packet should be ignored entirely.
    expect(finishedStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({ score: 120, wickets: 10 }),
    });
  });

  it('marks the innings complete once the configured overs limit is reached', async () => {
    const limitedStore = createStore({
      volatile: { score: 45, wickets: 2, overs: 4.0, currentOverTimeline: [], inningsComplete: false, inningsCompleteReason: null, innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: 5 },
    });
    vi.spyOn(limitedStore, 'setState');
    const limitedIngestion = new ScorecardIngestion(limitedStore);

    const finalOverComplete = {
      data: JSON.stringify({ id: 'oc_final', type: 'OVER_COMPLETE', payload: { newOverCount: 5 } }),
    } as MessageEvent;

    limitedIngestion.handleMessage(finalOverComplete);
    await new Promise((r) => setTimeout(r, 10));

    expect(limitedStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        overs: 5,
        inningsComplete: true,
        inningsCompleteReason: 'overs_completed',
      }),
    });
  });

  it('starts the second innings with a target one run above the first innings score, resetting all match state', async () => {
    const finishedFirstInnings = createStore({
      volatile: { score: 150, wickets: 6, overs: 20.0, currentOverTimeline: ['4', '1'], inningsComplete: true, inningsCompleteReason: 'overs_completed', innings: 1, target: null },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: 20 },
    });
    vi.spyOn(finishedFirstInnings, 'setState');
    const ingestion = new ScorecardIngestion(finishedFirstInnings);

    const startSecond = {
      data: JSON.stringify({ id: 'start2_1', type: 'START_SECOND_INNINGS' }),
    } as MessageEvent;

    ingestion.handleMessage(startSecond);
    await new Promise((r) => setTimeout(r, 10));

    expect(finishedFirstInnings.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        score: 0,
        wickets: 0,
        overs: 0,
        currentOverTimeline: [],
        inningsComplete: false,
        inningsCompleteReason: null,
        innings: 2,
        target: 151,
      }),
    });
  });

  it('ends the match immediately once the target is reached, even mid-over', async () => {
    const chasingStore = createStore({
      volatile: { score: 148, wickets: 3, overs: 18.4 as unknown as number, currentOverTimeline: ['1', '4'], inningsComplete: false, inningsCompleteReason: null, innings: 2, target: 151 },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: 20 },
    });
    vi.spyOn(chasingStore, 'setState');
    const ingestion = new ScorecardIngestion(chasingStore);

    // A single four takes the score from 148 to 152 — past the target of 151,
    // and this happens mid-over (only the 3rd ball), not at an over boundary.
    const winningBall = {
      data: JSON.stringify({ id: 'win1', type: 'BALL_BOWLED', payload: { runs: 4, ballText: '4' } }),
    } as MessageEvent;

    ingestion.handleMessage(winningBall);
    await new Promise((r) => setTimeout(r, 10));

    expect(chasingStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        score: 152,
        inningsComplete: true,
        inningsCompleteReason: 'target_reached',
      }),
    });
  });

  it('ends the match via all_out in the second innings when the target is not reached', async () => {
    const chasingStore = createStore({
      volatile: { score: 120, wickets: 9, overs: 15.0, currentOverTimeline: [], inningsComplete: false, inningsCompleteReason: null, innings: 2, target: 151 },
      metadata: { teamA: null, teamB: null, matchFormat: null, oversLimit: 20 },
    });
    vi.spyOn(chasingStore, 'setState');
    const ingestion = new ScorecardIngestion(chasingStore);

    const lastWicket = {
      data: JSON.stringify({ id: 'w10chase', type: 'BALL_BOWLED', payload: { runs: 0, isWicket: true, ballText: 'W' } }),
    } as MessageEvent;

    ingestion.handleMessage(lastWicket);
    await new Promise((r) => setTimeout(r, 10));

    // Falling short of the target via all_out is still a match-ending
    // event — the defending team wins by (target - 1 - score) runs.
    expect(chasingStore.setState).toHaveBeenCalledWith({
      volatile: expect.objectContaining({
        wickets: 10,
        inningsComplete: true,
        inningsCompleteReason: 'all_out',
        target: 151,
      }),
    });
  });
});