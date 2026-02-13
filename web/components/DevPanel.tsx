'use client';

import { useStore } from '@/lib/store';

const API = 'http://localhost:4000';

export function DevPanel() {
  const toggleDevPanel = useStore((s) => s.toggleDevPanel);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const activeThreadRootId = useStore((s) => s.activeThreadRootId);
  const messages = useStore((s) => s.messages);
  const openThread = useStore((s) => s.openThread);
  const closeThread = useStore((s) => s.closeThread);
  const setTyping = useStore((s) => s.setTyping);

  const inject = (body: Record<string, unknown>) =>
    fetch(`${API}/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const injectBotMessage = () =>
    inject({
      channelId: activeChannelId,
      userId: 'partnerbot',
      text: 'Hello from PartnerBot! This is an injected message.',
      isBot: true,
    });

  const injectReply = () => {
    const roots = messages.filter(
      (m) => m.channelId === activeChannelId && !m.parentId
    );
    const last = roots[roots.length - 1];
    if (!last) return;
    inject({
      channelId: activeChannelId,
      userId: 'kai',
      text: 'This is a sample reply injected via DevPanel.',
      isBot: false,
      parentId: last.id,
    });
  };

  const toggleThread = () => {
    if (activeThreadRootId) {
      closeThread();
    } else {
      const roots = messages.filter(
        (m) => m.channelId === activeChannelId && !m.parentId
      );
      const last = roots[roots.length - 1];
      if (last) openThread(last.id);
    }
  };

  const toggleBotTyping = () => {
    setTyping({
      userId: 'PartnerBot',
      channelId: activeChannelId,
      parentId: activeThreadRootId || undefined,
    });
    setTimeout(() => setTyping(null), 3000);
  };

  const buttons: { label: string; icon: string; action: () => void }[] = [
    { label: 'Inject sample message', icon: '\uD83D\uDCAC', action: injectBotMessage },
    { label: 'Inject sample reply', icon: '\u21A9\uFE0F', action: injectReply },
    { label: 'Toggle thread', icon: '\uD83E\uDDF5', action: toggleThread },
    { label: 'Toggle bot typing indicator', icon: '\u2328\uFE0F', action: toggleBotTyping },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)', pointerEvents: 'none' }}
    >
      <div
        className="shadow-2xl"
        style={{
          background: 'var(--bg)',
          color: 'var(--text)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--s5)',
          width: '380px',
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--s4)' }}>
          <h2 className="font-bold" style={{ fontSize: 'var(--font-large)' }}>
            Dev Panel
          </h2>
          <div className="flex items-center gap-2">
            <kbd
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
              }}
            >
              {typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '\u2318' : 'Ctrl+'}K
            </kbd>
            <button
              type="button"
              onClick={toggleDevPanel}
              aria-label="Close dev panel"
              title="Close dev panel"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg)',
                color: 'var(--muted)',
                fontSize: '12px',
                lineHeight: 1,
                width: '24px',
                height: '24px',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col" style={{ gap: 'var(--s2)' }}>
          {buttons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              className="text-left font-medium transition-opacity hover:opacity-80"
              style={{
                padding: 'var(--s3) var(--s4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 'var(--font-base)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {btn.icon}&ensp;{btn.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <p
          style={{
            marginTop: 'var(--s4)',
            fontSize: 'var(--font-small)',
            color: 'var(--muted)',
          }}
        >
          Channel: <strong>#{activeChannelId}</strong>
          {activeThreadRootId && (
            <span> &middot; Thread: <code>{activeThreadRootId}</code></span>
          )}
        </p>
      </div>
    </div>
  );
}
