'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useStore } from '@/lib/store';
import { submitAgentCommand } from '@/lib/agentApi';
import type { AgentCommand, Autopilot, OutputFormat, ToolToggles } from '@/lib/types';

interface ComposerProps {
  parentId?: string;
}

interface MentionOption {
  id: string;
  label: string;
  subtitle: string;
  token: string;
  avatarUrl?: string;
  icon?: string;
  invokesAgent?: boolean;
}

const AGENT_AVATAR_SRC = '/avatars/workspace-agent.svg';

function startsWithAgentAddressing(input: string) {
  return /^(@(agent|workspaceagent|workspace-agent)\b|\/agent\b|\/autopilot\b)/i.test(input.trim());
}

function stripAgentAddressing(input: string) {
  return input
    .replace(/^\/agent\s*/i, '')
    .replace(/^\/autopilot\s*/i, '')
    .replace(/@(agent|workspaceagent|workspace-agent)\b/gi, '')
    .trim();
}

function hasAgentAddressing(input: string) {
  return (
    /^\/agent\b/i.test(input.trim()) ||
    /^\/autopilot\b/i.test(input.trim()) ||
    /(^|\s)@(agent|workspaceagent|workspace-agent)\b/i.test(input)
  );
}

function hasChannelOnlyIntent(input: string) {
  return /\b(this channel|that channel|from this channel|from that channel|in this channel|in that channel|this chat|that chat|this thread|that thread|channel only|only this channel|only that channel)\b/i.test(
    input
  );
}

function inferAutopilotName(instruction: string, channelId: string, inThread: boolean) {
  const normalized = instruction.trim().replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  if (/\b(to-?do|task list|action items?)\b/.test(lower)) {
    return inThread ? 'Thread to-do list' : `To-do list from #${channelId}`;
  }
  if (/\b(summary|summarize|summarise|brief|recap|digest)\b/.test(lower)) {
    return inThread ? 'Thread summary' : `Summary from #${channelId}`;
  }
  const compact = normalized.replace(/[.!?]+$/g, '');
  if (!compact) return 'Autopilot';
  return compact.length > 44 ? `${compact.slice(0, 41)}...` : compact;
}

export function Composer({ parentId }: ComposerProps) {
  const MAX_TEXTAREA_HEIGHT = 240;
  const MIN_TEXTAREA_HEIGHT = 24;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [agentMode, setAgentMode] = useState(false);
  const [agentModeManuallyEnabled, setAgentModeManuallyEnabled] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [suppressPickerMenu, setSuppressPickerMenu] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('brief');
  const [requireApproval, setRequireApproval] = useState(false);
  const [tools, setTools] = useState<ToolToggles>({
    drive: false,
    calendar: false,
    codebase: true,
  });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [autopilotArmed, setAutopilotArmed] = useState(false);
  const [connectedApps, setConnectedApps] = useState({
    github: true,
    jira: true,
    notion: false,
    salesforce: false,
    zendesk: true,
  });
  const [contextSelection, setContextSelection] = useState({
    channel: true,
    thread: true,
    selectedMessages: true,
    files: true,
    people: true,
  });
  const [runStartedNotice, setRunStartedNotice] = useState<string | null>(null);

  const activeChannelId = useStore((s) => s.activeChannelId);
  const activeThreadRootId = useStore((s) => s.activeThreadRootId);
  const messages = useStore((s) => s.messages);
  const channels = useStore((s) => s.channels);
  const users = useStore((s) => s.users);
  const getRunByRootMessage = useStore((s) => s.getRunByRootMessage);
  const setSelectedRunId = useStore((s) => s.setSelectedRunId);
  const setActiveView = useStore((s) => s.setActiveView);
  const createMessage = useStore((s) => s.createMessage);
  const createAutopilot = useStore((s) => s.createAutopilot);
  const updateAutopilot = useStore((s) => s.updateAutopilot);
  const setAutopilotEditorId = useStore((s) => s.setAutopilotEditorId);
  const createRunFromCommand = useStore((s) => s.createRunFromCommand);
  const reconcileRunFromServer = useStore((s) => s.reconcileRunFromServer);
  const discardRun = useStore((s) => s.discardRun);

  const effectiveParentId = parentId || activeThreadRootId || undefined;
  const threadRun = effectiveParentId ? getRunByRootMessage(effectiveParentId) : undefined;

  const autoAgentModeByPrefix = startsWithAgentAddressing(text);
  const isAgentModeActive = agentModeManuallyEnabled || autoAgentModeByPrefix;

  useEffect(() => {
    setAgentMode(isAgentModeActive);
  }, [isAgentModeActive]);

  useEffect(() => {
    if (!runStartedNotice) return;
    const timeout = window.setTimeout(() => setRunStartedNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [runStartedNotice]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Slack-like behavior: grow with content until a max height, then scroll.
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${Math.max(MIN_TEXTAREA_HEIGHT, nextHeight)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }, [MAX_TEXTAREA_HEIGHT, MIN_TEXTAREA_HEIGHT, text]);

  const channelMeta = channels.find((channel) => channel.id === activeChannelId);

  const contextScope = useMemo(() => {
    const selectedMessages = effectiveParentId
      ? messages.filter((m) => m.parentId === effectiveParentId).slice(-2).map((m) => m.id)
      : messages.filter((m) => m.channelId === activeChannelId && !m.parentId).slice(-2).map((m) => m.id);
    return {
      channel: contextSelection.channel,
      thread: Boolean(effectiveParentId && contextSelection.thread),
      messages: contextSelection.selectedMessages ? selectedMessages : [],
      files: contextSelection.files ? ['Launch-brief.docx', 'customer-feedback.csv'] : [],
      people: contextSelection.people ? ['Alex', 'Priya'] : [],
    };
  }, [activeChannelId, contextSelection, effectiveParentId, messages]);

  const contextMessageExcerpts = useMemo(() => {
    const toExcerpt = (line: string) => line.trim().replace(/\s+/g, ' ').slice(0, 220);

    if (effectiveParentId) {
      const root = messages.find((m) => m.id === effectiveParentId);
      const replies = messages
        .filter((m) => m.parentId === effectiveParentId)
        .sort((a, b) => a.ts - b.ts)
        .slice(-14);
      const rows = [root, ...replies].filter(Boolean);
      return rows
        .map((m) => `${m!.userId}: ${toExcerpt(m!.text)}`)
        .filter((line) => line.length > 0)
        .slice(-15);
    }

    return messages
      .filter((m) => m.channelId === activeChannelId && !m.parentId)
      .sort((a, b) => a.ts - b.ts)
      .slice(-20)
      .map((m) => `${m.userId}: ${toExcerpt(m.text)}`)
      .filter((line) => line.length > 0);
  }, [activeChannelId, effectiveParentId, messages]);

  const looksRepeating = /\bevery day|daily|every morning|weekday|weekdays|weekly|at \d|every hour|hourly|every monday|every friday\b/i.test(
    text
  );

  const pickerState = useMemo(() => {
    const safeCaret = Math.max(0, Math.min(caretPos, text.length));
    const uptoCaret = text.slice(0, safeCaret);
    const match = uptoCaret.match(/(^|\s)([@#])([\w-]*)$/);
    if (!match) return null;
    const trigger = match[2] as '@' | '#';
    const query = (match[3] || '').toLowerCase();
    return {
      start: safeCaret - query.length - 1,
      end: safeCaret,
      trigger,
      query,
    };
  }, [caretPos, text]);

  const pickerOptions = useMemo<MentionOption[]>(() => {
    if (!pickerState) return [];

    if (pickerState.trigger === '#') {
      const channelRows = channels
        .filter((channel) => channel.type !== 'dm')
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((channel) => ({
          id: channel.id,
          label: channel.name,
          subtitle: 'Channel',
          token: `#${channel.name}`,
          icon: '#',
        }));
      if (!pickerState.query) return channelRows;
      return channelRows.filter((option) => option.label.toLowerCase().includes(pickerState.query));
    }

    const topUsers = Object.values(users)
      .filter((profile) => !profile.isBot && profile.id !== 'you')
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 6)
      .map((profile) => ({
        id: profile.id,
        label: profile.displayName,
        subtitle: profile.role,
        token: `@${profile.id}`,
        avatarUrl: profile.avatarUrl,
      }));

    const all = [
      {
        id: 'workspace-agent',
        label: 'Agent',
        subtitle: 'AI Teammate',
        token: '@agent',
        avatarUrl: users['workspace-agent']?.avatarUrl || AGENT_AVATAR_SRC,
        icon: '✦',
        invokesAgent: true,
      },
      ...topUsers,
    ];

    if (!pickerState.query) return all;
    return all.filter((option) => {
      const haystack = `${option.label} ${option.id} ${option.token}`.toLowerCase();
      return haystack.includes(pickerState.query);
    });
  }, [channels, pickerState, users]);

  const showPickerMenu = Boolean(!suppressPickerMenu && pickerState && pickerOptions.length > 0);

  useEffect(() => {
    setMentionIndex(0);
  }, [pickerState?.query, pickerState?.start, pickerState?.trigger]);

  const insertTokenAtCaret = (
    token: string,
    opts?: { ensureAgentAddressing?: boolean; suppressPicker?: boolean; forceTrailingSpace?: boolean }
  ) => {
    if (opts?.suppressPicker) setSuppressPickerMenu(true);
    const currentCaret = textareaRef.current?.selectionStart ?? caretPos ?? text.length;
    let workingText = text;
    let workingCaret = currentCaret;

    if (opts?.ensureAgentAddressing && !hasAgentAddressing(workingText)) {
      const prefix = '@agent ';
      workingText = workingText.trim().length > 0 ? `${prefix}${workingText}` : prefix;
      workingCaret += prefix.length;
      setAgentModeManuallyEnabled(true);
    }

    const before = workingText.slice(0, workingCaret);
    const after = workingText.slice(workingCaret);
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
    const needsTrailingSpace = opts?.forceTrailingSpace ? true : after.length > 0 && !/^\s/.test(after);

    const nextText = `${before}${needsLeadingSpace ? ' ' : ''}${token}${needsTrailingSpace ? ' ' : ''}${after}`;
    const nextCaret = before.length + (needsLeadingSpace ? 1 : 0) + token.length + (needsTrailingSpace ? 1 : 0);
    setText(nextText);
    setCaretPos(nextCaret);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const ensureAgentAddressingInComposer = () => {
    setSuppressPickerMenu(true);
    setAgentModeManuallyEnabled(true);
    if (hasAgentAddressing(text)) {
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    insertTokenAtCaret('@agent', { suppressPicker: true, forceTrailingSpace: true });
  };

  const applyPickerOption = (option: MentionOption) => {
    if (!pickerState) return;
    setSuppressPickerMenu(false);
    const before = text.slice(0, pickerState.start);
    const after = text.slice(pickerState.end);
    const nextText = `${before}${option.token} ${after}`;
    const nextCaret = before.length + option.token.length + 1;
    setText(nextText);
    setCaretPos(nextCaret);
    if (option.invokesAgent) setAgentModeManuallyEnabled(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const buildAutopilotDraft = (overrides?: Partial<Omit<Autopilot, 'id'>>): Omit<Autopilot, 'id'> => {
    const baseInstruction = stripAgentAddressing(text.trim()) || 'Summarize important updates and action items.';
    const channelOnlyIntent = hasChannelOnlyIntent(baseInstruction);
    const scopedInstruction =
      channelOnlyIntent && channelMeta?.type !== 'dm'
        ? `Use only messages from channel #${activeChannelId}. Do not use context from any other channel or DM.\n\n${baseInstruction}`
        : baseInstruction;
    const inferredName = inferAutopilotName(baseInstruction, activeChannelId, Boolean(threadRun));
    return {
      name: inferredName,
      instruction: scopedInstruction,
      cadenceText: 'Weekdays at 9:00 AM PT',
      destinationType: channelMeta?.type === 'dm' ? 'dm' : 'channel',
      destinationId: activeChannelId,
      scope: {
        ...contextScope,
        channel: channelOnlyIntent ? true : contextScope.channel,
        thread: channelOnlyIntent ? false : contextScope.thread,
      },
      tools,
      outputFormat,
      outputMode: outputFormat === 'doc' ? 'canvasPrimary' : 'threadRuns',
      canvasId: undefined,
      isPaused: false,
      lastRunAt: undefined,
      ...overrides,
    };
  };

  const inferCadenceTextFromInput = (input: string) => {
    const textLower = input.toLowerCase();
    const minuteMatch = textLower.match(/every\s+(\d+)\s+minute/);
    if (minuteMatch) return `Every ${minuteMatch[1]} minutes`;
    const hourMatch = textLower.match(/every\s+(\d+)\s+hour/);
    if (hourMatch) return `Every ${hourMatch[1]} hours`;
    if (/\bevery hour\b|\bhourly\b/.test(textLower)) return 'Every hour';
    if (/\bweekday|weekdays\b/.test(textLower)) return 'Weekdays at 9:00 AM PT';
    if (/\bweekly\b/.test(textLower)) return 'Weekly at 9:00 AM PT';
    if (/\bdaily|every day|every morning\b/.test(textLower)) return 'Every day at 9:00 AM PT';
    return 'On trigger (message match)';
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const commandText = stripAgentAddressing(trimmed);
    const hasAddressing = hasAgentAddressing(trimmed);
    const inRunThread = Boolean(effectiveParentId && threadRun);
    const baseCommand: AgentCommand = {
      text: commandText || trimmed,
      container: { type: channelMeta?.type === 'dm' ? 'dm' : 'channel', id: activeChannelId },
      inThread: effectiveParentId
        ? {
            threadId: effectiveParentId,
            runId: threadRun?.id,
          }
        : undefined,
      contextMessages: contextMessageExcerpts,
      scope: contextScope,
      tools,
      outputFormat,
      requireApproval,
      asAutopilot: false,
    };

    if (!isAgentModeActive) {
      createMessage({
        channelId: activeChannelId,
        userId: 'you',
        text: trimmed,
        parentId,
      });
      setText('');

      if (hasAddressing && commandText) {
        const botRun = createRunFromCommand(baseCommand);
        setSelectedRunId(botRun.id);
      }
      return;
    }

    if (inRunThread && threadRun) {
      createMessage({
        channelId: activeChannelId,
        parentId: effectiveParentId,
        userId: 'you',
        text: commandText || trimmed,
      });
      const continuedRun = createRunFromCommand(baseCommand, {
        continueRunId: threadRun.id,
        continueRootId: threadRun.rootMessageId,
      });
      setSelectedRunId(continuedRun.id);
      setRunStartedNotice(`Continuing run: ${continuedRun.title}`);
      setText('');
      return;
    }

    if (!baseCommand.text.trim()) return;

    if (looksRepeating && baseCommand.text && autopilotArmed) {
      const created = createAutopilot(
        buildAutopilotDraft({
          cadenceText: inferCadenceTextFromInput(baseCommand.text),
        })
      );
      setAutopilotEditorId(created.id);
      setActiveView('app_home');
      setText('');
      setAutopilotArmed(false);

      const scopedMessages = messages
        .filter(
          (message) =>
            message.channelId === created.destinationId &&
            !message.parentId &&
            message.kind === 'message' &&
            !message.isBot
        )
        .sort((a, b) => a.ts - b.ts)
        .slice(-20)
        .map((message) => `${message.userId}: ${message.text}`);
      const scopeGuard =
        created.destinationType === 'channel'
          ? `Scope constraint: use only channel #${created.destinationId}. Ignore references to other channels/DMs and do not include them in the output.`
          : `Scope constraint: use only DM ${created.destinationId}. Do not use any other conversation.`;
      const autopilotRunCommand: AgentCommand = {
        text: `${scopeGuard}\n\n${created.instruction}`,
        container: { type: created.destinationType, id: created.destinationId },
        scope: created.scope,
        tools: created.tools,
        outputFormat: created.outputFormat,
        requireApproval: false,
        asAutopilot: true,
        contextMessages: scopedMessages,
      };

      const optimisticAutopilotRun = createRunFromCommand(autopilotRunCommand);
      useStore.setState((state) => ({
        runs: state.runs[optimisticAutopilotRun.id]
          ? {
              ...state.runs,
              [optimisticAutopilotRun.id]: {
                ...state.runs[optimisticAutopilotRun.id],
                autopilotId: created.id,
              },
            }
          : state.runs,
      }));

      try {
        const response = await submitAgentCommand(autopilotRunCommand);
        const reconciled = reconcileRunFromServer(optimisticAutopilotRun.id, response.run);
        useStore.setState((state) => ({
          runs: state.runs[reconciled.id]
            ? {
                ...state.runs,
                [reconciled.id]: {
                  ...state.runs[reconciled.id],
                  autopilotId: created.id,
                },
              }
            : state.runs,
          messages: state.messages.map((message) =>
            message.kind === 'deliverable' && message.runId === reconciled.id && !message.autopilotId
              ? { ...message, autopilotId: created.id }
              : message
          ),
        }));
        updateAutopilot(created.id, { lastRunAt: Date.now() });
      } catch (error) {
        discardRun(optimisticAutopilotRun.id);
        const detail = error instanceof Error ? error.message : 'Agent backend unavailable';
        createMessage({
          channelId: created.destinationId,
          userId: 'workspace-agent',
          isBot: true,
          text: `Autopilot run failed: ${detail}.`,
        });
      }
      return;
    }

    const optimisticRun = createRunFromCommand(baseCommand);
    setSelectedRunId(optimisticRun.id);
    setRunStartedNotice(`Started run: ${optimisticRun.title}`);

    try {
      const response = await submitAgentCommand(baseCommand);
      reconcileRunFromServer(optimisticRun.id, response.run);
    } catch (error) {
      discardRun(optimisticRun.id);
      const detail = error instanceof Error ? error.message : 'Agent backend unavailable';
      createMessage({
        channelId: activeChannelId,
        parentId: effectiveParentId,
        userId: 'workspace-agent',
        isBot: true,
        text: `Agent call failed: ${detail}.`,
      });
      return;
    }

    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPickerMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % pickerOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + pickerOptions.length) % pickerOptions.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        applyPickerOption(pickerOptions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCaretPos(-1);
        setToolsOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const starterPrompts = [
    { label: 'Summarize', prompt: 'Summarize this channel since yesterday.' },
    { label: 'To-do', prompt: 'Extract a to-do list with owners and due dates (if mentioned).' },
  ];

  const placeholder = agentMode
    ? threadRun
      ? 'Follow up in this run...'
      : 'Ask Agent to run something...'
    : parentId
      ? 'Reply...'
      : channelMeta?.type === 'dm'
        ? `Message ${channelMeta.name}`
        : `Message #${activeChannelId}`;
  const sendLabel = agentMode ? (threadRun ? 'Run follow-up' : 'Start run') : 'Send message';

  return (
    <div
      className="shrink-0"
      style={{
        padding: `0 var(--s5) var(--s4)`,
        minHeight: 'var(--composer-h)',
      }}
    >
      {threadRun && (
        <div style={{ marginBottom: 'var(--s1)', fontSize: 'var(--font-small)', color: 'var(--muted)' }}>
          Continuing Run: <strong style={{ color: 'var(--text)' }}>{threadRun.title}</strong>
        </div>
      )}
      {runStartedNotice && (
        <div style={{ marginBottom: 'var(--s1)', fontSize: 'var(--font-small)', color: 'var(--success)' }}>{runStartedNotice}</div>
      )}

      {agentMode && looksRepeating && text.trim().length > 0 && (
        <div
          className="flex items-center justify-between gap-2"
          style={{
            marginBottom: 'var(--s2)',
            fontSize: 'var(--font-small)',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: '#fbfbfb',
            padding: 'var(--s1) var(--s2)',
          }}
        >
          <span>Looks like a repeating request.</span>
          <button
            onClick={() => {
              setAutopilotArmed(true);
              ensureAgentAddressingInComposer();
            }}
            style={linkButtonStyle}
          >
            Use Autopilot
          </button>
        </div>
      )}

      <div
        className="relative"
        style={{
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: 'var(--s2) var(--s3)',
          background: 'var(--bg)',
          boxShadow: composerFocused
            ? '0 0 0 1px rgba(18,100,163,0.35), 0 2px 8px rgba(0,0,0,0.08)'
            : '0 1px 1px rgba(0,0,0,0.05)',
          borderColor: composerFocused ? 'rgba(18,100,163,0.55)' : 'var(--border)',
          transition: 'box-shadow 120ms ease, border-color 120ms ease',
        }}
      >
        <div className="flex items-end">
        {showPickerMenu && (
          <div
            style={{
              position: 'absolute',
              left: '36px',
              right: '36px',
              bottom: 'calc(100% + 8px)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
              zIndex: 25,
              overflow: 'hidden',
            }}
          >
            {pickerOptions.map((option, idx) => (
              <button
                key={option.id}
                onClick={() => applyPickerOption(option)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderBottom: idx === pickerOptions.length - 1 ? 'none' : '1px solid var(--border)',
                  background: idx === mentionIndex ? 'var(--surface)' : 'var(--bg)',
                  cursor: 'pointer',
                  padding: '8px 10px',
                }}
              >
                <div className="flex items-center gap-2">
                  {option.id === 'workspace-agent' ? (
                    <div
                      aria-hidden="true"
                      className="agent-star-avatar"
                      style={{ width: '24px', height: '24px', borderRadius: '6px' }}
                    >
                      <div className="agent-star-avatar__blue" />
                      <div className="agent-star-avatar__rainbow" />
                      <span className="agent-star-avatar__glyph" style={{ fontSize: '16px' }}>
                        ✦
                      </span>
                    </div>
                  ) : option.avatarUrl ? (
                    <img
                      src={option.avatarUrl}
                      alt={option.label}
                      width={24}
                      height={24}
                      style={{ width: '24px', height: '24px', borderRadius: '6px', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        color: 'var(--muted)',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                      }}
                    >
                      {option.icon || option.label.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{option.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{option.subtitle}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

          <button
            onClick={() => {
              if (isAgentModeActive) {
                setAgentModeManuallyEnabled(false);
                return;
              }
              ensureAgentAddressingInComposer();
            }}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              marginRight: 'var(--s2)',
              border: '1px solid var(--border)',
              background: agentMode ? 'var(--sidebar-active)' : 'var(--surface)',
              color: agentMode ? '#fff' : 'var(--text)',
              cursor: 'pointer',
            }}
            title="Toggle Agent Mode"
          >
            ✦
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onChange={(e) => {
              setSuppressPickerMenu(false);
              setText(e.target.value);
              setCaretPos(e.target.selectionStart ?? e.target.value.length);
            }}
            onClick={(e) => {
              setSuppressPickerMenu(false);
              setCaretPos(e.currentTarget.selectionStart ?? 0);
            }}
            onKeyUp={(e) => {
              setSuppressPickerMenu(false);
              setCaretPos(e.currentTarget.selectionStart ?? 0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none outline-none bg-transparent"
            style={{
              fontSize: 'var(--font-base)',
              lineHeight: 'var(--lh-base)',
              color: 'var(--text)',
              maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
              minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
              transition: 'height 110ms ease',
            }}
          />

          <button
            onClick={() => void handleSend()}
            disabled={!text.trim()}
            title={sendLabel}
            aria-label={sendLabel}
            className="shrink-0 flex items-center justify-center transition-colors"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-sm)',
              marginLeft: 'var(--s2)',
              background: text.trim() ? 'var(--success)' : 'transparent',
              color: text.trim() ? '#fff' : 'var(--muted)',
              opacity: text.trim() ? 1 : 0.4,
              border: 'none',
              cursor: text.trim() ? 'pointer' : 'default',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10 8L1.5 6.5V1.5Z" />
            </svg>
          </button>
        </div>

        {agentMode && (
          <div
            className="relative flex items-center justify-between flex-wrap gap-2"
            style={{ marginTop: 'var(--s2)', paddingTop: 'var(--s2)', borderTop: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {starterPrompts.map((starter) => (
                <button key={starter.label} onClick={() => setText(starter.prompt)} style={chipGhost}>
                  {starter.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  style={autopilotArmed ? chipOn : chipStyle}
                  onClick={() => setAutopilotArmed((prev) => !prev)}
                  aria-pressed={autopilotArmed}
                >
                  Autopilot
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <button
                  style={chipGhost}
                  onClick={() => {
                    ensureAgentAddressingInComposer();
                    setToolsOpen((prev) => !prev);
                  }}
                >
                  Tools
                </button>
                {toolsOpen && (
                  <div style={{ ...menuStyle, right: 0, bottom: 'calc(100% + 8px)', width: '290px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: 'var(--s1)' }}>Workspace tools</div>
                    {(['drive', 'calendar', 'codebase'] as const).map((tool) => (
                      <PopoverCheck
                        key={tool}
                        label={tool[0].toUpperCase() + tool.slice(1)}
                        checked={tools[tool]}
                        onChange={(value) => setTools((prev) => ({ ...prev, [tool]: value }))}
                      />
                    ))}
                    <div style={{ fontSize: '11px', color: 'var(--muted)', margin: 'var(--s2) 0 var(--s1)' }}>
                      Connected integrations
                    </div>
                    {(Object.keys(connectedApps) as Array<keyof typeof connectedApps>).map((app) => (
                      <PopoverCheck
                        key={app}
                        label={app[0].toUpperCase() + app.slice(1)}
                        checked={connectedApps[app]}
                        onChange={(value) => setConnectedApps((prev) => ({ ...prev, [app]: value }))}
                      />
                    ))}
                    <div style={{ marginTop: 'var(--s2)', marginBottom: 'var(--s1)', fontSize: '11px', color: 'var(--muted)' }}>
                      Output format
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(['brief', 'checklist', 'doc', 'pr'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => setOutputFormat(fmt)}
                          style={outputFormat === fmt ? chipOn : chipStyle}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 'var(--s1)' }}>
                      <PopoverCheck
                        label="Require approval for actions"
                        checked={requireApproval}
                        onChange={setRequireApproval}
                      />
                    </div>
                    <button
                      style={linkButtonStyle}
                      onClick={() => {
                        setAutopilotArmed(true);
                        setToolsOpen(false);
                      }}
                    >
                      Make this repeat...
                    </button>
                    <button
                      style={linkButtonStyle}
                      onClick={() => {
                        setActiveView('app_home');
                        setToolsOpen(false);
                      }}
                    >
                      Manage in App Home
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

const chipStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '999px',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: '11px',
  padding: '3px 8px',
  cursor: 'pointer',
};

const chipOn: CSSProperties = {
  ...chipStyle,
  background: 'var(--sidebar-active)',
  color: '#fff',
  borderColor: 'var(--sidebar-active)',
};

const chipGhost: CSSProperties = {
  ...chipStyle,
  background: 'transparent',
  color: 'var(--muted)',
};

const menuStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 20,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg)',
  padding: 'var(--s2)',
  boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
};

const linkButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--link)',
  fontSize: '12px',
  cursor: 'pointer',
  padding: 0,
  marginTop: 'var(--s1)',
};

function PopoverCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2" style={{ fontSize: '12px', color: 'var(--text)', marginBottom: 'var(--s1)' }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
