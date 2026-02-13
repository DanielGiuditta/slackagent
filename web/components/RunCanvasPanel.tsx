'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { MarkdownContent } from './MarkdownContent';
import { sanitizeDeliverableMarkdown } from './DeliverableCard';

interface CanvasAction {
  id: string;
  label: string;
  ghostText: string;
  channelId: string;
  marker: string;
}

function extractActionsAndDisplay(markdown: string, fallbackChannelId: string): {
  actions: CanvasAction[];
  displayMarkdown: string;
} {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const actions: CanvasAction[] = [];
  const displayLines: string[] = [];
  let currentDm: string | null = null;
  let pendingChannel: string | null = null;

  const normalizeTarget = (raw: string) => {
    const cleaned = raw.trim().replace(/[.,]$/, '');
    if (cleaned.startsWith('#')) return cleaned.slice(1).toLowerCase();
    return cleaned.toLowerCase();
  };

  const formatTargetLabel = (channelId: string) =>
    channelId.startsWith('dm-') ? `@${channelId.slice(3)}` : `#${channelId}`;

  const parseBlockQuoteAction = (startIndex: number) => {
    const block: string[] = [];
    let idx = startIndex;
    while (idx < lines.length) {
      const trimmed = lines[idx].trim();
      if (!trimmed.startsWith('>')) break;
      block.push(trimmed.replace(/^>\s?/, ''));
      idx += 1;
    }
    const toLine = block.find((line) => line.replace(/\*\*/g, '').trim().match(/^to\s*:\s*/i));
    if (!toLine) return { nextIndex: idx };
    const toMatch = toLine.replace(/\*\*/g, '').trim().match(/^to\s*:\s*(.+)$/i);
    if (!toMatch) return { nextIndex: idx };
    const channelId = normalizeTarget(toMatch[1]);
    const normalizedBlockLines = block
      .map((line) =>
        line
          .replace(/\*\*To:\*\*/i, 'To:')
          .replace(/\*\*/g, '')
          .trim()
      )
      .filter(Boolean)
      .filter((line) => !line.match(/^to\s*:/i));
    const ghostText = normalizedBlockLines.join('\n').trim();
    if (!ghostText) return { nextIndex: idx };
    const marker = `[[ACTION_${actions.length}]]`;
    actions.push({
      id: `${channelId}-${startIndex}`,
      label: formatTargetLabel(channelId),
      ghostText,
      channelId,
      marker,
    });
    displayLines.push(marker);
    return { nextIndex: idx };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,3}\s+Copy\/paste message to send\s*$/i.test(line)) {
      continue;
    }
    if (/^\*\*Do this:\*\*/i.test(line)) {
      continue;
    }
    if (line.startsWith('>')) {
      const parsed = parseBlockQuoteAction(i);
      i = Math.max(i, parsed.nextIndex - 1);
      continue;
    }
    const dmSection = line.match(/^###\s+\d+\)\s+(dm-[a-z0-9-]+)/i);
    if (dmSection) {
      currentDm = dmSection[1].toLowerCase();
      continue;
    }
    const draftReply = line.match(/^\-\s+\*\*Draft reply:\*\*\s+`([^`]+)`$/i);
    if (draftReply) {
      const channelId = currentDm || fallbackChannelId;
      const marker = `[[ACTION_${actions.length}]]`;
      actions.push({
        id: `${channelId}-${i}`,
        label: formatTargetLabel(channelId),
        ghostText: draftReply[1],
        channelId,
        marker,
      });
      displayLines.push(marker);
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
        const marker = `[[ACTION_${actions.length}]]`;
        actions.push({
          id: `${pendingChannel}-${i}`,
          label: formatTargetLabel(pendingChannel),
          ghostText: codeLine[1],
          channelId: pendingChannel,
          marker,
        });
        displayLines.push(marker);
        pendingChannel = null;
      }
      continue;
    }
    const inlineChannelDraft = line.match(/^\-\s+\*\*#([a-z0-9-]+):\*\*\s+`([^`]+)`$/i);
    if (inlineChannelDraft) {
      const channelId = inlineChannelDraft[1].toLowerCase();
      const marker = `[[ACTION_${actions.length}]]`;
      actions.push({
        id: `${channelId}-${i}`,
        label: formatTargetLabel(channelId),
        ghostText: inlineChannelDraft[2],
        channelId,
        marker,
      });
      displayLines.push(marker);
      continue;
    }
    displayLines.push(lines[i]);
  }
  return { actions, displayMarkdown: displayLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

export function RunCanvasPanel() {
  const runs = useStore((s) => s.runs);
  const canvases = useStore((s) => s.canvases);
  const messages = useStore((s) => s.messages);
  const channels = useStore((s) => s.channels);
  const getUserProfile = useStore((s) => s.getUserProfile);
  const createMessage = useStore((s) => s.createMessage);
  const setActiveChannel = useStore((s) => s.setActiveChannel);
  const setActiveView = useStore((s) => s.setActiveView);
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
  const { actions, displayMarkdown } = useMemo(
    () => extractActionsAndDisplay(sanitizedDeliverableMarkdown, run?.container.id || 'dm-agent'),
    [sanitizedDeliverableMarkdown, run?.container.id]
  );
  const contentParts = useMemo(() => {
    type ContentPart = { type: 'markdown'; value: string } | { type: 'action'; action: CanvasAction };
    const parts: ContentPart[] = [];
    let cursor = 0;
    for (const action of actions) {
      const idx = displayMarkdown.indexOf(action.marker, cursor);
      if (idx === -1) continue;
      const before = displayMarkdown.slice(cursor, idx).trim();
      if (before) parts.push({ type: 'markdown', value: before });
      parts.push({ type: 'action', action });
      cursor = idx + action.marker.length;
    }
    const tail = displayMarkdown.slice(cursor).trim();
    if (tail) parts.push({ type: 'markdown', value: tail });
    return parts.length > 0 ? parts : ([{ type: 'markdown', value: displayMarkdown }] as ContentPart[]);
  }, [actions, displayMarkdown]);
  const you = getUserProfile('you');
  const sanitizeDraftForSend = (action: CanvasAction, value: string) => {
    const lines = value.replace(/\r\n/g, '\n').split('\n');
    while (lines.length > 0) {
      const first = lines[0].trim();
      if (!first) {
        lines.shift();
        continue;
      }
      const isLegacyTargetLine =
        /^to\s*:/i.test(first) ||
        /^#[a-z0-9-]+$/i.test(first) ||
        /^@[a-z0-9-]+$/i.test(first);
      // Never send legacy target-lines in body text.
      if (isLegacyTargetLine) {
        lines.shift();
        continue;
      }
      break;
    }
    const cleaned = lines.join('\n').trim();
    // Defensive for DM targets: do not send a lone mention header as message body.
    if (action.channelId.startsWith('dm-') && /^@[a-z0-9-]+$/i.test(cleaned)) return '';
    return cleaned;
  };
  const sendAction = (action: CanvasAction) => {
    const text = sanitizeDraftForSend(action, draftInputs[action.id] ?? action.ghostText);
    if (!text) return;
    // Local create only: avoid double-post when websocket echo also appends.
    createMessage({ channelId: action.channelId, userId: 'you', text });
    setActiveChannel(action.channelId);
    setActiveView('channel');
    closeRunCanvas();
    setDraftInputs((prev) => {
      const next = { ...prev };
      delete next[action.id];
      return next;
    });
  };
  return (
    <aside
      className="flex flex-col"
      style={{
        flex: '0 1 clamp(300px, 42vw, 680px)',
        width: 'clamp(300px, 42vw, 680px)',
        maxWidth: '50vw',
        minWidth: '280px',
        position: 'relative',
        zIndex: 5,
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg)',
        boxShadow: '-6px 0 16px rgba(15, 23, 42, 0.07)',
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
        {contentParts.map((part, idx) => {
          if (part.type === 'markdown') {
            return (
              <div key={`md-${idx}`} style={{ marginBottom: 'var(--s3)' }}>
                <MarkdownContent markdown={part.value || '_No deliverable yet. Keep this run open as it continues._'} />
              </div>
            );
          }
          if (part.type !== 'action') return null;
          const action = part.action;
          const draftValue = draftInputs[action.id] ?? action.ghostText;
          return (
            <div key={`action-${action.id}-${idx}`} style={{ margin: '8px 0 12px' }}>
              <div
                className="flex items-end gap-2"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '6px 8px 6px 6px',
                  background: 'var(--bg)',
                }}
              >
                <img
                  src={you.avatarUrl}
                  alt={you.displayName}
                  width={24}
                  height={24}
                  style={{ width: '24px', height: '24px', borderRadius: '6px', objectFit: 'cover' }}
                />
                <div style={{ flex: 1 }}>
                  <textarea
                    rows={3}
                    value={draftValue}
                    onChange={(event) => {
                      const next = event.currentTarget.value;
                      setDraftInputs((prev) => ({ ...prev, [action.id]: next }));
                    }}
                    onFocus={(event) => {
                      if (draftInputs[action.id] !== undefined) return;
                      event.currentTarget.setSelectionRange(0, event.currentTarget.value.length);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendAction(action);
                      }
                    }}
                    className="flex-1 resize-none outline-none bg-transparent"
                    style={{
                      width: '100%',
                      fontSize: 'var(--font-base)',
                      lineHeight: 'var(--lh-base)',
                      color: draftInputs[action.id] === undefined ? 'var(--muted)' : 'var(--text)',
                      minHeight: '60px',
                      maxHeight: '60px',
                      overflowY: 'auto',
                    }}
                  />
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    sendAction(action);
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
          );
        })}
      </div>
    </aside>
  );
}
