// src/ingestion/socketIngestion.ts
import type { ScorecardStore, VolatileState } from '../store/scorecardStore';

// Standard cricket rule: an innings ends once 10 wickets have fallen.
export const MAX_WICKETS = 10;

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
  type: 'BALL_BOWLED' | 'OVER_COMPLETE' | 'START_SECOND_INNINGS' | string;
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
    const oversLimit = currentState.metadata.oversLimit ?? null;

    const nextVolatileState = this.buffer.reduce<VolatileState>((acc, packet) => {
      try {
        return this.translateEvent(acc, packet, oversLimit);
      } catch (err) {
        console.error("Failed to translate packet:", packet, err);
        return acc;
      }
    }, { ...currentState.volatile });

    this.store.setState({ volatile: nextVolatileState });

    this.buffer = [];
    this.isFlushing = false;
  };

  private translateEvent(volatileState: VolatileState, packet: WebSocketPacket, oversLimit: number | null): VolatileState {
    // Starting the second innings is the one valid transition out of a
    // completed innings — handle it before the completion guard below.
    // Only valid once, right after the first innings ends; ignored if
    // we're not in that exact state (already in innings 2, duplicate
    // packet, or the first innings isn't actually over yet).
    if (packet.type === 'START_SECOND_INNINGS') {
      if (volatileState.innings !== 1 || !volatileState.inningsComplete) {
        return volatileState;
      }
      return {
        score: 0,
        wickets: 0,
        overs: 0,
        currentOverTimeline: [],
        inningsComplete: false,
        inningsCompleteReason: null,
        innings: 2,
        // The chasing team needs one more run than the first innings scored.
        target: volatileState.score + 1,
      };
    }

    // Once the innings is marked complete, ignore all further packets.
    // Protects against a real feed that keeps sending events after the
    // 10th wicket, the overs limit, or the target — late or duplicate
    // packets can't reopen a finished innings or match.
    if (volatileState.inningsComplete) {
      return volatileState;
    }

    switch (packet.type) {
      case 'BALL_BOWLED': {
        const { runs, isWicket, extras, ballText } = packet.payload || {};
        
        const runVal = typeof runs === 'number' ? runs : 0;
        const extraRuns = extras?.runs || 0;
        
        const newScore = volatileState.score + runVal + extraRuns;
        const newWicketsRaw = isWicket ? volatileState.wickets + 1 : volatileState.wickets;
        const updatedTimeline = ballText ? [...volatileState.currentOverTimeline, ballText] : volatileState.currentOverTimeline;

        const isAllOut = newWicketsRaw >= MAX_WICKETS;
        // In the second innings, reaching the target ends the match right
        // away — even mid-over — unlike all_out/overs_completed, which can
        // only be detected at their natural boundaries.
        const isTargetReached =
          volatileState.innings === 2 && volatileState.target != null && newScore >= volatileState.target;

        const isComplete = isAllOut || isTargetReached;
        const reason: VolatileState['inningsCompleteReason'] = isTargetReached
          ? 'target_reached'
          : isAllOut
          ? 'all_out'
          : volatileState.inningsCompleteReason;

        return {
          ...volatileState,
          score: newScore,
          // Cap the displayed count at 10 even if a feed somehow sends
          // more wicket events than a real innings allows.
          wickets: Math.min(newWicketsRaw, MAX_WICKETS),
          currentOverTimeline: updatedTimeline,
          inningsComplete: isComplete,
          inningsCompleteReason: reason,
        };
      }
      
      case 'OVER_COMPLETE': {
        const newOverCount = packet.payload?.newOverCount ?? volatileState.overs;
        const isOversLimitReached = oversLimit != null && newOverCount >= oversLimit;

        return {
          ...volatileState,
          // Never display more than the configured overs limit, even if
          // the feed sends one extra OVER_COMPLETE past the limit.
          overs: isOversLimitReached ? oversLimit! : newOverCount,
          currentOverTimeline: [], 
          inningsComplete: isOversLimitReached,
          inningsCompleteReason: isOversLimitReached ? 'overs_completed' : volatileState.inningsCompleteReason,
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