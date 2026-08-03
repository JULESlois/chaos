import { describe, expect, it, vi } from 'vitest';
import {
  completionCandidates,
  parseCommand,
  runCommand,
  type CommandContext,
} from './console-commands';

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  let observerCount = 0;
  return {
    navigate: vi.fn(),
    setStabilised: vi.fn(),
    setAudioEnabled: vi.fn(),
    unlock: vi.fn(),
    hasUnlocked: () => false,
    close: vi.fn(),
    clear: vi.fn(),
    entropy: 0.12,
    signalState: 'stable',
    stabilised: false,
    audioEnabled: false,
    totalFired: 0,
    get observerCount() {
      return observerCount;
    },
    bumpObserverCount: () => (observerCount += 1),
    ...overrides,
  };
}

describe('parseCommand', () => {
  it('splits a name from its arguments and lowercases the name', () => {
    expect(parseCommand('  OPEN  /signal  ')).toEqual({
      name: 'open',
      args: ['/signal'],
    });
  });

  it('treats an empty line as nothing at all', () => {
    expect(parseCommand('   ')).toBeNull();
  });
});

describe('unknown commands', () => {
  it('produce an explicit error rather than silence', () => {
    const result = runCommand('rm -rf /', createContext());

    expect(result.kind).toBe('error');
    expect(result.lines[0]).toContain('unknown command: rm');
    expect(result.lines.join(' ')).toContain('help');
  });

  it('never evaluate their input', () => {
    const context = createContext();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = runCommand('console.log("pwned")', context);

    expect(result.kind).toBe('error');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports the name the viewer actually typed', () => {
    expect(runCommand('helpp', createContext()).lines[0]).toBe(
      'unknown command: helpp',
    );
  });
});

describe('known commands', () => {
  it('lists itself through help', () => {
    const lines = runCommand('help', createContext()).lines.join('\n');
    expect(lines).toContain('archive');
    expect(lines).toContain('stabilize');
  });

  it('keeps hidden commands out of help and completion', () => {
    const lines = runCommand('help', createContext()).lines.join('\n');
    expect(lines).not.toContain('observe');
    expect(completionCandidates('o')).not.toContain('observe');
    expect(completionCandidates('a')).toEqual(['archive', 'audio']);
  });

  it('toggles stabilise mode through the context, not directly', () => {
    const context = createContext();
    const result = runCommand('stabilize on', context);

    expect(context.setStabilised).toHaveBeenCalledWith(true);
    expect(result.kind).toBe('success');
  });

  it('rejects a malformed argument instead of guessing', () => {
    const context = createContext();
    const result = runCommand('audio sideways', context);

    expect(result.kind).toBe('error');
    expect(result.lines[0]).toContain('usage:');
    expect(context.setAudioEnabled).not.toHaveBeenCalled();
  });

  it('refuses to enable audio while the interface is stabilised', () => {
    const context = createContext({ stabilised: true });
    const result = runCommand('audio on', context);

    expect(result.kind).toBe('error');
    expect(context.setAudioEnabled).not.toHaveBeenCalled();
  });

  it('navigates through the router rather than the location API', () => {
    const context = createContext();
    runCommand('open /archive', context);
    expect(context.navigate).toHaveBeenCalledWith('/archive');
  });
});

describe('hidden commands', () => {
  it('escalates the observe command the more it is used', () => {
    const context = createContext();

    expect(runCommand('observe', context).lines.join(' ')).toContain(
      'the archive observes back',
    );

    let last = '';
    for (let i = 0; i < 4; i += 1) {
      last = runCommand('observe', context).lines.join(' ');
    }

    expect(last).toContain('channel 04');
    expect(context.unlock).toHaveBeenCalledWith('observer');
  });
});
