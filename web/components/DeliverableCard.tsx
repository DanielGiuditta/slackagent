'use client';

import { useState, type ReactNode } from 'react';
import { MarkdownContent } from './MarkdownContent';

export interface DeliverableAction {
  id: string;
  label: string;
  ghostText: string;
}

interface DeliverableCardProps {
  markdown: string;
  onOpen: () => void;
  previewLines?: number;
  footer?: ReactNode;
  actions?: DeliverableAction[];
  onSendAction?: (actionId: string, text: string) => void;
}

function clampMarkdownLines(markdown: string, previewLines?: number) {
  if (!previewLines || previewLines <= 0) return markdown;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= previewLines) return markdown;
  return lines.slice(0, previewLines).join('\n');
}

export function sanitizeDeliverableMarkdown(markdown: string) {
  let normalized = markdown;

  // Some payloads arrive as JSON-encoded strings (e.g. "\"### Heading\\n- item\"").
  for (let i = 0; i < 2; i += 1) {
    const trimmed = normalized.trim();
    if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) break;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        normalized = parsed;
        continue;
      }
    } catch {
      // Keep original text when it is not valid JSON.
    }
    break;
  }

  // Decode escaped whitespace and common escaped markdown tokens.
  normalized = normalized
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\([`*_#[\]()>-])/g, '$1');

  return normalized
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (/^_Refreshed .*_$/.test(trimmed)) return false;
      if (/^Requested:\s*Autopilot execution:/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

export function DeliverableCard({
  markdown,
  onOpen,
  previewLines,
  footer,
  actions = [],
  onSendAction,
}: DeliverableCardProps) {
  const normalized = sanitizeDeliverableMarkdown(markdown);
  const totalLines = normalized.split('\n').length;
  const isTruncated = Boolean(previewLines && previewLines > 0 && totalLines > previewLines);
  const previewMarkdown = clampMarkdownLines(normalized, previewLines);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }
      }}
      style={{
        marginTop: 'var(--s1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg)',
        padding: 'var(--s3)',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.45 }}>
        <MarkdownContent markdown={previewMarkdown} />
      </div>
      {isTruncated && (
        <div style={{ marginTop: 'var(--s1)', fontSize: '11px', color: 'var(--muted)' }}>
          See more
        </div>
      )}
      {actions.length > 0 && (
        <div style={{ marginTop: 'var(--s2)', display: 'grid', gap: '8px' }}>
          {actions.map((action) => (
            <div key={action.id}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{action.label}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={draftInputs[action.id] || ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDraftInputs((prev) => ({ ...prev, [action.id]: next }));
                  }}
                  onClick={(event) => event.stopPropagation()}
                  placeholder={action.ghostText}
                  style={{
                    flex: 1,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    padding: '6px 8px',
                    fontSize: '12px',
                  }}
                />
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    const text = (draftInputs[action.id] || '').trim() || action.ghostText;
                    if (!text || !onSendAction) return;
                    onSendAction(action.id, text);
                    setDraftInputs((prev) => ({ ...prev, [action.id]: '' }));
                  }}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: '12px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {footer}
    </div>
  );
}
