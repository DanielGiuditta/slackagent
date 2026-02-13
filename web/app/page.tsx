'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { connectWS } from '@/lib/ws';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { MessageList } from '@/components/MessageList';
import { Composer } from '@/components/Composer';
import { ThreadPanel } from '@/components/ThreadPanel';
import { DevPanel } from '@/components/DevPanel';
import { RunsPanel } from '@/components/RunsPanel';
import { AppHome } from '@/components/AppHome';
import { RunCanvasPanel } from '@/components/RunCanvasPanel';

export default function Home() {
  const activeThreadRootId = useStore((s) => s.activeThreadRootId);
  const activeView = useStore((s) => s.activeView);
  const canvasRunId = useStore((s) => s.canvasRunId);
  const devPanelOpen = useStore((s) => s.devPanelOpen);
  const toggleDevPanel = useStore((s) => s.toggleDevPanel);

  /* Connect WebSocket on mount */
  useEffect(() => {
    connectWS();
  }, []);

  /* Auto-recover from stale chunk/hydration load failures */
  useEffect(() => {
    const maybeRecover = (reason: unknown) => {
      const text = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '';
      if (!text) return;
      const isChunkFailure =
        /ChunkLoadError/i.test(text) ||
        /Loading chunk [\w-]+ failed/i.test(text) ||
        /Failed to fetch dynamically imported module/i.test(text);
      if (!isChunkFailure) return;
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => maybeRecover(event.error ?? event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => maybeRecover(event.reason);

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  /* Cmd+K / Ctrl+K to toggle dev panel */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleDevPanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleDevPanel]);

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* ─── Workspace Rail ─── */}
      <div
        className="flex flex-col items-center shrink-0 select-none"
        style={{
          width: 'var(--rail-w)',
          background: 'var(--sidebar-bg)',
          paddingTop: 'var(--s3)',
          paddingBottom: 'var(--s3)',
        }}
      >
        {/* Workspace icon */}
        <div
          className="flex items-center justify-center text-white font-black"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255,255,255,0.22)',
            fontSize: 'var(--font-large)',
          }}
        >
          A
        </div>

        {/* Divider */}
        <div
          className="w-8 my-2"
          style={{ height: '1px', background: 'rgba(255,255,255,0.15)' }}
        />

        {/* Nav dots (decorative) */}
        {['\uD83D\uDCAC', '\uD83D\uDD14', '\u2026'].map((icon, i) => (
          <div
            key={i}
            className="flex items-center justify-center"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              fontSize: '16px',
              marginTop: 'var(--s1)',
              opacity: 0.6,
              cursor: 'default',
            }}
          >
            {icon}
          </div>
        ))}
      </div>

      {/* ─── Sidebar ─── */}
      <Sidebar />

      {/* ─── Main Channel Area ─── */}
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        {activeView === 'channel' ? (
          <>
            <MessageList />
            <Composer />
          </>
        ) : activeView === 'runs' ? (
          <RunsPanel />
        ) : (
          <AppHome />
        )}
      </div>

      {/* ─── Thread Panel ─── */}
      {activeView === 'channel' && activeThreadRootId && <ThreadPanel />}

      {/* ─── Run Canvas ─── */}
      {(activeView === 'channel' || activeView === 'app_home') && canvasRunId && <RunCanvasPanel />}

      {/* ─── Dev Panel (overlay) ─── */}
      {devPanelOpen && <DevPanel />}
    </div>
  );
}
