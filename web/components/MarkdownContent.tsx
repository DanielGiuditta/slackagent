'use client';

import { Fragment, useState, type ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRegex = /(!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith('![')) {
      const imageMatch = token.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
      if (imageMatch) {
        nodes.push(
          <img
            key={`${match.index}-img`}
            src={imageMatch[2]}
            alt={imageMatch[1] || 'Deliverable image'}
            style={{
              maxWidth: '100%',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              marginTop: '4px',
              marginBottom: '4px',
            }}
          />
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${match.index}-b`} style={{ fontWeight: 700 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`${match.index}-c`}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '12px',
            borderRadius: '4px',
            padding: '1px 4px',
            background: 'var(--surface)',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={`${match.index}-l`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--link)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

export function MarkdownContent({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx] || '';
    if (!line.trim()) {
      idx += 1;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      idx += 1;
      while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
        codeLines.push(lines[idx]);
        idx += 1;
      }
      idx += 1;
      blocks.push(
        <pre
          key={`code-${idx}`}
          style={{
            margin: '10px 0',
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: '#f8f8f8',
            overflowX: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      blocks.push(
        <div
          key={`h-${idx}`}
          style={{
            marginTop: depth === 1 ? '14px' : '10px',
            marginBottom: '6px',
            fontWeight: 700,
            fontSize: depth === 1 ? '20px' : depth === 2 ? '16px' : '14px',
            lineHeight: 1.3,
          }}
        >
          {renderInline(headingMatch[2])}
        </div>
      );
      idx += 1;
      continue;
    }
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: string[] = [];
      while (idx < lines.length) {
        const match = (lines[idx] || '').match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
        if (!match) break;
        const sameType = ordered ? /\d+\./.test(match[2]) : /[-*]/.test(match[2]);
        if (!sameType) break;
        items.push(match[3]);
        idx += 1;
      }
      blocks.push(
        ordered ? (
          <ol
            key={`ol-${idx}`}
            style={{ margin: '8px 0 8px 20px', paddingLeft: '12px', listStyleType: 'decimal', listStylePosition: 'outside' }}
          >
            {items.map((item, itemIdx) => (
              <li key={`oli-${idx}-${itemIdx}`} style={{ margin: '4px 0' }}>
                {renderInline(item)}
              </li>
            ))}
          </ol>
        ) : (
          <ul
            key={`ul-${idx}`}
            style={{ margin: '8px 0 8px 20px', paddingLeft: '12px', listStyleType: 'disc', listStylePosition: 'outside' }}
          >
            {items.map((item, itemIdx) => {
              const taskMatch = item.match(/^\[( |x|X)\]\s+(.+)$/);
              if (!taskMatch) {
                return (
                  <li key={`uli-${idx}-${itemIdx}`} style={{ margin: '4px 0' }}>
                    {renderInline(item)}
                  </li>
                );
              }

              const taskId = `task-${idx}-${itemIdx}`;
              const initialChecked = taskMatch[1].toLowerCase() === 'x';
              const checked = checkedTasks[taskId] ?? initialChecked;
              return (
                <li key={`uli-${idx}-${itemIdx}`} style={{ margin: '4px 0', listStyleType: 'none' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const next = event.currentTarget.checked;
                        setCheckedTasks((prev) => ({ ...prev, [taskId]: next }));
                      }}
                      style={{ marginTop: '2px' }}
                    />
                    <span>{renderInline(taskMatch[2])}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )
      );
      continue;
    }
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (idx < lines.length && (lines[idx] || '').startsWith('> ')) {
        quoteLines.push((lines[idx] || '').slice(2));
        idx += 1;
      }
      blocks.push(
        <blockquote
          key={`q-${idx}`}
          style={{
            margin: '10px 0',
            padding: '6px 10px',
            borderLeft: '3px solid var(--border)',
            color: 'var(--muted)',
            background: 'var(--surface)',
          }}
        >
          {quoteLines.map((quoteLine, quoteIdx) => (
            <Fragment key={`q-line-${idx}-${quoteIdx}`}>
              {renderInline(quoteLine)}
              {quoteIdx < quoteLines.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (idx < lines.length && lines[idx].trim()) {
      const current = lines[idx];
      if (/^(#{1,3})\s+/.test(current) || /^(\s*)([-*]|\d+\.)\s+/.test(current) || current.trim().startsWith('```')) {
        break;
      }
      paragraphLines.push(current);
      idx += 1;
    }
    blocks.push(
      <p key={`p-${idx}`} style={{ margin: '8px 0', lineHeight: 1.6, whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <Fragment key={`p-line-${idx}-${lineIndex}`}>
            {renderInline(paragraphLine)}
            {lineIndex < paragraphLines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    );
  }

  return (
    <div style={{ maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
      {blocks}
    </div>
  );
}
