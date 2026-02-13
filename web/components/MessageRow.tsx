'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Message } from '@/lib/types';
import { RunCard } from './RunCard';
import { DeliverableCard } from './DeliverableCard';

/* ─── Avatar fallback (image only, no initials) ─── */

const DEFAULT_AVATAR_SRC = '/avatars/default-avatar.svg';
const AGENT_USER_ID = 'workspace-agent';

/* ─── Time formatting ─── */

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatTime(ts);
}

/* ─── Component ─── */

interface MessageRowProps {
  message: Message;
  replyCount?: number;
  lastReplyTs?: number;
  isThreadView?: boolean;
}

export function MessageRow({
  message,
  replyCount = 0,
  lastReplyTs,
  isThreadView = false,
}: MessageRowProps) {
  const openThread = useStore((s) => s.openThread);
  const openRunCanvas = useStore((s) => s.openRunCanvas);
  const runs = useStore((s) => s.runs);
  const canvases = useStore((s) => s.canvases);
  const autopilots = useStore((s) => s.autopilots);
  const getUserProfile = useStore((s) => s.getUserProfile);
  const profile = getUserProfile(message.userId);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc = useMemo(() => {
    if (profile.avatarUrl && !avatarFailed) return profile.avatarUrl;
    return DEFAULT_AVATAR_SRC;
  }, [avatarFailed, profile.avatarUrl]);
  const isWorkspaceAgent = profile.id === AGENT_USER_ID;
  const run = message.runId ? runs[message.runId] : undefined;
  const isRunRow = message.kind === 'run_card' && Boolean(run);
  const isAgentThinking = run?.status === 'queued' || run?.status === 'running';
  const opensThreadFromRow = !isThreadView && (isRunRow || message.kind === 'deliverable');
  const threadRootId = isRunRow ? message.id : message.threadRootId || message.parentId || message.id;

  const resolveCanvasTarget = (preferredTargetId?: string) => {
    if (preferredTargetId && (runs[preferredTargetId] || canvases[preferredTargetId])) {
      return preferredTargetId;
    }
    if (message.runId && (runs[message.runId] || canvases[message.runId])) {
      return message.runId;
    }
    if (message.autopilotId) {
      const autopilotCanvasId = autopilots[message.autopilotId]?.canvasId;
      if (autopilotCanvasId && canvases[autopilotCanvasId]) {
        return autopilotCanvasId;
      }
    }
    if (run?.id) return run.id;
    return undefined;
  };

  const openDeliverableArtifact = () => {
    if (message.kind !== 'deliverable') return;
    const links = message.artifactLinks || [];
    const canvasTarget = links.find((link) => link.targetId)?.targetId;
    if (canvasTarget) {
      const resolved = resolveCanvasTarget(canvasTarget);
      if (resolved) {
        openRunCanvas(resolved);
        return;
      }
    }

    const fallbackTarget = resolveCanvasTarget();
    if (fallbackTarget) {
      openRunCanvas(fallbackTarget);
      return;
    }

    const externalLink = links.find((link) => link.url)?.url;
    if (externalLink) {
      window.open(externalLink, '_blank', 'noopener,noreferrer');
      return;
    }

    const linkedArtifact = run?.artifacts.find((artifact) => Boolean(artifact.url));
    if (linkedArtifact?.url) {
      window.open(linkedArtifact.url, '_blank', 'noopener,noreferrer');
      return;
    }

    // Nothing resolvable: no-op instead of opening unrelated surfaces.
  };

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile.avatarUrl, profile.id]);

  return (
    <div
      className="flex gap-3 group transition-colors"
      style={{
        padding: `${isThreadView ? 'var(--s2)' : 'var(--s2)'} var(--s2)`,
        borderRadius: 'var(--radius-md)',
        cursor: opensThreadFromRow ? 'pointer' : 'default',
      }}
      role={opensThreadFromRow ? 'button' : undefined}
      tabIndex={opensThreadFromRow ? 0 : undefined}
      onClick={() => {
        if (opensThreadFromRow) openThread(threadRootId);
      }}
      onKeyDown={(e) => {
        if (!opensThreadFromRow) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openThread(threadRootId);
        }
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '';
      }}
    >
      {/* Avatar */}
      {isWorkspaceAgent ? (
        <div aria-hidden="true" className={`agent-star-avatar ${isAgentThinking ? 'is-running' : ''}`}>
          <div className="agent-star-avatar__blue" />
          <div className="agent-star-avatar__rainbow" />
          <span className="agent-star-avatar__glyph">✦</span>
        </div>
      ) : (
        <img
          src={avatarSrc}
          alt={profile.displayName}
          width={36}
          height={36}
          onError={() => setAvatarFailed(true)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            objectFit: 'cover',
            background: 'var(--surface)',
          }}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: name + badge + time */}
        <div className="flex items-baseline gap-2">
          <span
            className="font-bold"
            style={{ fontSize: 'var(--font-base)', color: 'var(--text)' }}
            title={profile.role}
          >
            {profile.displayName}
          </span>

          {(message.isBot || profile.isBot) && (
            <span
              className="font-semibold text-white uppercase"
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bot-badge)',
                letterSpacing: '0.03em',
                lineHeight: '16px',
              }}
            >
              bot
            </span>
          )}

          <span suppressHydrationWarning style={{ fontSize: 'var(--font-small)', color: 'var(--muted)' }}>
            {formatTime(message.ts)}
          </span>
        </div>

        {/* Body */}
        {message.kind === 'run_card' && run ? (
          <RunCard run={run} />
        ) : message.kind === 'deliverable' ? (
          <DeliverableCard
            markdown={message.body || message.text}
            onOpen={openDeliverableArtifact}
            footer={
              message.artifactLinks && message.artifactLinks.length > 0 ? (
                <div className="flex flex-wrap gap-2" style={{ marginTop: 'var(--s2)' }}>
                  {message.artifactLinks.map((link, idx) => (
                    link.url ? (
                      <a
                        key={`${message.id}-artifact-${idx}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '3px 8px',
                          fontSize: '11px',
                          background: 'var(--bg)',
                          color: 'var(--link)',
                          textDecoration: 'none',
                        }}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <button
                        key={`${message.id}-artifact-${idx}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          const resolved = resolveCanvasTarget(link.targetId);
                          if (resolved) {
                            openRunCanvas(resolved);
                          }
                        }}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '3px 8px',
                          fontSize: '11px',
                          background: 'var(--bg)',
                          color: 'var(--link)',
                          cursor: link.targetId ? 'pointer' : 'default',
                        }}
                      >
                        {link.label}
                      </button>
                    )
                  ))}
                </div>
              ) : null
            }
          />
        ) : (
          <div
            style={{
              fontSize: 'var(--font-base)',
              color: 'var(--text)',
              lineHeight: 'var(--lh-base)',
              marginTop: 'var(--s0)',
            }}
          >
            {message.text}
          </div>
        )}

        {/* Reply indicator */}
        {!isThreadView && replyCount > 0 && (
          <button
            onClick={() => openThread(message.id)}
            className="flex items-center gap-1 hover:underline"
            style={{
              marginTop: 'var(--s1)',
              fontSize: 'var(--font-small)',
              color: 'var(--link)',
              fontWeight: 600,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
            }}
          >
            <span>
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </span>
            {lastReplyTs && (
              <span suppressHydrationWarning style={{ color: 'var(--muted)', fontWeight: 400 }}>
                &middot; last reply {formatRelativeTime(lastReplyTs)}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
