'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { MessageRow } from './MessageRow';

export function MessageList() {
  const messages = useStore((s) => s.messages);
  const runs = useStore((s) => s.runs);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const channels = useStore((s) => s.channels);
  const typing = useStore((s) => s.typing);
  const endRef = useRef<HTMLDivElement>(null);
  const channelMeta = channels.find((channel) => channel.id === activeChannelId);

  // Root messages for this channel (no parentId)
  const rootMessages = messages
    .filter((m) => {
      if (m.channelId !== activeChannelId || m.parentId) return false;
      if (m.kind === 'deliverable' && m.runId) {
        const run = runs[m.runId];
        if (run && run.container.id === activeChannelId) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => a.ts - b.ts);

  // Auto-scroll on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rootMessages.length]);

  const showTyping =
    typing && typing.channelId === activeChannelId && !typing.parentId;

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ padding: 'var(--s2) var(--s5)' }}
    >
      {rootMessages.length === 0 && (
        <div
          className="flex items-center justify-center h-full"
          style={{ color: 'var(--muted)', fontSize: 'var(--font-base)' }}
        >
          {channelMeta?.type === 'dm' ? `No messages yet in ${channelMeta.name}` : `No messages yet in #${activeChannelId}`}
        </div>
      )}

      {rootMessages.map((msg) => {
        const replies = messages.filter((m) => m.parentId === msg.id);
        const lastReply = replies.length
          ? replies.reduce((a, b) => (a.ts > b.ts ? a : b))
          : undefined;

        return (
          <MessageRow
            key={msg.id}
            message={msg}
            replyCount={replies.length}
            lastReplyTs={lastReply?.ts}
          />
        );
      })}

      {showTyping && (
        <div
          className="italic"
          style={{
            padding: 'var(--s2)',
            fontSize: 'var(--font-small)',
            color: 'var(--muted)',
          }}
        >
          &hellip; {typing!.userId} is typing
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
