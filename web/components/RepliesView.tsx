'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import type { Channel, Message, UserProfile } from '@/lib/types';

const CURRENT_USER_ID = 'you';

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function channelLabel(channel: Channel | undefined): string {
  if (!channel) return '';
  if (channel.type === 'dm') return channel.name;
  return `#${channel.name}`;
}

function preview(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

type ThreadSummary = {
  root: Message;
  replies: Message[];
  latestReply: Message;
  channel: Channel | undefined;
  rootAuthor: UserProfile;
};

export function RepliesView() {
  const messages = useStore((s) => s.messages);
  const channels = useStore((s) => s.channels);
  const getUserProfile = useStore((s) => s.getUserProfile);
  const openThread = useStore((s) => s.openThread);
  const setActiveChannel = useStore((s) => s.setActiveChannel);

  const threads = useMemo((): ThreadSummary[] => {
    const messageById = new Map<string, Message>();
    messages.forEach((m) => messageById.set(m.id, m));

    const channelById = new Map<string, Channel>();
    channels.forEach((c) => channelById.set(c.id, c));

    const repliesByRoot = new Map<string, Message[]>();
    for (const msg of messages) {
      if (!msg.parentId) continue;
      if (msg.kind === 'deliverable') continue;
      const list = repliesByRoot.get(msg.parentId) ?? [];
      list.push(msg);
      repliesByRoot.set(msg.parentId, list);
    }

    const out: ThreadSummary[] = [];
    for (const [rootId, replies] of repliesByRoot.entries()) {
      const root = messageById.get(rootId);
      if (!root) continue;

      // Slack-like filter: only show threads you're "in".
      const involvesYou = root.userId === CURRENT_USER_ID || replies.some((r) => r.userId === CURRENT_USER_ID);
      if (!involvesYou) continue;

      const sortedReplies = [...replies].sort((a, b) => a.ts - b.ts);
      const latestReply = sortedReplies[sortedReplies.length - 1];
      out.push({
        root,
        replies: sortedReplies,
        latestReply,
        channel: channelById.get(root.channelId),
        rootAuthor: getUserProfile(root.userId),
      });
    }

    return out.sort((a, b) => b.latestReply.ts - a.latestReply.ts);
  }, [channels, getUserProfile, messages]);

  return (
    <div className="h-full overflow-y-auto" style={{ padding: 'var(--s4)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--s3)' }}>
        <div>
          <div style={{ fontSize: 'var(--font-large)', fontWeight: 800, color: 'var(--text)' }}>Replies</div>
          <div style={{ marginTop: '2px', fontSize: '12px', color: 'var(--muted)' }}>
            Threads you’re involved in, newest activity first
          </div>
        </div>
      </div>

      {threads.length === 0 ? (
        <div
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--s4)',
            color: 'var(--muted)',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          No replies yet. Reply in a thread and it’ll show up here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          {threads.map((thread) => {
            const meta = channelLabel(thread.channel);
            const replyAuthor = getUserProfile(thread.latestReply.userId);
            return (
              <button
                key={thread.root.id}
                type="button"
                onClick={() => {
                  // setActiveChannel resets thread state; open thread afterwards.
                  setActiveChannel(thread.root.channelId);
                  openThread(thread.root.id);
                }}
                className="w-full text-left transition-colors"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--s3)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg)';
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>{meta}</span>
                      <span>•</span>
                      <span>{thread.replies.length} repl{thread.replies.length === 1 ? 'y' : 'ies'}</span>
                    </div>

                    <div style={{ marginTop: '6px', color: 'var(--text)', fontSize: '13px', lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 700 }}>{thread.rootAuthor.displayName}:</span>{' '}
                      <span style={{ color: 'var(--muted)' }}>{preview(thread.root.text, 140)}</span>
                    </div>

                    <div style={{ marginTop: '8px', color: 'var(--text)', fontSize: '13px', lineHeight: 1.45 }}>
                      <span style={{ fontWeight: 700 }}>{replyAuthor.displayName}:</span>{' '}
                      <span>{preview(thread.latestReply.text, 160)}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {formatRelativeTime(thread.latestReply.ts)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

