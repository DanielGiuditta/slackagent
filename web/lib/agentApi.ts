'use client';

import { apiFetch } from './api';
import type { AgentCommand, Run } from './types';

interface RunResponse {
  ok: boolean;
  run: Run;
}

export function submitAgentCommand(command: AgentCommand) {
  return apiFetch<RunResponse>('/agent/command', {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export function sendRunControl(runId: string, action: 'pause' | 'stop' | 'resume') {
  return apiFetch<RunResponse>(`/agent/run/${runId}/control`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function sendRunApproval(runId: string, decision: 'approve' | 'deny') {
  return apiFetch<RunResponse>(`/agent/run/${runId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}
