'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from '@/lib/store';
import type { Autopilot, Message, Run } from '@/lib/types';
import { AutopilotPreviewSheet } from './AutopilotPreviewSheet';
import { DeliverableCard } from './DeliverableCard';

function emptyDraft(): Omit<Autopilot, 'id'> {
  return {
    name: 'New autopilot',
    cadenceText: 'Weekdays at 9:00 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: undefined,
    canvasId: undefined,
  };
}

const autopilotPriorityOrder = ['autopilot-decision-driver', 'autopilot-loop-closer', 'autopilot-early-warning'];
const requiredAutopilotRows: Autopilot[] = [
  {
    id: 'autopilot-decision-driver',
    name: 'Decision Driver',
    cadenceText: 'Weekdays at 10:15 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
  },
  {
    id: 'autopilot-loop-closer',
    name: 'Loop Closer',
    cadenceText: 'Weekdays at 1:00 PM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
  },
  {
    id: 'autopilot-early-warning',
    name: 'Early Warning',
    cadenceText: 'Every 2 hours',
    destinationType: 'dm',
    destinationId: 'dm-agent',
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
    return [
      '### Decision',
      'Default payout circuit-breaker retries to **3** today.',
      '',
      '### Action items',
      '- Confirm monitoring owner for threshold checks.',
      '- Lock rollback trigger before next release gate.',
      '',
      '### Follow-up',
      '- Run checkpoints at +24h and +48h on tail latency and error budget.',
      '',
      '### Draft message to post in #eng-platform',
      '`@Alex Park @Priya Iyer @Mateo Cruz defaulting retries to 3 today. Please confirm threshold owner + rollback trigger in-thread before release gate.`',
    ].join('\n');
  }
  if (autopilotId === 'autopilot-loop-closer') {
    return [
      '### Priority follow-ups',
      '### 1) dm-priya',
      '- **Draft reply:** `Sharing launch copy now with staged availability language so legal can review on time.`',
      '',
      '### 2) dm-jules',
      '- **Draft reply:** `Sending Redwood talk track now with proof points and concession guardrails for the call.`',
      '',
      '### 3) dm-isabel',
      '- **Draft reply:** `Draft timeline attached with milestones, dependencies, and owners for sponsor review.`',
      '',
      '### Follow-up',
      '- Confirm all three threads are closed before end of day.',
    ].join('\n');
  }
  if (autopilotId === 'autopilot-early-warning') {
    return [
      '### Risk signal',
      '- Webhook retry pressure appears to be rising again across ops signals.',
      '',
      '### Immediate checks',
      '- Validate queue depth by shard.',
      '- Compare retry-storm indicators vs baseline.',
      '- Confirm canary latency remains within guardrails.',
      '',
      '### Follow-up',
      '- If elevated for 2 hours, open Sev2 and assign incident owner.',
      '',
      '### Draft messages',
      '- **#incident-response:** `Quick validation ask: retry traffic appears elevated again. Who owns next 2h checkpoint and queue-depth snapshot?`',
      '- **#support-escalations:** `Heads-up: possible retry pressure returning. Please prepare customer-safe macro and ETA language.`',
    ].join('\n');
  }
  return '- No deliverable yet. Refresh to generate a new briefing.';
}

export function AppHome() {
  const autopilots = useStore((s) => s.autopilots);
  const messages = useStore((s) => s.messages);
  const runs = useStore((s) => s.runs);
  const setActiveView = useStore((s) => s.setActiveView);
  const setActiveChannel = useStore((s) => s.setActiveChannel);
  const openThread = useStore((s) => s.openThread);
  const openRunCanvas = useStore((s) => s.openRunCanvas);
  const runAutopilotNow = useStore((s) => s.runAutopilotNow);
  const autopilotEditorId = useStore((s) => s.autopilotEditorId);
  const setAutopilotEditorId = useStore((s) => s.setAutopilotEditorId);
  const rows = useMemo(() => {
    const existing = Object.values(autopilots);
    const merged = requiredAutopilotRows.map((required) => existing.find((row) => row.id === required.id) || required);
    return merged.sort((a, b) => {
      const aIdx = autopilotPriorityOrder.indexOf(a.id);
      const bIdx = autopilotPriorityOrder.indexOf(b.id);
      const aPinned = aIdx >= 0;
      const bPinned = bIdx >= 0;
      if (aPinned && bPinned) return aIdx - bIdx;
      if (aPinned) return -1;
      if (bPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [autopilots]);
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

  return (
    <div className="h-full overflow-y-auto" style={{ padding: 'var(--s4)' }}>
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
              <span style={{ fontSize: '11px', color: autopilot.isPaused ? 'var(--muted)' : 'var(--success)' }}>
                {autopilot.isPaused ? 'Paused' : 'Active'}
              </span>
            </div>
            <div style={{ fontSize: 'var(--font-small)', marginTop: 'var(--s1)', color: 'var(--muted)' }}>
              Last updated: {formatRelativeLastUpdated(autopilot.lastRunAt)}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  const refreshedRun = runAutopilotNow(autopilot.id);
                  if (refreshedRun) openRunCanvas(refreshedRun.id);
                }}
                title="Refresh briefing"
                aria-label="Refresh briefing"
                style={{
                  marginLeft: '8px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--link)',
                  fontSize: 'var(--font-small)',
                  lineHeight: 'var(--lh-base)',
                  padding: 0,
                }}
              >
                ↻
              </button>
            </div>
            <DeliverableCard
              markdown={
                autopilotActivity[autopilot.id]?.latestDeliverable?.body ||
                autopilotActivity[autopilot.id]?.latestDeliverable?.text ||
                seededAutopilotPreview(autopilot.id)
              }
              onOpen={() => {
                const latestDeliverable = autopilotActivity[autopilot.id]?.latestDeliverable;
                const canvasTarget = latestDeliverable?.artifactLinks?.find((link) => link.targetId)?.targetId;
                if (canvasTarget) {
                  openRunCanvas(canvasTarget);
                  return;
                }
                if (autopilot.outputMode === 'canvasPrimary' && autopilot.canvasId) {
                  openRunCanvas(autopilot.canvasId);
                  return;
                }
                const latestRun = autopilotActivity[autopilot.id]?.latestRun;
                if (latestRun) {
                  openRunCanvas(latestRun.id);
                  return;
                }
                const freshRun = runAutopilotNow(autopilot.id);
                if (freshRun) openRunCanvas(freshRun.id);
              }}
            />
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
            cadenceText: editing.cadenceText,
            destinationType: editing.destinationType,
            destinationId: editing.destinationId,
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
