import { useCallback, useEffect, useState } from 'react';
import { ChannelManager } from '../channels/ChannelManager';
import { createArchiveChannel } from '../channels/archive-channel';
import { createAsciiChannel } from '../channels/ascii-channel';
import { createBootChannel } from '../channels/boot-channel';
import { createDeadChannel } from '../channels/dead-channel';
import { createSignalChannel } from '../channels/signal-channel';
import { TVStore, type ChannelDescriptor } from '../state/tv-store';
import type { TVSnapshot } from '../types';

/**
 * The receiver's channel table.
 *
 * Declared statically so the store can exist before the channels do — the
 * boot and dead channels need a reference to the store in their callbacks.
 * The order here must match the registration order below.
 */
export const CHANNEL_TABLE: readonly ChannelDescriptor[] = [
  { id: 'ch-00', label: 'CH-00 · BOOT' },
  { id: 'ch-01', label: 'CH-01 · OBSERVER' },
  { id: 'ch-02', label: 'CH-02 · ARCHIVE' },
  { id: 'ch-03', label: 'CH-03 · FLOW' },
  { id: 'ch-04', label: 'CH-04 · ———', unlisted: true },
];

export interface TVController {
  manager: ChannelManager;
  store: TVStore;
}

interface ControllerOptions {
  width: number;
  height: number;
  /** Called the first time the viewer lands on the unlisted channel. */
  onDiscoverDeadChannel: () => void;
}

function createController({
  width,
  height,
  onDiscoverDeadChannel,
}: ControllerOptions): TVController {
  const manager = new ChannelManager({ width, height });
  const store = new TVStore(CHANNEL_TABLE.map((channel) => ({ ...channel })));

  manager.register(createBootChannel(() => store.requestChannel(1)));
  manager.register(createAsciiChannel());
  manager.register(createArchiveChannel());
  manager.register(createSignalChannel());
  manager.register(
    createDeadChannel(() => {
      store.unlockUnlisted();
      onDiscoverDeadChannel();
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
  const { width, height, onDiscoverDeadChannel } = options;
  const [controller, setController] = useState<TVController | null>(null);
  const [snapshot, setSnapshot] = useState<TVSnapshot | null>(null);

  const discover = useCallback(() => onDiscoverDeadChannel(), [onDiscoverDeadChannel]);

  useEffect(() => {
    const next = createController({ width, height, onDiscoverDeadChannel: discover });
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
