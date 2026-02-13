'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { useStore } from '@/lib/store';

export function RunsPanel() {
  const runs = useStore((s) => s.runs);
  const channels = useStore((s) => s.channels);
  const openRunThread = useStore((s) => s.openRunThread);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'completed'>('all');

  const rows = useMemo(() => {
    const all = Object.values(runs).sort((a, b) => b.createdAt - a.createdAt);
    return all.filter((run) => {
      if (status === 'active' && !['running', 'needs_approval', 'paused'].includes(run.status)) return false;
      if (status === 'completed' && run.status !== 'completed') return false;
      if (query && !run.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, runs, status]);

  return (
    <div className="flex flex-col h-full" style={{ padding: 'var(--s4)' }}>
      <h2 style={{ fontSize: 'var(--font-large)', fontWeight: 700 }}>Runs</h2>
      <div className="flex gap-2" style={{ marginTop: 'var(--s2)' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search runs"
          style={inputStyle}
        />
        {(['all', 'active', 'completed'] as const).map((item) => (
          <button
            key={item}
            onClick={() => setStatus(item)}
            style={{
              ...chipStyle,
              background: status === item ? 'var(--sidebar-active)' : 'var(--surface)',
              color: status === item ? '#fff' : 'var(--text)',
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ marginTop: 'var(--s3)' }}>
        {rows.map((run) => (
          <button
            key={run.id}
            onClick={() => openRunThread(run.id)}
            className="w-full text-left"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--s3)',
              marginBottom: 'var(--s2)',
              background: 'var(--bg)',
              cursor: 'pointer',
            }}
          >
            <div className="flex items-center justify-between">
              <strong>{run.title}</strong>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{run.status}</span>
            </div>
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--muted)' }}>
              {run.container.type === 'channel' ? '#' : ''}
              {channels.find((channel) => channel.id === run.container.id)?.name || run.container.id}
            </div>
            <div style={{ fontSize: 'var(--font-small)', color: 'var(--muted)', marginTop: 'var(--s1)' }}>
              Step {run.stepCurrent || 0}/{run.stepTotal || 0} - {run.latestUpdate}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  flex: 1,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 8px',
  fontSize: 'var(--font-small)',
};

const chipStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '4px 10px',
  fontSize: '11px',
  cursor: 'pointer',
};
