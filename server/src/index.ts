import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createAgentStore } from './agent/store.js';
import { proposeAutopilot, proposeRunPlan, shouldGateForApproval } from './agent/llm.js';
import { startAutopilotScheduler } from './agent/scheduler.js';
import type { AgentCommand, Autopilot, Message } from './agent/types.js';

interface Channel {
  id: string;
  name: string;
}

const channels: Channel[] = [
  { id: 'general', name: 'general' },
  { id: 'engineering', name: 'engineering' },
  { id: 'design', name: 'design' },
  { id: 'random', name: 'random' },
];

const messages: Message[] = [];

function pushMessage(message: Message) {
  messages.push(message);
  broadcast({ type: 'new_message', message });
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const server = app.listen(PORT, () => {
  console.log(`\n  🚀 Slack Demo Server running on http://localhost:${PORT}\n`);
});

const wss = new WebSocketServer({ server });
const clients = new Set<WebSocket>();

const agentStore = createAgentStore({
  publishMessage: pushMessage,
  publishRun: (run) => broadcast({ type: 'run_upsert', run }),
  publishAutopilot: (autopilot) => {
    broadcast({ type: 'autopilot_upsert', autopilot });
    broadcast({ type: 'autopilot_created', autopilot });
  },
  publishRunsIndex: (runs) => broadcast({ type: 'runs_index', runs }),
});

type ExecutionState = {
  steps: string[];
  currentStep: number;
  summary: string;
  command: AgentCommand;
  approvalReason?: string;
  conciseMode?: boolean;
};

const executions = new Map<string, ExecutionState>();

function buildRunDeliverable(runTitle: string, summary: string) {
  const normalizedSummary = summary.trim();
  const escapedTitle = runTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const redundantTitlePattern = new RegExp(`^(?:\\*\\*${escapedTitle}\\*\\*|#\\s+${escapedTitle}|##\\s+${escapedTitle})\\s*\\n+`, 'i');
  const cleanedSummary = normalizedSummary.replace(redundantTitlePattern, '');
  return [`## ${runTitle}`, '', cleanedSummary].join('\n').trim();
}

function isTodoIntent(text: string) {
  return /\b(to-?do|todo|action items?|tasks?|next steps?)\b/i.test(text);
}

function getContainerLabel(container: { type: 'channel' | 'dm'; id: string }) {
  return container.type === 'channel' ? `#${container.id}` : container.id;
}

function getRunTitle(commandText: string, fallbackTitle: string) {
  if (isTodoIntent(commandText)) return 'To-do list';
  return fallbackTitle;
}

function getDeliverableTitle(run: { title: string; container: { type: 'channel' | 'dm'; id: string } }, commandText: string) {
  if (isTodoIntent(commandText)) {
    return `To-Do's from ${getContainerLabel(run.container)}`;
  }
  return run.title;
}

function isSimpleSummaryTask(text: string, outputFormat: AgentCommand['outputFormat']) {
  if (outputFormat === 'pr') return false;
  const normalized = text.toLowerCase().trim();
  const summaryIntent =
    /\b(summarize|summarise|summary|recap|brief|tl;dr|digest)\b/.test(normalized) ||
    normalized.startsWith('summarize') ||
    normalized.startsWith('summary');
  const complexIntent = /\b(compare|deep|analy[sz]e|investigate|multi-step|plan)\b/.test(normalized);
  return summaryIntent && !complexIntent;
}

function seed() {
  const now = Date.now();
  const m = 60_000;
  const seedMessages: Message[] = [
    { id: 'seed-1', channelId: 'general', userId: 'alice', text: 'Hey everyone! Welcome to the new workspace.', ts: now - 30 * m, isBot: false, kind: 'message' },
    { id: 'seed-2', channelId: 'general', userId: 'bob', text: 'Thanks Alice! Excited to be here.', ts: now - 28 * m, isBot: false, kind: 'message' },
    { id: 'seed-3', channelId: 'general', userId: 'workspace-agent', text: 'Hi team, mention @Agent or use /agent for run-based help.', ts: now - 25 * m, isBot: true, kind: 'message' },
    { id: 'seed-4', channelId: 'general', userId: 'charlie', text: 'Does anyone know when the design review is?', ts: now - 20 * m, isBot: false, kind: 'message' },
    { id: 'seed-5', channelId: 'general', userId: 'alice', text: "It's Thursday at 2pm!", ts: now - 18 * m, isBot: false, parentId: 'seed-4', kind: 'message' },
    { id: 'seed-10', channelId: 'engineering', userId: 'bob', text: 'Merged the auth refactor PR. All tests passing.', ts: now - 45 * m, isBot: false, kind: 'message' },
    { id: 'seed-11', channelId: 'engineering', userId: 'charlie', text: "Nice, I'll pull and test the integration.", ts: now - 40 * m, isBot: false, parentId: 'seed-10', kind: 'message' },
    { id: 'seed-20', channelId: 'design', userId: 'alice', text: 'New component library is ready for review in Figma.', ts: now - 60 * m, isBot: false, kind: 'message' },
    { id: 'seed-30', channelId: 'random', userId: 'bob', text: 'Who wants coffee?', ts: now - 120 * m, isBot: false, kind: 'message' },
  ];
  messages.push(...seedMessages);
}

seed();

function broadcast(data: unknown) {
  const payload = JSON.stringify(data);
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  }
}

const InjectSchema = z.object({
  channelId: z.string(),
  userId: z.string(),
  text: z.string(),
  isBot: z.boolean().optional().default(false),
  parentId: z.string().optional(),
});

const AgentCommandSchema = z.object({
  text: z.string().min(1),
  container: z.object({ type: z.enum(['channel', 'dm']), id: z.string() }),
  inThread: z.object({ threadId: z.string(), runId: z.string().optional() }).optional(),
  contextMessages: z.array(z.string()).optional(),
  scope: z.object({
    channel: z.boolean().optional(),
    thread: z.boolean().optional(),
    messages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    people: z.array(z.string()).optional(),
  }),
  tools: z.object({ drive: z.boolean(), calendar: z.boolean(), codebase: z.boolean() }),
  outputFormat: z.enum(['brief', 'checklist', 'doc', 'pr']),
  requireApproval: z.boolean(),
  asAutopilot: z.boolean().optional(),
});

const AutopilotSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  instruction: z.string(),
  cadence: z.object({
    kind: z.enum(['daily', 'weekday', 'weekly', 'hourly', 'custom']),
    hour: z.number().optional(),
    minute: z.number().optional(),
    dow: z.array(z.number()).optional(),
    tz: z.string(),
    everyMinutes: z.number().optional(),
  }),
  destination: z.object({ type: z.enum(['channel', 'dm']), id: z.string() }),
  scope: z.object({
    channel: z.boolean().optional(),
    thread: z.boolean().optional(),
    messages: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    people: z.array(z.string()).optional(),
  }),
  tools: z.object({ drive: z.boolean(), calendar: z.boolean(), codebase: z.boolean() }),
  outputFormat: z.enum(['brief', 'checklist', 'doc', 'pr']),
  delivery: z.object({ mode: z.enum(['digest', 'verbose']) }),
  enabled: z.boolean(),
  history: z.array(z.object({ runId: z.string(), at: z.number() })).optional(),
  lastRunAt: z.number().optional(),
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(
    JSON.stringify({
      type: 'init',
      channels,
      messages,
      runs: agentStore.listRuns(),
      autopilots: agentStore.listAutopilots(),
    })
  );

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'send_message') {
        pushMessage({
          id: randomUUID(),
          channelId: data.channelId,
          userId: data.userId || 'you',
          text: data.text,
          ts: Date.now(),
          isBot: false,
          parentId: data.parentId,
          kind: data.kind || 'message',
          runId: data.runId,
        });
      }
      if (data.type === 'typing') {
        broadcast({
          type: 'typing',
          userId: data.userId || 'you',
          channelId: data.channelId,
          parentId: data.parentId,
        });
      }
    } catch {
      // ignore malformed ws payload
    }
  });

  ws.on('close', () => clients.delete(ws));
});

function scheduleRunProgress(runId: string) {
  const state = executions.get(runId);
  const run = agentStore.getRun(runId);
  if (!state || !run) return;
  if (run.status === 'paused' || run.status === 'stopped' || run.status === 'failed') return;

  const at = state.currentStep;
  if (at >= state.steps.length) {
    const deliverableTitle = getDeliverableTitle(run, state.command.text);
    const deliverableBody = buildRunDeliverable(deliverableTitle, state.summary);
    agentStore.appendDeliverableMessage({
      channelId: run.container.id,
      threadRootId: run.threadId,
      body: deliverableBody,
      runId: run.id,
      artifactLinks: [{ label: 'Open Canvas', targetId: run.id }],
    });
    agentStore.updateRun(run.id, {
      status: 'completed',
      progressPct: 100,
      latestUpdate: `Delivered: ${run.title}`,
    });
    executions.delete(run.id);
    return;
  }

  broadcast({ type: 'typing', userId: 'workspace-agent', channelId: run.container.id, parentId: run.threadId });
  setTimeout(() => {
    const currentRun = agentStore.getRun(run.id);
    const currentState = executions.get(run.id);
    if (!currentRun || !currentState) return;
    if (currentRun.status === 'paused' || currentRun.status === 'stopped' || currentRun.status === 'failed') return;

    const step = currentState.steps[currentState.currentStep];
    if (!currentState.conciseMode) {
      agentStore.appendThreadMessage({
        channelId: currentRun.container.id,
        parentId: currentRun.threadId,
        text: `Step ${currentState.currentStep + 1}: ${step}`,
        runId: currentRun.id,
      });
    }

    currentState.currentStep += 1;
    const nextPct = Math.min(95, Math.floor((currentState.currentStep / currentState.steps.length) * 100));
    agentStore.updateRun(currentRun.id, {
      status: 'running',
      progressPct: nextPct,
      latestUpdate: currentState.conciseMode ? 'Preparing summary deliverable...' : step,
    });

    const shouldPause =
      currentState.currentStep >= 1 &&
      shouldGateForApproval(currentState.command.text, currentState.steps, currentState.command.requireApproval);

    if (shouldPause && currentRun.status !== 'needs_approval' && currentRun.approval?.pending !== false) {
      agentStore.updateRun(currentRun.id, {
        status: 'needs_approval',
        latestUpdate: 'Waiting for approval',
        approval: {
          required: true,
          pending: true,
          reason: currentState.approvalReason || 'Run includes risky actions.',
        },
      });
      agentStore.appendThreadMessage({
        channelId: currentRun.container.id,
        parentId: currentRun.threadId,
        text: `Approval gate: ${currentState.approvalReason || 'This plan requires approval.'} Use Approve or Deny.`,
        runId: currentRun.id,
      });
      return;
    }

    setTimeout(() => scheduleRunProgress(currentRun.id), 1_100);
  }, 700);
}

async function startRun(command: AgentCommand, opts?: { autopilotId?: string; runId?: string }) {
  const plan = await proposeRunPlan(command, {
    channelName: command.container.id,
    threadText: (command.contextMessages || []).join('\n'),
  });
  const conciseMode = isSimpleSummaryTask(command.text, command.outputFormat);
  const steps = conciseMode ? ['Gathering context', 'Composing concise summary'] : plan.steps;
  const runTitle = getRunTitle(command.text, plan.title);

  let runId = opts?.runId;
  if (!runId) {
    const rootMessageId = randomUUID();
    const run = agentStore.createRun({
      title: runTitle,
      createdBy: 'you',
      container: command.container,
      rootMessageId,
      threadId: rootMessageId,
      autopilotId: opts?.autopilotId,
    });
    runId = run.id;
    agentStore.createRunCardMessage(run);
  }

  const run = agentStore.getRun(runId);
  if (!run) throw new Error('Run not found');

  agentStore.updateRun(run.id, {
    title: run.title || runTitle,
    status: 'running',
    progressPct: 0,
    latestUpdate: conciseMode ? 'Preparing summary deliverable...' : 'Run started',
    artifacts: plan.artifacts,
    approval: {
      required: command.requireApproval || plan.needsApproval,
      pending: command.requireApproval || plan.needsApproval,
      reason: plan.approvalReason,
    },
  });

  if (!conciseMode) {
    agentStore.appendThreadMessage({
      channelId: run.container.id,
      parentId: run.threadId,
      text: `Starting run: ${plan.title}`,
      runId: run.id,
    });
  }

  executions.set(run.id, {
    steps,
    currentStep: 0,
    summary: plan.summary,
    command,
    approvalReason: plan.approvalReason,
    conciseMode,
  });
  scheduleRunProgress(run.id);
  return run;
}

app.post('/inject', (req, res) => {
  const result = InjectSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }
  const msg: Message = {
    id: randomUUID(),
    channelId: result.data.channelId,
    userId: result.data.userId,
    text: result.data.text,
    ts: Date.now(),
    isBot: result.data.isBot,
    parentId: result.data.parentId,
    kind: 'message',
  };
  pushMessage(msg);
  res.json({ ok: true, message: msg });
});

app.post('/agent/command', async (req, res) => {
  const parsed = AgentCommandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const command = parsed.data as AgentCommand;
    const continueRunId = command.inThread?.runId;
    const run = await startRun(command, { runId: continueRunId });
    res.json({ ok: true, run });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

app.post('/agent/autopilot/preview', async (req, res) => {
  const parsed = AgentCommandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const draft = await proposeAutopilot(parsed.data as AgentCommand);
  res.json({ ok: true, autopilot: draft });
});

app.post('/agent/autopilot', (req, res) => {
  const parsed = AutopilotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const autopilot: Autopilot = {
    ...parsed.data,
    id: randomUUID(),
    history: parsed.data.history || [],
    enabled: true,
  };
  agentStore.upsertAutopilot(autopilot);
  res.json({ ok: true, autopilot });
});

app.patch('/agent/autopilot/:id', (req, res) => {
  const id = req.params.id;
  const current = agentStore.getAutopilot(id);
  if (!current) {
    res.status(404).json({ error: 'Autopilot not found' });
    return;
  }
  const next = { ...current, ...req.body };
  const parsed = AutopilotSchema.safeParse(next);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = agentStore.patchAutopilot(id, parsed.data);
  res.json({ ok: true, autopilot: updated });
});

app.post('/agent/autopilot/:id/run', async (req, res) => {
  const autopilot = agentStore.getAutopilot(req.params.id);
  if (!autopilot) {
    res.status(404).json({ error: 'Autopilot not found' });
    return;
  }
  const command: AgentCommand = {
    text: autopilot.instruction,
    container: autopilot.destination,
    scope: autopilot.scope,
    tools: autopilot.tools,
    outputFormat: autopilot.outputFormat,
    requireApproval: false,
  };
  const run = await startRun(command, { autopilotId: autopilot.id });
  const history = [...autopilot.history, { runId: run.id, at: Date.now() }];
  agentStore.patchAutopilot(autopilot.id, { history, lastRunAt: Date.now() });
  res.json({ ok: true, run });
});

app.post('/agent/run/:id/approve', (req, res) => {
  const id = req.params.id;
  const decision = req.body?.decision;
  const run = agentStore.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  if (decision === 'deny') {
    agentStore.updateRun(run.id, {
      status: 'failed',
      latestUpdate: 'Denied',
      approval: { required: true, pending: false, reason: run.approval?.reason },
    });
    agentStore.appendThreadMessage({
      channelId: run.container.id,
      parentId: run.threadId,
      text: 'Approval denied. Run stopped.',
      runId: run.id,
    });
    executions.delete(run.id);
    res.json({ ok: true, run: agentStore.getRun(run.id) });
    return;
  }

  agentStore.updateRun(run.id, {
    status: 'running',
    latestUpdate: 'Approval granted, resuming',
    approval: { required: true, pending: false, reason: run.approval?.reason },
  });
  agentStore.appendThreadMessage({
    channelId: run.container.id,
    parentId: run.threadId,
    text: 'Approval granted. Continuing run.',
    runId: run.id,
  });
  setTimeout(() => scheduleRunProgress(run.id), 500);
  res.json({ ok: true, run: agentStore.getRun(run.id) });
});

app.post('/agent/run/:id/control', (req, res) => {
  const id = req.params.id;
  const action = req.body?.action;
  const run = agentStore.getRun(id);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (action === 'pause') {
    agentStore.updateRun(id, { status: 'paused', latestUpdate: 'Paused by user' });
  } else if (action === 'stop') {
    agentStore.updateRun(id, { status: 'stopped', latestUpdate: 'Stopped by user' });
    executions.delete(id);
  } else if (action === 'resume') {
    agentStore.updateRun(id, { status: 'running', latestUpdate: 'Resumed' });
    setTimeout(() => scheduleRunProgress(id), 500);
  } else {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }
  res.json({ ok: true, run: agentStore.getRun(id) });
});

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    channels: channels.length,
    messages: messages.length,
    runs: agentStore.listRuns().length,
    autopilots: agentStore.listAutopilots().length,
    clients: clients.size,
  });
});

startAutopilotScheduler({
  listAutopilots: () => agentStore.listAutopilots(),
  onDueAutopilot: async (autopilot) => {
    if (!autopilot.enabled) return;
    const command: AgentCommand = {
      text: autopilot.instruction,
      container: autopilot.destination,
      scope: autopilot.scope,
      tools: autopilot.tools,
      outputFormat: autopilot.outputFormat,
      requireApproval: false,
    };
    const run = await startRun(command, { autopilotId: autopilot.id });
    const history = [...autopilot.history, { runId: run.id, at: Date.now() }];
    agentStore.patchAutopilot(autopilot.id, { history, lastRunAt: Date.now() });
  },
});
