'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { sendMessage } from '@/lib/ws';
import { MarkdownContent } from './MarkdownContent';
import { sanitizeDeliverableMarkdown } from './DeliverableCard';

interface CanvasAction {
  id: string;
  label: string;
  ghostText: string;
  channelId: string;
}

function parseDeliverableActions(markdown: string, fallbackChannelId: string): CanvasAction[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const actions: CanvasAction[] = [];
  let currentDm: string | null = null;
  let pendingChannel: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const dmSection = line.match(/^###\s+\d+\)\s+(dm-[a-z0-9-]+)/i);
    if (dmSection) {
      currentDm = dmSection[1].toLowerCase();
      continue;
    }
    const draftReply = line.match(/^\-\s+\*\*Draft reply:\*\*\s+`([^`]+)`$/i);
    if (draftReply) {
      const channelId = currentDm || fallbackChannelId;
      actions.push({
        id: `${channelId}-${i}`,
        label: `Send to ${channelId}`,
        ghostText: draftReply[1],
        channelId,
      });
      continue;
    }
    const headingDraft = line.match(/^###\s+Draft message to post in\s+#([a-z0-9-]+)$/i);
    if (headingDraft) {
      pendingChannel = headingDraft[1].toLowerCase();
      continue;
    }
    if (pendingChannel) {
      const codeLine = line.match(/^`([^`]+)`$/);
      if (codeLine) {
        actions.push({
          id: `${pendingChannel}-${i}`,
          label: `Send to #${pendingChannel}`,
          ghostText: codeLine[1],
          channelId: pendingChannel,
        });
        pendingChannel = null;
      }
      continue;
    }
    const inlineChannelDraft = line.match(/^\-\s+\*\*#([a-z0-9-]+):\*\*\s+`([^`]+)`$/i);
    if (inlineChannelDraft) {
      const channelId = inlineChannelDraft[1].toLowerCase();
      actions.push({
        id: `${channelId}-${i}`,
        label: `Send to #${channelId}`,
        ghostText: inlineChannelDraft[2],
        channelId,
      });
    }
  }
  return actions;
}

export function RunCanvasPanel() {
  const runs = useStore((s) => s.runs);
  const canvases = useStore((s) => s.canvases);
  const messages = useStore((s) => s.messages);
  const channels = useStore((s) => s.channels);
  const createMessage = useStore((s) => s.createMessage);
  const canvasRunId = useStore((s) => s.canvasRunId);
  const closeRunCanvas = useStore((s) => s.closeRunCanvas);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});

  const run = canvasRunId ? runs[canvasRunId] : undefined;
  const canvas = canvasRunId ? canvases[canvasRunId] : undefined;
  const deliverableMarkdown = useMemo(() => {
    if (canvas) return canvas.body;
    if (!run) return '';
    const deliverables = messages
      .filter((message) => message.runId === run.id && message.kind === 'deliverable')
      .sort((a, b) => a.ts - b.ts);
    for (let idx = deliverables.length - 1; idx >= 0; idx--) {
      const candidate = deliverables[idx];
      if (candidate?.kind === 'deliverable') {
        return candidate.body || candidate.text || '';
      }
    }
    return '';
  }, [canvas, messages, run]);

  if (!run && !canvas) return null;

  const channel = run ? channels.find((entry) => entry.id === run.container.id) : null;
  const title = canvas?.title || run?.title || 'Canvas';
  const sanitizedDeliverableMarkdown = useMemo(
    () => sanitizeDeliverableMarkdown(deliverableMarkdown || ''),
    [deliverableMarkdown]
  );
  const actions = useMemo(
    () => parseDeliverableActions(sanitizedDeliverableMarkdown, run?.container.id || 'dm-agent'),
    [sanitizedDeliverableMarkdown, run?.container.id]
  );
  return (
    <aside
      className="flex flex-col"
      style={{
        flex: '0 1 clamp(300px, 42vw, 680px)',
        width: 'clamp(300px, 42vw, 680px)',
        maxWidth: '50vw',
        minWidth: '280px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div
        className="flex items-center justify-between gap-2 shrink-0 px-4"
        style={{
          height: 'var(--topbar-h)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <span
          className="font-bold"
          style={{
            fontSize: 'var(--font-large)',
            color: 'var(--text)',
            minWidth: 0,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={run ? `${run.container.type === 'channel' ? '#' : ''}${channel?.name || run.container.id}` : title}
        >
          {title}
        </span>
        <button
          onClick={closeRunCanvas}
          className="flex items-center justify-center rounded transition-colors hover:bg-gray-100"
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--muted)',
            width: '28px',
            height: '28px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Close canvas"
          title="Close canvas"
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

      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: 'var(--s4) var(--s5)',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
        }}
      >
        <MarkdownContent markdown={sanitizedDeliverableMarkdown || '_No deliverable yet. Keep this run open as it continues._'} />
        {actions.length > 0 && (
          <div style={{ marginTop: 'var(--s4)', display: 'grid', gap: '10px' }}>
            {actions.map((action) => (
              <div key={action.id}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{action.label}</div>
                <div
                  className="flex items-end"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '6px 8px',
                    background: 'var(--bg)',
                  }}
                >
                  <textarea
                    rows={1}
                    value={draftInputs[action.id] || ''}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      setDraftInputs((prev) => ({ ...prev, [action.id]: next }));
                    }}
                    onClick={(event) => event.stopPropagation()}
                    placeholder={action.ghostText}
                    className="flex-1 resize-none outline-none bg-transparent"
                    style={{ fontSize: 'var(--font-base)', lineHeight: 'var(--lh-base)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      const text = (draftInputs[action.id] || '').trim() || action.ghostText;
                      if (!text) return;
                      createMessage({ channelId: action.channelId, userId: 'you', text });
                      sendMessage(action.channelId, text);
                      setDraftInputs((prev) => ({ ...prev, [action.id]: '' }));
                    }}
                    title="Send message"
                    aria-label="Send message"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      marginLeft: 'var(--s2)',
                      background: 'var(--success)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10 8L1.5 6.5V1.5Z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
