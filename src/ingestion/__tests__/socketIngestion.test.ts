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
      volatile: { score: 0, wickets: 0, overs: 0.0, currentOverTimeline: [] },
      metadata: { teamA: null, teamB: null, matchFormat: null }
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
      volatile: { score: 0, wickets: 0, overs: 0.0, currentOverTimeline: [] },
      metadata: { teamA: null, teamB: null, matchFormat: null }
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
      volatile: { score: 10, wickets: 0, overs: 3.4, currentOverTimeline: ['1', '2'] },
      metadata: { teamA: null, teamB: null, matchFormat: null }
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
});