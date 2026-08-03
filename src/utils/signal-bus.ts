import type { ChaosEventId, SignalState } from '@/systems/chaos/types';

/**
 * Strongly-typed global event bus.
 *
 * Rendering systems (ASCII field, TV scene, audio) communicate through this
 * instead of React state, so high-frequency signals never trigger re-renders.
 */
export interface SignalEventMap {
  /** TV section wants the ASCII field to converge onto the screen rect. */
  'tv:absorb': { rect: DOMRect | null };
  /** TV section releases the ASCII field back to the page. */
  'tv:release': undefined;
  /** A channel became active. */
  'tv:channel': { id: string; index: number };
  /** TV power state changed. */
  'tv:power': { on: boolean };
  /** Chaos director fired an anomaly. */
  'chaos:event': { id: ChaosEventId; magnitude: 'micro' | 'medium' | 'major' };
  /** Global signal state transition. */
  'chaos:state': { state: SignalState; entropy: number };
  /** Stabilise mode toggled. */
  'system:stabilise': { enabled: boolean };
  /** Audio enabled state toggled. */
  'system:audio': { enabled: boolean };
  /** A one-shot sound request. */
  'audio:play': { cue: string };
  /** Console requests navigation. */
  'console:navigate': { path: string };
  /** Hidden narrative progression. */
  'narrative:unlock': { key: string };
}

export type SignalEventName = keyof SignalEventMap;

type Handler<K extends SignalEventName> = (payload: SignalEventMap[K]) => void;

class SignalBus {
  private handlers = new Map<SignalEventName, Set<Handler<SignalEventName>>>();

  on<K extends SignalEventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<SignalEventName>);
    return () => {
      set?.delete(handler as Handler<SignalEventName>);
    };
  }

  emit<K extends SignalEventName>(
    event: K,
    ...args: SignalEventMap[K] extends undefined ? [] : [SignalEventMap[K]]
  ): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    const payload = args[0] as SignalEventMap[K];
    for (const handler of set) {
      try {
        (handler as Handler<K>)(payload);
      } catch (error) {
        console.error(`[signal-bus] handler for "${String(event)}" threw`, error);
      }
    }
  }

  /** Removes every listener. Used by tests. */
  clear(): void {
    this.handlers.clear();
  }
}

export const signalBus = new SignalBus();
