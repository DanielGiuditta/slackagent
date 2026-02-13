'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from '@/lib/store';
import type { Autopilot, Message, Run } from '@/lib/types';
import { AutopilotPreviewSheet } from './AutopilotPreviewSheet';
import { DeliverableCard } from './DeliverableCard';
import { RunCard } from './RunCard';
import { submitAgentCommand } from '@/lib/agentApi';

function emptyDraft(): Omit<Autopilot, 'id'> {
  return {
    name: 'New autopilot',
    instruction: 'Summarize key updates and action items from this chat.',
    cadenceText: 'Weekdays at 9:00 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    scope: { channel: true, thread: false, messages: [], files: [], people: [] },
    tools: { drive: false, calendar: false, codebase: true },
    outputFormat: 'brief',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: undefined,
    canvasId: undefined,
  };
}

const autopilotPriorityOrder = ['autopilot-decision-driver', 'autopilot-loop-closer', 'autopilot-early-warning'];
const hiddenSeedAutopilotIds = new Set([
  'autopilot-daily-meeting-prep',
  'autopilot-daily-focus-brief',
  'autopilot-industry-trends',
  'autopilot-team-metrics-dashboard',
]);
const requiredAutopilotRows: Autopilot[] = [
  {
    id: 'autopilot-decision-driver',
    name: 'Decision Driver',
    instruction: 'Identify one decision needed today from this chat and propose next steps.',
    cadenceText: 'Weekdays at 10:15 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    scope: { channel: true, thread: false, messages: [], files: [], people: [] },
    tools: { drive: false, calendar: false, codebase: true },
    outputFormat: 'brief',
    outputMode: 'threadRuns',
    isPaused: false,
  },
  {
    id: 'autopilot-loop-closer',
    name: 'Loop Closer',
    instruction: 'Find open loops in this chat and produce follow-up messages.',
    cadenceText: 'Weekdays at 1:00 PM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    scope: { channel: true, thread: false, messages: [], files: [], people: [] },
    tools: { drive: false, calendar: false, codebase: true },
    outputFormat: 'brief',
    outputMode: 'threadRuns',
    isPaused: false,
  },
  {
    id: 'autopilot-early-warning',
    name: 'Early Warning',
    instruction: 'Watch this chat for early warnings and suggest escalation language.',
    cadenceText: 'Every 2 hours',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    scope: { channel: true, thread: false, messages: [], files: [], people: [] },
    tools: { drive: false, calendar: false, codebase: true },
    outputFormat: 'brief',
    outputMode: 'threadRuns',
    isPaused: false,
  },
];

function formatRelativeLastUpdated(ts?: number) {
  if (!ts) return 'Never';
  const diffMs = Date.now() - ts;
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleString();
}

function seededAutopilotPreview(autopilotId: string) {
  if (autopilotId === 'autopilot-decision-driver') {
    return `# Decision Driver

## ⚡ Decision needed today: How should payouts behave when a bank hiccups?

**Why you should care:** This choice changes what customers experience. If we get it wrong, we create support tickets and confusion during launch week.

### ✅ Proposed decision
**Auto-retry a failed payout up to _3 times_** before showing "Failed."

### What this means in plain English
- More payouts will succeed automatically (fewer false failures).
- Some payouts may stay **Pending** a bit longer before we confirm "Failed."

### What you need to do next (2 minutes)
1) **Pick an owner** to watch customer impact after we ship
   _Who is watching "pending too long" and "payout failed" volume?_
2) **Confirm a rollback rule**
   _What metric tells us to revert, and who does it?_

### If we do not decide today
We ship with inconsistent behavior and end up debating during an incident window.

### Copy/paste message to send
> **To:** #eng-platform
> @Alex Park @Priya Iyer @Mateo Cruz
> Proposal: set payout auto-retries to **3** so temporary bank issues recover automatically.
> Before release gate, can we confirm:
> 1) who owns monitoring for **payout pending/delay**, and
> 2) the rollback trigger (metric + threshold + owner)?
> If no objections by **2pm**, I will record this as the decision.`;
  }
  if (autopilotId === 'autopilot-loop-closer') {
    return `# Loop Closer

## ✅ 3 loops to close before they turn into pings

**Why you should care:** These are small replies that prevent big headaches. Closing them now avoids last-minute churn, missed approvals, and awkward follow-ups.

### 1) Launch copy -> Legal review
**Why it matters:** If Legal does not review today, launch wording becomes a blocker.

**Do this:** Send the updated copy and ask for one Legal owner + a deadline.

> **To:** dm-priya
> I shared the updated launch copy with staged availability language.
> Who is the **Legal owner** for sign-off, and can they review by **2pm**?
> If helpful, I can summarize the changes in 3 bullets.

---

### 2) Redwood call prep (Sales)
**Why it matters:** Without guardrails, we risk over-promising on pricing/SLAs in the meeting.

**Do this:** Send the talk track and offer to join briefly.

> **To:** dm-jules
> Talk track is ready: proof points + concession guardrails + one clear "we cannot commit to that yet."
> Want me to join the first **10 minutes** of the Redwood call to help steer pricing questions?

---

### 3) Sponsor timeline draft
**Why it matters:** Sponsors will push back if dependencies and owners are not explicit.

**Do this:** Send the draft and ask them to confirm critical path + comms owner.

> **To:** dm-isabel
> Draft timeline attached (milestones + owners + dependencies).
> Can you confirm (1) the **critical path** and (2) who owns **comms if we slip**?
> Happy to convert this into a 1-page weekly status template.

---

## One thing you might miss today
**Postmortem comms timeline** still has no owner. If it slips, it will resurface in leadership review.`;
  }
  if (autopilotId === 'autopilot-early-warning') {
    return `# Early Warning

## 🚨 Early warning: Customers may see delayed payment updates (not an incident yet)

**Why you should care:** When updates arrive late, customers see "pending" longer, dashboards look wrong, and support volume spikes fast. This is the moment to prevent escalation.

### What I am seeing (plain English)
A few signals suggest our **payment status notifications** may be slowing down again.

### What to do in the next 60-90 minutes
1) **Backlog check:** Are notifications queueing up?
2) **Repeat-send check:** Are we re-sending the same updates more than usual?
3) **Customer impact check:** Are delivery times trending up vs earlier today?

### Copy/paste messages (do not auto-send)

> **To:** #incident-response
> Heads-up: we may be trending toward delayed payment status updates again.
> Can someone grab (1) backlog snapshot + (2) delivery delay trend in the next 60-90 min and report back?
> If it is worsening, we should decide early whether to open a Sev2.

> **To:** #support-escalations
> Potential early warning: payment status updates may lag if today's trend continues.
> Can we prep a customer-safe macro ("We are investigating delayed updates; next update in 60 minutes")?
> No outbound messaging unless we confirm impact.

### Escalation rule (simple)
If delays keep rising for **2 hours** or tickets cluster around "status stuck," open a Sev2 and assign an owner.`;
  }
  return '- No deliverable yet. Refresh to generate a new briefing.';
}

export function AppHome() {
  const autopilots = useStore((s) => s.autopilots);
  const messages = useStore((s) => s.messages);
  const runs = useStore((s) => s.runs);
  const canvases = useStore((s) => s.canvases);
  const setActiveView = useStore((s) => s.setActiveView);
  const setActiveChannel = useStore((s) => s.setActiveChannel);
  const openThread = useStore((s) => s.openThread);
  const openRunCanvas = useStore((s) => s.openRunCanvas);
  const createRunFromCommand = useStore((s) => s.createRunFromCommand);
  const reconcileRunFromServer = useStore((s) => s.reconcileRunFromServer);
  const discardRun = useStore((s) => s.discardRun);
  const createMessage = useStore((s) => s.createMessage);
  const updateAutopilot = useStore((s) => s.updateAutopilot);
  const autopilotEditorId = useStore((s) => s.autopilotEditorId);
  const setAutopilotEditorId = useStore((s) => s.setAutopilotEditorId);
  const rows = useMemo(() => {
    const existing = Object.values(autopilots);
    const pinned = requiredAutopilotRows.map((required) => existing.find((row) => row.id === required.id) || required);
    const extras = existing
      .filter((row) => !autopilotPriorityOrder.includes(row.id))
      .filter((row) => !hiddenSeedAutopilotIds.has(row.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...pinned, ...extras].sort((a, b) => {
      if (autopilotEditorId) {
        if (a.id === autopilotEditorId) return -1;
        if (b.id === autopilotEditorId) return 1;
      }
      const aIdx = autopilotPriorityOrder.indexOf(a.id);
      const bIdx = autopilotPriorityOrder.indexOf(b.id);
      const aPinned = aIdx >= 0;
      const bPinned = bIdx >= 0;
      if (aPinned && bPinned) return aIdx - bIdx;
      if (aPinned) return -1;
      if (bPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [autopilotEditorId, autopilots]);
  const autopilotActivity = useMemo(() => {
    const out: Record<string, { latestRun?: Run; latestDeliverable?: Message }> = {};
    const runsByAutopilot = Object.values(runs)
      .filter((run) => run.autopilotId)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const run of runsByAutopilot) {
      if (!run.autopilotId) continue;
      if (!out[run.autopilotId]?.latestRun) {
        out[run.autopilotId] = { ...out[run.autopilotId], latestRun: run };
      }
    }
    const deliverablesByAutopilot = messages
      .filter((message) => message.kind === 'deliverable' && message.autopilotId)
      .sort((a, b) => b.ts - a.ts);
    for (const message of deliverablesByAutopilot) {
      if (!message.autopilotId) continue;
      if (!out[message.autopilotId]?.latestDeliverable) {
        out[message.autopilotId] = { ...out[message.autopilotId], latestDeliverable: message };
      }
    }

    // Backfill from the latest run thread when older messages lack autopilotId.
    for (const [autopilotId, activity] of Object.entries(out)) {
      if (activity.latestDeliverable || !activity.latestRun) continue;
      const fallbackDeliverable = messages
        .filter((message) => message.kind === 'deliverable' && message.runId === activity.latestRun!.id)
        .sort((a, b) => b.ts - a.ts)[0];
      if (fallbackDeliverable) {
        out[autopilotId] = { ...activity, latestDeliverable: fallbackDeliverable };
      }
    }

    return out;
  }, [messages, runs]);
  const [creating, setCreating] = useState(false);
  const editing = autopilotEditorId ? autopilots[autopilotEditorId] : null;

  const openAutopilotDeliverableCanvas = (autopilot: Autopilot) => {
    const latestDeliverable = autopilotActivity[autopilot.id]?.latestDeliverable;
    const markdown =
      latestDeliverable?.body || latestDeliverable?.text || seededAutopilotPreview(autopilot.id);
    const canvasId = autopilot.canvasId || `autopilot-canvas-${autopilot.id}`;
    const currentCanvas = canvases[canvasId];
    if (!currentCanvas || currentCanvas.body !== markdown || currentCanvas.title !== autopilot.name) {
      useStore.setState((state) => ({
        canvases: {
          ...state.canvases,
          [canvasId]: {
            id: canvasId,
            title: autopilot.name,
            body: markdown,
            lastUpdatedAt: Date.now(),
          },
        },
      }));
    }
    if (!autopilot.canvasId) {
      updateAutopilot(autopilot.id, { canvasId });
    }
    openRunCanvas(canvasId);
  };

  const runScopedAutopilotNow = async (autopilot: Autopilot) => {
    const scopedMessages = messages
      .filter(
        (message) =>
          message.channelId === autopilot.destinationId &&
          !message.parentId &&
          message.kind === 'message' &&
          !message.isBot
      )
      .sort((a, b) => a.ts - b.ts)
      .slice(-20)
      .map((message) => `${message.userId}: ${message.text}`);
    const scopeGuard =
      autopilot.destinationType === 'channel'
        ? `Scope constraint: use only channel #${autopilot.destinationId}. Ignore references to other channels/DMs and do not include them in the output.`
        : `Scope constraint: use only DM ${autopilot.destinationId}. Do not use any other conversation.`;
    const command = {
      text: `${scopeGuard}\n\n${autopilot.instruction}`,
      container: { type: autopilot.destinationType, id: autopilot.destinationId } as const,
      scope: autopilot.scope,
      tools: autopilot.tools,
      outputFormat: autopilot.outputFormat,
      requireApproval: false,
      asAutopilot: true,
      contextMessages: scopedMessages,
    };
    const optimistic = createRunFromCommand(command);
    useStore.setState((state) => ({
      runs: state.runs[optimistic.id]
        ? {
            ...state.runs,
            [optimistic.id]: {
              ...state.runs[optimistic.id],
              autopilotId: autopilot.id,
            },
          }
        : state.runs,
    }));
    try {
      const response = await submitAgentCommand(command);
      const reconciled = reconcileRunFromServer(optimistic.id, response.run);
      useStore.setState((state) => ({
        runs: state.runs[reconciled.id]
          ? {
              ...state.runs,
              [reconciled.id]: {
                ...state.runs[reconciled.id],
                autopilotId: autopilot.id,
              },
            }
          : state.runs,
        messages: state.messages.map((message) =>
          message.kind === 'deliverable' && message.runId === reconciled.id && !message.autopilotId
            ? { ...message, autopilotId: autopilot.id }
            : message
        ),
      }));
      updateAutopilot(autopilot.id, { lastRunAt: Date.now() });
      return reconciled;
    } catch (error) {
      discardRun(optimistic.id);
      const detail = error instanceof Error ? error.message : 'Agent backend unavailable';
      createMessage({
        channelId: autopilot.destinationId,
        userId: 'workspace-agent',
        text: `Autopilot run failed: ${detail}.`,
        isBot: true,
      });
      return undefined;
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ padding: '0 var(--s4) var(--s4)' }}>
      <div>
        {rows.map((autopilot, index) => (
          <div
            key={autopilot.id}
            onClick={() => {
              const latestRun = autopilotActivity[autopilot.id]?.latestRun;
              if (!latestRun) return;
              setActiveView('channel');
              setActiveChannel(latestRun.container.id);
              openThread(latestRun.rootMessageId);
            }}
            style={{
              borderTop: index === 0 ? 'none' : '1px solid var(--border)',
              padding: 'var(--s3)',
              marginBottom: 0,
              background: 'transparent',
              cursor: autopilotActivity[autopilot.id]?.latestRun ? 'pointer' : 'default',
            }}
          >
            <div className="flex items-center justify-between">
              <strong>{autopilot.name}</strong>
              <button
                onClick={async (event) => {
                  event.stopPropagation();
                  await runScopedAutopilotNow(autopilot);
                }}
                title="Refresh briefing"
                aria-label="Refresh briefing"
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--link)',
                  fontSize: '11px',
                  lineHeight: '16px',
                  padding: 0,
                }}
              >
                Refresh
              </button>
            </div>
            <div style={{ fontSize: 'var(--font-small)', marginTop: '2px', color: 'var(--muted)' }}>
              Last updated: {formatRelativeLastUpdated(autopilot.lastRunAt)}
            </div>
            <div style={{ marginTop: 'var(--s3)' }}>
              {(() => {
              const activity = autopilotActivity[autopilot.id];
              const latestRun = activity?.latestRun;
              const latestDeliverable = activity?.latestDeliverable;
              const hasLatestRunDeliverable = Boolean(latestRun && latestDeliverable?.runId === latestRun.id);
              const showRunCard =
                Boolean(latestRun) &&
                !hasLatestRunDeliverable &&
                latestRun?.status !== 'completed' &&
                latestRun?.status !== 'failed' &&
                latestRun?.status !== 'stopped';

              if (latestRun && showRunCard) {
                return <RunCard run={latestRun} />;
              }

              return (
                <DeliverableCard
                  markdown={latestDeliverable?.body || latestDeliverable?.text || seededAutopilotPreview(autopilot.id)}
                  onOpen={() => {
                    openAutopilotDeliverableCanvas(autopilot);
                  }}
                />
              );
            })()}
            </div>
          </div>
        ))}
      </div>
      {creating && (
        <AutopilotPreviewSheet
          draft={emptyDraft()}
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <AutopilotPreviewSheet
          mode="edit"
          autopilotId={editing.id}
          draft={{
            name: editing.name,
            instruction: editing.instruction,
            cadenceText: editing.cadenceText,
            destinationType: editing.destinationType,
            destinationId: editing.destinationId,
            scope: editing.scope,
            tools: editing.tools,
            outputFormat: editing.outputFormat,
            outputMode: editing.outputMode,
            canvasId: editing.canvasId,
            isPaused: editing.isPaused,
            lastRunAt: editing.lastRunAt,
          }}
          onClose={() => setAutopilotEditorId(null)}
        />
      )}
    </div>
  );
}

const buttonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 10px',
  fontSize: '12px',
  background: 'var(--bg)',
  cursor: 'pointer',
};
