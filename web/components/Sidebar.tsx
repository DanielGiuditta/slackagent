'use client';

import type { ReactNode } from 'react';
import { useStore } from '@/lib/store';

type SidebarViewId = 'replies' | 'runs' | 'app_home';

export function Sidebar() {
  const channels = useStore((s) => s.channels);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const setActiveChannel = useStore((s) => s.setActiveChannel);
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const channelRows = channels.filter((channel) => channel.type !== 'dm');
  const dmRows = channels.filter((channel) => channel.type === 'dm');

  const viewItems: Array<{ id: SidebarViewId; label: string; icon: ReactNode }> = [
    { id: 'replies', label: 'Replies', icon: <RepliesIcon /> },
    { id: 'runs', label: 'Runs', icon: '▶' },
    { id: 'app_home', label: 'Autopilot', icon: '✦' },
  ];

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
        {/* Search (layout only) */}
        <div style={{ padding: '0 var(--s2)', marginBottom: 'var(--s3)' }}>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '16px',
                pointerEvents: 'none',
              }}
            >
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search"
              aria-label="Search"
              spellCheck={false}
              className="sidebar-search"
              style={{
                width: '100%',
                height: '30px',
                padding: '0 10px 0 28px',
                borderRadius: '8px',
                border: 'none',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                outline: 'none',
                fontSize: '13px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
            />
          </div>
        </div>

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

        {viewItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
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
              <span
                style={{
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: 'var(--font-small)',
                  display: 'inline-flex',
                  lineHeight: 0,
                }}
                aria-hidden="true"
              >
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
          const isActive = activeView === 'channel' && activeChannelId === ch.id;
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
          const isActive = activeView === 'channel' && activeChannelId === dm.id;
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

function RepliesIcon() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 4.5h11A2.5 2.5 0 0 1 18 7v5a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3v-3H4.5A2.5 2.5 0 0 1 2 12V7a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M7.5 9h5" />
      <path d="M11.5 7.5 13 9l-1.5 1.5" />
    </svg>
  );
}

// (Huddles removed from nav)
