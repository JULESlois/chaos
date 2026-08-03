import { logs } from '@/content/logs';
import { profile } from '@/content/profile';
import { projects } from '@/content/projects';

export type ConsoleLineKind = 'input' | 'output' | 'error' | 'success' | 'anomaly';

export interface ConsoleLine {
  id: number;
  kind: ConsoleLineKind;
  text: string;
}

export interface CommandContext {
  navigate: (path: string) => void;
  setStabilised: (enabled: boolean) => void;
  setAudioEnabled: (enabled: boolean) => void;
  unlock: (key: string) => void;
  hasUnlocked: (key: string) => boolean;
  close: () => void;
  clear: () => void;
  entropy: number;
  signalState: string;
  stabilised: boolean;
  audioEnabled: boolean;
  totalFired: number;
  /** Incremented every time the hidden `observe` command runs. */
  observerCount: number;
  bumpObserverCount: () => number;
}

export interface CommandResult {
  lines: string[];
  kind?: ConsoleLineKind;
}

export interface CommandDefinition {
  name: string;
  summary: string;
  hidden?: boolean;
  run: (args: string[], context: CommandContext) => CommandResult;
}

const HELP_ORDER = [
  'help',
  'whoami',
  'archive',
  'logs',
  'contact',
  'entropy',
  'stabilize',
  'audio',
  'clear',
  'exit',
];

export const COMMANDS: CommandDefinition[] = [
  {
    name: 'help',
    summary: 'list available commands',
    run: () => ({
      lines: [
        'AVAILABLE COMMANDS',
        ...HELP_ORDER.map((name) => {
          const command = COMMANDS.find((candidate) => candidate.name === name);
          return command ? `  ${command.name.padEnd(12)} ${command.summary}` : '';
        }).filter(Boolean),
        '',
        'Navigation is also available from the header menu.',
      ],
    }),
  },
  {
    name: 'whoami',
    summary: 'print operator record',
    run: () => ({
      lines: [
        `operator : ${profile.displayName}`,
        `callsign : ${profile.callsign}`,
        `role     : ${profile.role}`,
        `status   : ${profile.status}`,
        `node     : ${profile.nodeId}`,
        `location : ${profile.location}`,
      ],
    }),
  },
  {
    name: 'archive',
    summary: 'list archive records, or open one by slug',
    run: (args, context) => {
      const [slug] = args;
      if (slug) {
        const record = projects.find((project) => project.slug === slug);
        if (!record) {
          return { kind: 'error', lines: [`no record matches "${slug}"`] };
        }
        context.navigate(`/archive/${record.slug}`);
        context.close();
        return { kind: 'success', lines: [`opening ${record.id} — ${record.title}`] };
      }

      context.navigate('/archive');
      return {
        lines: [
          'ARCHIVE INDEX',
          ...projects.map(
            (project) =>
              `  ${project.id}  ${project.status.padEnd(10)} ${project.integrity
                .toString()
                .padStart(3)}%  ${project.slug}`,
          ),
          '',
          'usage: archive <slug>',
        ],
      };
    },
  },
  {
    name: 'logs',
    summary: 'list operator logs',
    run: (_args, context) => {
      context.navigate('/logs');
      return {
        lines: [
          'LOG DIRECTORY',
          ...logs.map((entry) => `  ${entry.date.padEnd(12)} ${entry.filename}`),
        ],
      };
    },
  },
  {
    name: 'contact',
    summary: 'print contact channels',
    run: () => ({
      lines: profile.contacts.map(
        (contact) => `${contact.label.padEnd(14)} ${contact.value}`,
      ),
    }),
  },
  {
    name: 'clear',
    summary: 'clear the console buffer',
    run: (_args, context) => {
      context.clear();
      return { lines: [] };
    },
  },
  {
    name: 'stabilize',
    summary: 'toggle stabilised interface mode',
    run: (args, context) => {
      const explicit = args[0];
      const next =
        explicit === 'on' ? true : explicit === 'off' ? false : !context.stabilised;
      context.setStabilised(next);
      return {
        kind: 'success',
        lines: [
          next
            ? 'interface stabilised — motion, anomalies and audio disabled'
            : 'stabilisation released — ambient systems resumed',
        ],
      };
    },
  },
  {
    name: 'entropy',
    summary: 'report current signal telemetry',
    run: (_args, context) => ({
      lines: [
        `entropy   : ${context.entropy.toFixed(3)}`,
        `state     : ${context.signalState}`,
        `anomalies : ${context.totalFired} since load`,
        `stabilised: ${context.stabilised ? 'yes' : 'no'}`,
      ],
    }),
  },
  {
    name: 'audio',
    summary: 'audio on | audio off',
    run: (args, context) => {
      const mode = args[0];
      if (mode !== 'on' && mode !== 'off') {
        return { kind: 'error', lines: ['usage: audio on | audio off'] };
      }
      if (mode === 'on' && context.stabilised) {
        return {
          kind: 'error',
          lines: ['audio is unavailable while the interface is stabilised'],
        };
      }
      context.setAudioEnabled(mode === 'on');
      return { kind: 'success', lines: [`audio ${mode}`] };
    },
  },
  {
    name: 'exit',
    summary: 'close the console',
    run: (_args, context) => {
      context.close();
      return { lines: [] };
    },
  },

  /* ── Hidden commands ──────────────────────────────────────── */
  {
    name: 'observe',
    summary: 'hidden',
    hidden: true,
    run: (_args, context) => {
      const count = context.bumpObserverCount();
      context.unlock('observer');
      if (count === 1) {
        return {
          kind: 'anomaly',
          lines: ['observation registered.', 'the archive observes back.'],
        };
      }
      if (count < 4) {
        return {
          kind: 'anomaly',
          lines: [`observation ${count} registered.`, 'you have been here before.'],
        };
      }
      return {
        kind: 'anomaly',
        lines: [
          `observation ${count} registered.`,
          'channel 04 is not listed in the receiver channel table.',
          'try: open /signal',
        ],
      };
    },
  },
  {
    name: 'trace',
    summary: 'hidden',
    hidden: true,
    run: (_args, context) => ({
      kind: 'anomaly',
      lines: [
        'TRACE — local session only. no data leaves this device.',
        `  route depth   : ${window.location.pathname}`,
        `  entropy       : ${context.entropy.toFixed(3)}`,
        `  anomalies     : ${context.totalFired}`,
        `  observer flag : ${context.hasUnlocked('observer') ? 'set' : 'unset'}`,
        '',
        'one record in the index has no origin timestamp.',
      ],
    }),
  },
  {
    name: 'open',
    summary: 'hidden',
    hidden: true,
    run: (args, context) => {
      const target = args[0];
      if (!target) {
        return { kind: 'error', lines: ['usage: open <path>'] };
      }
      if (target === '/signal' || target === 'signal') {
        context.unlock('signal');
        context.navigate('/signal');
        context.close();
        return { kind: 'anomaly', lines: ['opening unlisted route /signal'] };
      }
      if (target.startsWith('/')) {
        context.navigate(target);
        context.close();
        return { kind: 'success', lines: [`opening ${target}`] };
      }
      return { kind: 'error', lines: [`cannot open "${target}"`] };
    },
  },
  {
    name: 'show',
    summary: 'hidden',
    hidden: true,
    run: (args, context) => {
      if (args[0] !== 'missing') {
        return { kind: 'error', lines: ['usage: show missing'] };
      }
      context.unlock('missing');
      return {
        kind: 'anomaly',
        lines: [
          'RECORDS PRESENT IN INDEX BUT NOT IN SNAPSHOT',
          '  REC-004  ████████ TRANSMISSION   integrity 12%',
          '',
          'RECORDS PRESENT IN SNAPSHOT BUT NOT IN INDEX',
          '  REC-000  [name unreadable]        integrity ??',
        ],
      };
    },
  },
];

const COMMAND_MAP = new Map(COMMANDS.map((command) => [command.name, command]));

export interface ParsedCommand {
  name: string;
  args: string[];
}

/** Splits an input line into a command name and arguments. */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const parts = trimmed.split(/\s+/);
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

/**
 * Executes a console line. Never uses eval — commands are a fixed table.
 * Unknown commands always produce an explicit error.
 */
export function runCommand(input: string, context: CommandContext): CommandResult {
  const parsed = parseCommand(input);
  if (!parsed) return { lines: [] };

  // `observer --count` is a flag form of the hidden observe command.
  if (parsed.name === 'observer' && parsed.args[0] === '--count') {
    return {
      kind: 'anomaly',
      lines: [`observer sessions recorded: ${context.observerCount}`],
    };
  }

  const command = COMMAND_MAP.get(parsed.name);
  if (!command) {
    return {
      kind: 'error',
      lines: [
        `unknown command: ${parsed.name}`,
        'type "help" for the command list',
      ],
    };
  }

  return command.run(parsed.args, context);
}

/** Names offered by tab completion — hidden commands are excluded. */
export function completionCandidates(prefix: string): string[] {
  const lower = prefix.toLowerCase();
  return COMMANDS.filter(
    (command) => !command.hidden && command.name.startsWith(lower),
  ).map((command) => command.name);
}
