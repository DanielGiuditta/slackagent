export type MessageKind = 'message' | 'run_card' | 'deliverable';

export interface DeliverableArtifactLink {
  label: string;
  targetId?: string;
  url?: string;
}

export interface Message {
  id: string;
  channelId: string;
  containerId?: string;
  userId: string;
  text: string;
  title?: string;
  body?: string;
  artifactLinks?: DeliverableArtifactLink[];
  ts: number;
  isBot: boolean;
  parentId?: string;
  threadRootId?: string;
  kind: MessageKind;
  runId?: string;
}

export type RunStatus =
  | 'queued'
  | 'running'
  | 'needs_approval'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

export interface Artifact {
  id: string;
  type: 'doc' | 'link' | 'pr' | 'canvas';
  title: string;
  url?: string;
}

export interface ApprovalState {
  required: boolean;
  reason?: string;
  pending: boolean;
}

export interface ScopeChips {
  channel?: boolean;
  thread?: boolean;
  messages?: string[];
  files?: string[];
  people?: string[];
}

export interface ToolToggles {
  drive: boolean;
  calendar: boolean;
  codebase: boolean;
}

export type OutputFormat = 'brief' | 'checklist' | 'doc' | 'pr';

export interface Run {
  id: string;
  title: string;
  createdAt: number;
  createdBy: string;
  container: { type: 'channel' | 'dm'; id: string };
  rootMessageId: string;
  threadId: string;
  status: RunStatus;
  progressPct: number;
  latestUpdate: string;
  artifacts: Artifact[];
  approval?: ApprovalState;
  autopilotId?: string;
}

export interface Cadence {
  kind: 'daily' | 'weekday' | 'weekly' | 'hourly' | 'custom';
  hour?: number;
  minute?: number;
  dow?: number[];
  tz: string;
  everyMinutes?: number;
}

export interface Autopilot {
  id: string;
  title: string;
  instruction: string;
  cadence: Cadence;
  destination: { type: 'channel' | 'dm'; id: string };
  scope: ScopeChips;
  tools: ToolToggles;
  outputFormat: OutputFormat;
  delivery: { mode: 'digest' | 'verbose' };
  enabled: boolean;
  history: { runId: string; at: number }[];
  lastRunAt?: number;
}

export interface AgentCommand {
  text: string;
  container: { type: 'channel' | 'dm'; id: string };
  inThread?: { threadId: string; runId?: string };
  contextMessages?: string[];
  scope: ScopeChips;
  tools: ToolToggles;
  outputFormat: OutputFormat;
  requireApproval: boolean;
  asAutopilot?: boolean;
}

export interface RunPlan {
  title: string;
  steps: string[];
  artifacts: Artifact[];
  needsApproval: boolean;
  approvalReason?: string;
  summary: string;
  nextQuestions?: string[];
}
