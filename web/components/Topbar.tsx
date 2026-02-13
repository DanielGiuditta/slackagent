'use client';

import { useStore } from '@/lib/store';

export function Topbar() {
  const activeChannelId = useStore((s) => s.activeChannelId);
  const channels = useStore((s) => s.channels);
  const activeView = useStore((s) => s.activeView);
  const channel = channels.find((item) => item.id === activeChannelId);
  const title =
    activeView === 'channel'
      ? channel?.type === 'dm'
        ? channel.name
        : `#${activeChannelId}`
      : activeView === 'replies'
        ? 'Replies'
      : activeView === 'runs'
        ? 'Runs'
        : '✦ Autopilot';

  return (
    <header
      className="flex items-center shrink-0 px-5"
      style={{
        height: 'var(--topbar-h)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <div className="flex items-center gap-2">
        <h1
          className="font-bold"
          style={{
            fontSize: 'var(--font-large)',
            color: 'var(--text)',
            lineHeight: 'var(--lh-tight)',
          }}
        >
          {title}
        </h1>
      </div>
    </header>
  );
}
