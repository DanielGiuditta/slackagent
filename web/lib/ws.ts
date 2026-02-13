import { useStore } from './store';
import type { WSIncoming, WSOutgoing } from './types';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function resolveWsUrl() {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.hostname}:4000`;
  }
  return 'ws://localhost:4000';
}

export function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(resolveWsUrl());

  ws.onopen = () => {
    console.log('[ws] connected');
  };

  ws.onmessage = (event) => {
    const data: WSIncoming = JSON.parse(event.data);
    const store = useStore.getState();

    switch (data.type) {
      case 'init':
        // Preserve rich local seed data when backend sends sparse bootstrap payloads.
        // Only replace local state when incoming datasets are at least as complete.
        if ((data.channels?.length || 0) >= store.channels.length) {
          store.setChannels(data.channels);
        }
        if ((data.messages?.length || 0) >= store.messages.length) {
          store.setMessages(data.messages);
        }
        if ((data.runs?.length || 0) > 0) {
          data.runs.forEach((run) => store.upsertRun(run));
        }
        if ((data.autopilots?.length || 0) > 0) {
          data.autopilots.forEach((autopilot) => store.upsertAutopilot(autopilot));
        }
        break;

      case 'new_message':
        store.addMessage(data.message);
        break;

      case 'typing':
        store.setTyping({
          userId: data.userId,
          channelId: data.channelId,
          parentId: data.parentId,
        });
        // Auto-clear after 3s
        setTimeout(() => {
          const current = useStore.getState().typing;
          if (current && current.userId === data.userId) {
            useStore.getState().setTyping(null);
          }
        }, 3000);
        break;

      case 'run_upsert':
        store.upsertRun(data.run);
        break;

      case 'autopilot_upsert':
        store.upsertAutopilot(data.autopilot);
        break;

      case 'autopilot_created':
        store.upsertAutopilot(data.autopilot);
        break;

      case 'runs_index':
        store.setRunsIndex(data.runs);
        break;
    }
  };

  ws.onclose = () => {
    console.log('[ws] disconnected — reconnecting in 2s');
    ws = null;
    reconnectTimer = setTimeout(connectWS, 2000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectWS() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
}

function send(payload: WSOutgoing) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function sendMessage(channelId: string, text: string, parentId?: string) {
  send({
    type: 'send_message',
    channelId,
    userId: 'you',
    text,
    parentId,
  });
}
