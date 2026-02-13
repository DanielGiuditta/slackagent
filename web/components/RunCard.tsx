'use client';

import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { sendRunApproval, sendRunControl } from '@/lib/agentApi';
import { useStore } from '@/lib/store';
import type { Run, RunStatus } from '@/lib/types';
import { MarkdownContent } from './MarkdownContent';

function statusColor(status: RunStatus) {
  switch (status) {
    case 'completed':
      return 'var(--success)';
    case 'failed':
    case 'stopped':
      return '#d83b3b';
    case 'needs_approval':
      return '#e8912d';
    case 'running':
      return 'var(--link)';
    case 'paused':
      return '#7a5c00';
    default:
      return 'var(--muted)';
  }
}

interface RunCardProps {
  run: Run;
}

function statusLabel(status: RunStatus) {
  switch (status) {
    case 'needs_approval':
      return 'Waiting approval';
    case 'completed':
      return 'Done';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function RunCard({ run }: RunCardProps) {
  const openThread = useStore((s) => s.openThread);
  const setSelectedRunId = useStore((s) => s.setSelectedRunId);
  const openRunCanvas = useStore((s) => s.openRunCanvas);
  const decideRunApproval = useStore((s) => s.decideRunApproval);
  const controlRun = useStore((s) => s.controlRun);
  const messages = useStore((s) => s.messages);
  const [busy, setBusy] = useState(false);
  const [displayProgressPct, setDisplayProgressPct] = useState(run.progressPct);

  useEffect(() => {
    setDisplayProgressPct(run.progressPct);
  }, [run.id, run.progressPct]);

  useEffect(() => {
    if (run.status !== 'running') return;
    const timer = setInterval(() => {
      setDisplayProgressPct((current) => {
        const floor = Math.max(current, run.progressPct);
        if (floor >= 99) return floor;
        return Math.min(99, floor + 0.8);
      });
    }, 240);
    return () => clearInterval(timer);
  }, [run.id, run.progressPct, run.status]);

  const actions = useMemo(
    () => ({
      open: () => {
        setSelectedRunId(run.id);
        openThread(run.rootMessageId);
      },
      approve: async () => {
        setBusy(true);
        try {
          await sendRunApproval(run.id, 'approve');
        } catch {
          decideRunApproval(run.id, 'approve');
        } finally {
          setBusy(false);
        }
      },
      pause: async () => {
        setBusy(true);
        try {
          await sendRunControl(run.id, 'pause');
        } catch {
          controlRun(run.id, 'pause');
        } finally {
          setBusy(false);
        }
      },
      resume: async () => {
        setBusy(true);
        try {
          await sendRunControl(run.id, 'resume');
        } catch {
          controlRun(run.id, 'resume');
        } finally {
          setBusy(false);
        }
      },
    }),
    [controlRun, decideRunApproval, openThread, run, setSelectedRunId]
  );

  const isWorking =
    run.status === 'queued' || run.status === 'running' || run.status === 'paused' || run.status === 'needs_approval';
  const latestDeliverable = useMemo(
    () =>
      messages
        .filter((message) => message.kind === 'deliverable' && message.runId === run.id)
        .sort((a, b) => b.ts - a.ts)[0],
    [messages, run.id]
  );

  const stop = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const openPrimaryArtifact = () => {
    const links = latestDeliverable?.artifactLinks || [];
    const canvasTarget = links.find((link) => link.targetId)?.targetId;
    if (canvasTarget) {
      openRunCanvas(canvasTarget);
      return;
    }
    const externalLink = links.find((link) => link.url)?.url;
    if (externalLink) {
      window.open(externalLink, '_blank', 'noopener,noreferrer');
      return;
    }
    const linkedArtifact = run.artifacts.find((artifact) => Boolean(artifact.url));
    if (linkedArtifact?.url) {
      window.open(linkedArtifact.url, '_blank', 'noopener,noreferrer');
      return;
    }
    openRunCanvas(run.id);
  };

  return (
    <div style={{ marginTop: 'var(--s1)' }}>
      <div className="flex items-center justify-between gap-2">
        <strong style={{ fontSize: 'var(--font-base)' }}>{run.title}</strong>
        {isWorking && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: statusColor(run.status),
            }}
          >
            {statusLabel(run.status)}
          </span>
        )}
      </div>
      {isWorking && (
        <div className="flex items-center gap-2" style={{ marginTop: 'var(--s1)', marginBottom: 'var(--s2)' }}>
          <div
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '999px',
              background: 'var(--surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(3, Math.round(Math.max(run.progressPct, displayProgressPct)))}%`,
                height: '100%',
                background: statusColor(run.status),
                transition: 'width 220ms linear',
              }}
            />
          </div>
          {run.status === 'running' && (
            <button
              onClick={(event) => {
                stop(event);
                void actions.pause();
              }}
              disabled={busy}
              title="Pause run"
              aria-label="Pause run"
              style={iconButtonStyle}
            >
              <StopIcon />
            </button>
          )}
          {run.status === 'paused' && (
            <button
              onClick={(event) => {
                stop(event);
                void actions.resume();
              }}
              disabled={busy}
              title="Resume run"
              aria-label="Resume run"
              style={iconButtonStyle}
            >
              <PlayIcon />
            </button>
          )}
        </div>
      )}

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--s3)',
          background: 'var(--bg)',
          cursor: latestDeliverable ? 'pointer' : 'default',
          marginTop: 'var(--s1)',
        }}
        onClick={() => {
          if (latestDeliverable) openPrimaryArtifact();
        }}
      >
        {latestDeliverable ? (
          <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.45 }}>
            <MarkdownContent markdown={latestDeliverable.body || latestDeliverable.text} />
          </div>
        ) : (
          <>
            {run.requestedText && (
              <div style={{ marginTop: 'var(--s1)', fontSize: '12px', color: 'var(--muted)' }}>
                Requested by You: <span style={{ color: 'var(--text)' }}>{run.requestedText}</span>
              </div>
            )}
            <div style={{ marginTop: 'var(--s1)', fontSize: '11px', color: 'var(--muted)' }}>
              Step {run.stepCurrent || 0}/{run.stepTotal || 0}
            </div>
            <div style={{ marginTop: 'var(--s1)', fontSize: 'var(--font-small)', color: 'var(--muted)' }}>
              {run.latestUpdate}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 'var(--s2)' }}>
          {run.artifacts.map((artifact) => (
            <a
              key={artifact.id}
              href={artifact.url || '#'}
              onClick={(event) => {
                stop(event);
                if (artifact.url) {
                  window.open(artifact.url, '_blank', 'noopener,noreferrer');
                  return;
                }
                if (artifact.type === 'canvas') {
                  openRunCanvas(run.id);
                  return;
                }
                actions.open();
              }}
              style={{
                fontSize: '11px',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '2px 8px',
                color: 'var(--link)',
                textDecoration: 'none',
              }}
            >
              {artifact.type}: {artifact.title}
            </a>
          ))}
        </div>
      </div>

      {run.status === 'needs_approval' && run.approval?.pending && (
        <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s3)' }}>
          <button
            onClick={(event) => {
              stop(event);
              void actions.approve();
            }}
            disabled={busy}
            style={buttonStylePrimary}
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

const buttonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 10px',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
};

const iconButtonStyle: CSSProperties = {
  ...buttonStyle,
  width: '26px',
  height: '26px',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const buttonStylePrimary: CSSProperties = {
  ...buttonStyle,
  background: 'var(--success)',
  color: '#fff',
  border: '1px solid var(--success)',
};

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M3 1.8V10.2L10 6L3 1.8Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1.2" />
    </svg>
  );
}
