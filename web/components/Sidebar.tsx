'use client';

import { useStore } from '@/lib/store';

export function Sidebar() {
  const channels = useStore((s) => s.channels);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const setActiveChannel = useStore((s) => s.setActiveChannel);
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const channelRows = channels.filter((channel) => channel.type !== 'dm');
  const dmRows = channels.filter((channel) => channel.type === 'dm');

  return (
    <aside
      className="flex flex-col shrink-0 overflow-y-auto select-none"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--sidebar-bg)',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Workspace name */}
      <div
        className="flex items-center px-4 font-bold text-white shrink-0 border-b border-white/10"
        style={{ height: 'var(--topbar-h)' }}
      >
        <span style={{ fontSize: 'var(--font-large)' }}>Acme Inc</span>
      </div>

      {/* Channel list */}
      <nav className="flex-1 px-2 py-3">
        <div
          className="uppercase tracking-wider font-semibold px-2 mb-1"
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.05em',
          }}
        >
          Views
        </div>

        {[
          { id: 'channel', label: 'Channels', icon: '#' },
          { id: 'runs', label: 'Runs', icon: '▶' },
          { id: 'app_home', label: 'Autopilot', icon: '✦' },
        ].map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id as 'channel' | 'runs' | 'app_home')}
              className="w-full text-left rounded flex items-center gap-2 transition-colors"
              style={{
                padding: 'var(--s1) var(--s2)',
                marginBottom: 'var(--s0)',
                fontSize: 'var(--font-base)',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'var(--font-small)' }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', margin: 'var(--s2) var(--s2)' }} />

        <div
          className="uppercase tracking-wider font-semibold px-2 mb-1"
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.05em',
          }}
        >
          Channels
        </div>

        {channelRows.map((ch) => {
          const isActive = activeChannelId === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setActiveChannel(ch.id)}
              className="w-full text-left rounded flex items-center gap-2 transition-colors"
              style={{
                padding: 'var(--s1) var(--s2)',
                marginBottom: 'var(--s0)',
                fontSize: 'var(--font-base)',
                lineHeight: 'var(--lh-tight)',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'var(--font-small)' }}>
                #
              </span>
              {ch.name}
            </button>
          );
        })}

        <div
          className="uppercase tracking-wider font-semibold px-2 mb-1"
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.05em',
            marginTop: 'var(--s2)',
          }}
        >
          DMs
        </div>

        {dmRows.map((dm) => {
          const isActive = activeChannelId === dm.id;
          return (
            <button
              key={dm.id}
              type="button"
              onClick={() => setActiveChannel(dm.id)}
              className="w-full text-left rounded flex items-center gap-2 transition-colors"
              style={{
                padding: 'var(--s1) var(--s2)',
                marginBottom: 'var(--s0)',
                fontSize: 'var(--font-base)',
                lineHeight: 'var(--lh-tight)',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                background: isActive ? 'var(--sidebar-active)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'var(--font-small)' }}>
                {dm.isAgent ? '✦' : '•'}
              </span>
              {dm.name}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
