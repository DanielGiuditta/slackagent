'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sendRunApproval } from '@/lib/agentApi';
import { useStore } from '@/lib/store';
import { MessageRow } from './MessageRow';
import { Composer } from './Composer';

export function ThreadPanel() {
  const messages = useStore((s) => s.messages);
  const activeThreadRootId = useStore((s) => s.activeThreadRootId);
  const closeThread = useStore((s) => s.closeThread);
  const typing = useStore((s) => s.typing);
  const getRunByRootMessage = useStore((s) => s.getRunByRootMessage);
  const decideRunApproval = useStore((s) => s.decideRunApproval);
  const [showContextUsed, setShowContextUsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const rootMsg = messages.find((m) => m.id === activeThreadRootId);
  const run = activeThreadRootId ? getRunByRootMessage(activeThreadRootId) : undefined;
  const replies = messages
    .filter((m) => {
      if (m.parentId !== activeThreadRootId) return false;
      if (m.kind === 'deliverable') return false;
      return true;
    })
    .sort((a, b) => a.ts - b.ts);

  // Auto-scroll on new replies
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies.length]);

  if (!rootMsg) return null;

  const showTyping =
    typing && typing.parentId === activeThreadRootId;

  const handleApproval = async (decision: 'approve' | 'reject') => {
    if (!run) return;
    if (decision === 'approve') {
      try {
        await sendRunApproval(run.id, 'approve');
      } catch {
        decideRunApproval(run.id, 'approve');
      }
      return;
    }
    try {
      await sendRunApproval(run.id, 'deny');
    } catch {
      decideRunApproval(run.id, 'reject');
    }
  };

  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: 'var(--thread-w)',
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0 px-4"
        style={{
          height: 'var(--topbar-h)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          className="font-bold"
          style={{ fontSize: 'var(--font-large)', color: 'var(--text)' }}
        >
          Thread
        </span>
        <button
          onClick={closeThread}
          className="flex items-center justify-center rounded transition-colors hover:bg-gray-100"
          style={{
            width: '28px',
            height: '28px',
            color: 'var(--muted)',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: 'var(--s3) var(--s4)' }}
      >
        {/* Root message */}
        <MessageRow message={rootMsg} isThreadView />

        {/* Divider */}
        {replies.length > 0 && (
          <div
            className="flex items-center gap-3"
            style={{ margin: 'var(--s3) 0' }}
          >
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span style={{ fontSize: 'var(--font-small)', color: 'var(--muted)' }}>
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>
        )}

        {/* Replies */}
        {replies.map((msg) => (
          <MessageRow key={msg.id} message={msg} isThreadView />
        ))}

        {run && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              marginTop: 'var(--s2)',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setShowContextUsed((prev) => !prev)}
              className="w-full text-left"
              style={{
                border: 'none',
                borderBottom: showContextUsed ? '1px solid var(--border)' : 'none',
                background: 'var(--surface)',
                padding: 'var(--s2)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Context used {showContextUsed ? '▾' : '▸'}
            </button>
            {showContextUsed && (
              <div style={{ padding: 'var(--s2)', fontSize: '12px', color: 'var(--muted)' }}>
                <div>Channel: {run.scope?.channel ? 'included' : 'not included'}</div>
                <div>Thread: {run.scope?.thread ? 'included' : 'not included'}</div>
                <div>
                  Messages:{' '}
                  {(run.scope?.messages || []).length > 0
                    ? (run.scope?.messages || []).map((msgId) => (
                        <a key={msgId} href="#" onClick={(event) => event.preventDefault()} style={{ color: 'var(--link)', marginRight: 6 }}>
                          {msgId}
                        </a>
                      ))
                    : 'none'}
                </div>
                <div>
                  Files:{' '}
                  {(run.scope?.files || []).length > 0
                    ? (run.scope?.files || []).map((fileName) => (
                        <a key={fileName} href="#" onClick={(event) => event.preventDefault()} style={{ color: 'var(--link)', marginRight: 6 }}>
                          {fileName}
                        </a>
                      ))
                    : 'none'}
                </div>
                <div>People: {(run.scope?.people || []).join(', ') || 'none'}</div>
              </div>
            )}
          </div>
        )}

        {run?.approval?.required && run.approval.pending && (
          <div
            style={{
              marginTop: 'var(--s2)',
              border: '1px solid #e7c179',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--s2)',
              background: '#fff8ed',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '12px', color: '#9f6400' }}>Proposed action</div>
            <div style={{ marginTop: 'var(--s1)', fontSize: '12px', color: 'var(--text)' }}>
              {run.approval.reason || 'This run wants to take an external action.'}
            </div>
            <div className="flex gap-2" style={{ marginTop: 'var(--s2)' }}>
              <button onClick={() => void handleApproval('approve')} style={buttonStyle}>
                Approve
              </button>
              <button onClick={() => void handleApproval('reject')} style={buttonStyle}>
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {showTyping && (
          <div
            className="italic"
            style={{
              padding: 'var(--s2)',
              fontSize: 'var(--font-small)',
              color: 'var(--muted)',
            }}
          >
            &hellip; {typing!.userId} is typing
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Thread composer */}
      <Composer parentId={activeThreadRootId!} />
    </div>
  );
}

const buttonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '2px 8px',
  fontSize: '11px',
  background: 'var(--bg)',
  cursor: 'pointer',
};
