// src/ingestion/socketIngestion.ts
import type { ScorecardStore, VolatileState } from '../store/scorecardStore';

export interface BallPayload {
  runs?: number;
  isWicket?: boolean;
  extras?: { runs?: number };
  ballText?: string;
}

export interface OverCompletePayload {
  newOverCount?: number;
}

export interface WebSocketPacket {
  id?: string;
  type: 'BALL_BOWLED' | 'OVER_COMPLETE' | string;
  payload?: BallPayload & OverCompletePayload;
}

export class ScorecardIngestion {
  private store: ScorecardStore;
  private buffer: WebSocketPacket[];
  private rafId: number | null;
  private isFlushing: boolean;
  public processedIds: Set<string>;
  private maxHistorySize: number;

  constructor(store: ScorecardStore) {
    this.store = store;
    this.buffer = [];
    this.rafId = null;
    this.isFlushing = false;
    this.processedIds = new Set<string>();
    this.maxHistorySize = 100;
  }

  public handleMessage = (event: MessageEvent): void => {
    try {
      const rawData: WebSocketPacket = JSON.parse(event.data);
      
      if (rawData.id) {
        if (this.processedIds.has(rawData.id)) return;
        this.processedIds.add(rawData.id);
        
        if (this.processedIds.size > this.maxHistorySize) {
          const firstItem = this.processedIds.values().next().value;
          if (firstItem !== undefined) {
            this.processedIds.delete(firstItem);
          }
        }
      }

      this.buffer.push(rawData);

      if (!this.isFlushing) {
        this.isFlushing = true;
        this.rafId = requestAnimationFrame(this.flushBatch);
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  };

  private flushBatch = (): void => {
    if (this.buffer.length === 0) {
      this.isFlushing = false;
      return;
    }

    const currentState = this.store.getState();

    const nextVolatileState = this.buffer.reduce<VolatileState>((acc, packet) => {
      try {
        return this.translateEvent(acc, packet);
      } catch (err) {
        console.error("Failed to translate packet:", packet, err);
        return acc;
      }
    }, { ...currentState.volatile });

    this.store.setState({ volatile: nextVolatileState });

    this.buffer = [];
    this.isFlushing = false;
  };

  private translateEvent(volatileState: VolatileState, packet: WebSocketPacket): VolatileState {
    switch (packet.type) {
      case 'BALL_BOWLED': {
        const { runs, isWicket, extras, ballText } = packet.payload || {};
        
        const runVal = typeof runs === 'number' ? runs : 0;
        const extraRuns = extras?.runs || 0;
        
        const newScore = volatileState.score + runVal + extraRuns;
        const newWickets = isWicket ? volatileState.wickets + 1 : volatileState.wickets;
        const updatedTimeline = ballText ? [...volatileState.currentOverTimeline, ballText] : volatileState.currentOverTimeline;

        return {
          ...volatileState,
          score: newScore,
          wickets: newWickets,
          currentOverTimeline: updatedTimeline,
        };
      }
      
      case 'OVER_COMPLETE': {
        const newOverCount = packet.payload?.newOverCount ?? volatileState.overs;
        return {
          ...volatileState,
          overs: newOverCount,
          currentOverTimeline: [], 
        };
      }

      default:
        return volatileState;
    }
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.buffer = [];
    this.processedIds.clear();
    this.isFlushing = false;
  }
}