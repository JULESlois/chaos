/**
 * Content domain types.
 * Everything the site renders as "archive data" is typed here so that
 * replacing demo content never requires touching component code.
 */

export type RecordStatus = 'verified' | 'partial' | 'corrupted' | 'classified';

export interface ProjectEvidence {
  /** Short caption rendered beneath the procedural evidence frame. */
  caption: string;
  /** Deterministic seed used to draw the placeholder evidence graphic. */
  seed: number;
  /** Descriptive alt text for assistive technology. */
  alt: string;
}

export interface ProjectSection {
  heading: string;
  body: string[];
}

export interface ProjectRecord {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  type: string;
  year: number;
  status: RecordStatus;
  /** 0–100 completeness value used by the archive index. */
  integrity: number;
  summary: string;
  technologies: string[];
  responsibilities: string[];
  problem: string[];
  constraints: string[];
  process: ProjectSection[];
  implementation: ProjectSection[];
  evidence: ProjectEvidence[];
  outcome: string[];
  anomalies: string[];
  repositoryUrl?: string;
  demoUrl?: string;
}

export interface LogEntry {
  id: string;
  /** ISO date, or a masked string such as "??????-??-??" for anomalous entries. */
  date: string;
  filename: string;
  title: string;
  extension: 'md' | 'txt' | 'log';
  size: string;
  status: RecordStatus;
  excerpt: string;
  body: string[];
  /** Marks the entry as part of the hidden narrative branch. */
  restricted?: boolean;
}

export interface OperatorSkill {
  group: string;
  items: string[];
}

export interface OperatorTimelineEntry {
  period: string;
  role: string;
  organisation: string;
  detail: string;
}

export interface ContactLink {
  label: string;
  value: string;
  href: string;
}

export interface OperatorProfile {
  nodeId: string;
  callsign: string;
  displayName: string;
  role: string;
  status: string;
  location: string;
  summary: string[];
  heroLines: string[];
  skills: OperatorSkill[];
  tools: string[];
  timeline: OperatorTimelineEntry[];
  interests: string[];
  contacts: ContactLink[];
}
