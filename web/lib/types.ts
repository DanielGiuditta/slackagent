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
  autopilotId?: string;
}

export interface DeliverableArtifactLink {
  label: string;
  targetId?: string;
  url?: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
  isBot: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type?: 'channel' | 'dm';
  isAgent?: boolean;
}

export interface TypingState {
  userId: string;
  channelId: string;
  parentId?: string;
}

export type MessageKind = 'message' | 'run_card' | 'deliverable';
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

export interface Canvas {
  id: string;
  title: string;
  body: string;
  lastUpdatedAt: number;
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
  requestedText?: string;
  createdAt: number;
  createdBy: string;
  container: { type: 'channel' | 'dm'; id: string };
  rootMessageId: string;
  threadId: string;
  status: RunStatus;
  stepCurrent?: number;
  stepTotal?: number;
  progressPct: number;
  latestUpdate: string;
  artifacts: Artifact[];
  approval?: ApprovalState;
  autopilotId?: string;
  scope?: ScopeChips;
  tools?: ToolToggles;
  outputFormat?: OutputFormat;
  requireApproval?: boolean;
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
  name: string;
  instruction: string;
  cadenceText: string;
  destinationType: 'dm' | 'channel';
  destinationId: string;
  scope: ScopeChips;
  tools: ToolToggles;
  outputFormat: OutputFormat;
  outputMode: 'threadRuns' | 'canvasPrimary';
  canvasId?: string;
  isPaused: boolean;
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

/* ─── WebSocket protocol ─── */

export type WSIncoming =
  | {
      type: 'init';
      channels: Channel[];
      users: UserProfile[];
      messages: Message[];
      runs: Run[];
      autopilots: Autopilot[];
    }
  | { type: 'new_message'; message: Message }
  | { type: 'typing'; userId: string; channelId: string; parentId?: string }
  | { type: 'run_upsert'; run: Run }
  | { type: 'autopilot_upsert'; autopilot: Autopilot }
  | { type: 'autopilot_created'; autopilot: Autopilot }
  | {
      type: 'runs_index';
      runs: Array<Pick<Run, 'id' | 'title' | 'status' | 'progressPct' | 'latestUpdate' | 'createdAt'>>;
    };

export type WSOutgoing =
  | {
      type: 'send_message';
      channelId: string;
      userId: string;
      text: string;
      parentId?: string;
      kind?: MessageKind;
      runId?: string;
    }
  | { type: 'typing'; channelId: string; userId: string; parentId?: string };
