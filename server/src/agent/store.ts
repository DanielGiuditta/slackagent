import { randomUUID } from 'crypto';
import type { Autopilot, Message, Run } from './types.js';

interface AgentStoreDeps {
  publishMessage: (message: Message) => void;
  publishRun: (run: Run) => void;
  publishAutopilot: (autopilot: Autopilot) => void;
  publishRunsIndex: (
    runs: Array<Pick<Run, 'id' | 'title' | 'status' | 'progressPct' | 'latestUpdate' | 'createdAt'>>
  ) => void;
}

interface CreateRunInput {
  title: string;
  createdBy: string;
  container: { type: 'channel' | 'dm'; id: string };
  rootMessageId: string;
  threadId: string;
  autopilotId?: string;
}

export function createAgentStore(deps: AgentStoreDeps) {
  const runs = new Map<string, Run>();
  const autopilots = new Map<string, Autopilot>();

  const emitRunsIndex = () => {
    const rows = Array.from(runs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, title, status, progressPct, latestUpdate, createdAt }) => ({
        id,
        title,
        status,
        progressPct,
        latestUpdate,
        createdAt,
      }));
    deps.publishRunsIndex(rows);
  };

  const createRun = (input: CreateRunInput): Run => {
    const run: Run = {
      id: randomUUID(),
      title: input.title,
      createdAt: Date.now(),
      createdBy: input.createdBy,
      container: input.container,
      rootMessageId: input.rootMessageId,
      threadId: input.threadId,
      status: 'queued',
      progressPct: 0,
      latestUpdate: 'Queued',
      artifacts: [],
      autopilotId: input.autopilotId,
    };
    runs.set(run.id, run);
    deps.publishRun(run);
    emitRunsIndex();
    return run;
  };

  const updateRun = (runId: string, patch: Partial<Run>): Run | null => {
    const current = runs.get(runId);
    if (!current) return null;
    const next = { ...current, ...patch };
    runs.set(runId, next);
    deps.publishRun(next);
    emitRunsIndex();
    return next;
  };

  const createRunCardMessage = (run: Run): Message => {
    const card: Message = {
      id: run.rootMessageId,
      channelId: run.container.id,
      userId: 'workspace-agent',
      text: run.title,
      ts: Date.now(),
      isBot: true,
      kind: 'run_card',
      runId: run.id,
    };
    deps.publishMessage(card);
    return card;
  };

  const appendThreadMessage = ({
    channelId,
    parentId,
    text,
    userId = 'workspace-agent',
    isBot = true,
    runId,
  }: {
    channelId: string;
    parentId: string;
    text: string;
    userId?: string;
    isBot?: boolean;
    runId?: string;
  }): Message => {
    const msg: Message = {
      id: randomUUID(),
      channelId,
      userId,
      text,
      ts: Date.now(),
      isBot,
      parentId,
      kind: 'message',
      runId,
    };
    deps.publishMessage(msg);
    return msg;
  };

  const appendDeliverableMessage = ({
    channelId,
    threadRootId,
    runId,
    body,
    title = 'Deliverable',
    artifactLinks,
  }: {
    channelId: string;
    threadRootId: string;
    runId: string;
    body: string;
    title?: string;
    artifactLinks?: Message['artifactLinks'];
  }): Message => {
    const msg: Message = {
      id: randomUUID(),
      channelId,
      containerId: channelId,
      userId: 'workspace-agent',
      text: body,
      title,
      body,
      artifactLinks,
      ts: Date.now(),
      isBot: true,
      threadRootId,
      kind: 'deliverable',
      runId,
    };
    deps.publishMessage(msg);
    return msg;
  };

  const upsertAutopilot = (autopilot: Autopilot) => {
    autopilots.set(autopilot.id, autopilot);
    deps.publishAutopilot(autopilot);
  };

  const patchAutopilot = (id: string, patch: Partial<Autopilot>): Autopilot | null => {
    const current = autopilots.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    autopilots.set(id, next);
    deps.publishAutopilot(next);
    return next;
  };

  return {
    createRun,
    updateRun,
    getRun: (id: string) => runs.get(id),
    listRuns: () => Array.from(runs.values()),
    createRunCardMessage,
    appendThreadMessage,
    appendDeliverableMessage,
    upsertAutopilot,
    patchAutopilot,
    getAutopilot: (id: string) => autopilots.get(id),
    listAutopilots: () => Array.from(autopilots.values()),
  };
}
