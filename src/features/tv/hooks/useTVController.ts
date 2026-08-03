import { useCallback, useEffect, useState } from 'react';
import { ChannelManager } from '../channels/ChannelManager';
import { createContactChannel } from '../channels/contact-channel';
import { createOperatorChannel } from '../channels/operator-channel';
import { createRecordsChannel } from '../channels/records-channel';
import { createSelfImageChannel } from '../channels/self-image-channel';
import { createStaticChannel } from '../channels/static-channel';
import { createUnlistedChannel } from '../channels/unlisted-channel';
import { TVStore, type ChannelDescriptor } from '../state/tv-store';
import type { TVSnapshot } from '../types';

/**
 * The receiver's channel table.
 *
 * This is where every piece of personal information in the site lives —
 * not in the page. The order here must match the registration order below,
 * because the store addresses channels by index and the manager by position.
 */
export const CHANNEL_TABLE: readonly ChannelDescriptor[] = [
  { id: 'ch-00', label: 'CH-00 · STATIC' },
  { id: 'ch-01', label: 'CH-01 · OPERATOR' },
  { id: 'ch-02', label: 'CH-02 · RECORDS' },
  { id: 'ch-03', label: 'CH-03 · CONTACT' },
  { id: 'ch-04', label: 'CH-04 · SELF IMAGE' },
  { id: 'ch-unlisted', label: 'CH-?? · UNLISTED', unlisted: true },
];

export interface TVController {
  manager: ChannelManager;
  store: TVStore;
}

interface ControllerOptions {
  width: number;
  height: number;
  /** Called the first time the viewer lands on the unlisted channel. */
  onDiscoverUnlisted: () => void;
}

function createController({
  width,
  height,
  onDiscoverUnlisted,
}: ControllerOptions): TVController {
  const manager = new ChannelManager({ width, height });
  const store = new TVStore(CHANNEL_TABLE.map((channel) => ({ ...channel })));

  manager.register(createStaticChannel());
  manager.register(createOperatorChannel());
  manager.register(createRecordsChannel());
  manager.register(createContactChannel());
  manager.register(createSelfImageChannel());
  manager.register(
    createUnlistedChannel(() => {
      store.unlockUnlisted();
      onDiscoverUnlisted();
    }),
  );

  manager.activate(0);
  return { manager, store };
}

/**
 * Owns the television's runtime objects.
 *
 * They are created inside an effect rather than during render so that a
 * StrictMode remount produces a fresh, fully-registered pair instead of
 * reusing a disposed one.
 */
export function useTVController(options: ControllerOptions): {
  controller: TVController | null;
  snapshot: TVSnapshot | null;
} {
  const { width, height, onDiscoverUnlisted } = options;
  const [controller, setController] = useState<TVController | null>(null);
  const [snapshot, setSnapshot] = useState<TVSnapshot | null>(null);

  const discover = useCallback(() => onDiscoverUnlisted(), [onDiscoverUnlisted]);

  useEffect(() => {
    const next = createController({ width, height, onDiscoverUnlisted: discover });
    setController(next);
    setSnapshot(next.store.getSnapshot());

    const unsubscribe = next.store.subscribe((value) => {
      setSnapshot(value);
      // The canvas follows the store, never the other way round.
      next.manager.activateById(value.channelId);
    });

    return () => {
      unsubscribe();
      next.store.dispose();
      next.manager.dispose();
      setController(null);
      setSnapshot(null);
    };
  }, [width, height, discover]);

  return { controller, snapshot };
}
