import OpenAI from 'openai';
import { z } from 'zod';
import type { AgentCommand, Autopilot, Cadence, RunPlan } from './types.js';

const runPlanSchema = z.object({
  title: z.string().min(3),
  steps: z.array(z.string().min(3)).min(2).max(7),
  summary: z.string().min(3),
  needsApproval: z.boolean(),
  approvalReason: z.string().optional(),
});

const autopilotSchema = z.object({
  title: z.string().min(3),
  instruction: z.string().min(3),
  cadence: z.object({
    kind: z.enum(['daily', 'weekday', 'weekly', 'hourly', 'custom']),
    hour: z.number().int().min(0).max(23).optional(),
    minute: z.number().int().min(0).max(59).optional(),
    dow: z.array(z.number().int().min(0).max(6)).optional(),
    tz: z.string().min(2),
    everyMinutes: z.number().int().min(1).optional(),
  }),
  destinationSuggestion: z.object({
    type: z.enum(['channel', 'dm']),
    id: z.string().min(1),
  }),
  deliveryMode: z.enum(['digest', 'verbose']),
});

const riskyVerbPattern = /\b(send|delete|deploy|create calendar event|push|merge)\b/i;

export const RUN_SIMULATION_PROMPT_TEMPLATE = `
You are simulating a Slack agent run.

Goal:
- Convert the user's request into a realistic, safe run plan and final output that feels like an in-progress job.
- Keep updates concrete and scoped to the provided context.

Inputs:
- user_request: {{USER_REQUEST}}
- output_format: {{OUTPUT_FORMAT}} (brief | checklist | doc | pr)
- container: {{CONTAINER_ID}}
- context: {{CONTEXT_JSON}}
- risky_verbs: {{RISKY_VERBS}}

Rules:
1) Return strict JSON only with keys: title, steps, summary, needsApproval, approvalReason.
2) "steps" must be 2-7 items and describe progressive execution.
3) "summary" must be the simulated final output content in the requested output_format style, using markdown.
   - If the user asks for action items/todos/tasks/next steps, prefer markdown task lists: "- [ ] item".
   - Do not include a top-level title that repeats the run title.
   - Keep exactly one main heading max; use bullets/checklists for the rest.
   - For to-do requests, start directly with checklist content (no extra heading).
   - Prefer scannable markdown blocks (headings, bullets, checklists, links) over a dense paragraph.
4) Set needsApproval=true if any step implies risky external action.
5) Keep language concise, specific, and realistic for Slack updates.

Output JSON schema:
{
  "title": "string",
  "steps": ["string"],
  "summary": "string",
  "needsApproval": true,
  "approvalReason": "string (optional)"
}
`.trim();

function parseJSON<T>(input: string, schema: z.ZodSchema<T>): T | null {
  const tryParse = (candidate: string) => {
    try {
      const parsed = JSON.parse(candidate);
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(input);
  if (direct) return direct;

  // Common model behavior is wrapping JSON in prose/fences.
  const firstBrace = input.indexOf('{');
  const lastBrace = input.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = input.slice(firstBrace, lastBrace + 1);
    return tryParse(sliced);
  }

  return null;
}

function normalizeCadence(value: unknown, fallbackTz = 'UTC'): Cadence {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const kindRaw = String(input.kind || 'daily').toLowerCase();
  const dowRaw = Array.isArray(input.dow) ? input.dow : [];
  const mapDow = (entry: unknown) => {
    if (typeof entry === 'number') return Math.max(0, Math.min(6, Math.trunc(entry)));
    const s = String(entry).toLowerCase().slice(0, 3);
    const lookup: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    return lookup[s];
  };
  const normalizedDow = dowRaw
    .map(mapDow)
    .filter((n): n is number => typeof n === 'number');

  const hour = typeof input.hour === 'number' ? Math.max(0, Math.min(23, Math.trunc(input.hour))) : 9;
  const minute = typeof input.minute === 'number' ? Math.max(0, Math.min(59, Math.trunc(input.minute))) : 0;
  const tz = typeof input.tz === 'string' && input.tz.trim() ? input.tz : fallbackTz;

  if (kindRaw === 'weekday' || kindRaw === 'weekdays' || (kindRaw === 'dow' && normalizedDow.length === 5)) {
    return { kind: 'weekday', hour, minute, dow: normalizedDow.length ? normalizedDow : [1, 2, 3, 4, 5], tz };
  }
  if (kindRaw === 'weekly') {
    return { kind: 'weekly', hour, minute, dow: normalizedDow.length ? normalizedDow : [1], tz };
  }
  if (kindRaw === 'hourly') {
    return { kind: 'hourly', minute, tz };
  }
  if (kindRaw === 'custom') {
    const everyMinutes = typeof input.everyMinutes === 'number' ? Math.max(1, Math.trunc(input.everyMinutes)) : 60;
    return { kind: 'custom', everyMinutes, tz };
  }
  return { kind: 'daily', hour, minute, tz };
}

function normalizeDeliveryMode(value: unknown): 'digest' | 'verbose' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'verbose' || normalized === 'immediate' || normalized === 'post') return 'verbose';
  return 'digest';
}

function parseAutopilotRelaxed(
  output: string,
  fallbackContainer: AgentCommand['container'],
  tz: string
): Autopilot | null {
  try {
    const raw = JSON.parse(output);
    const title = typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : null;
    const instruction =
      typeof raw?.instruction === 'string' && raw.instruction.trim() ? raw.instruction.trim() : null;
    if (!title || !instruction) return null;

    const destinationRaw =
      raw?.destinationSuggestion && typeof raw.destinationSuggestion === 'object'
        ? raw.destinationSuggestion
        : fallbackContainer;

    const destinationType = destinationRaw?.type === 'dm' ? 'dm' : 'channel';
    const destinationId =
      typeof destinationRaw?.id === 'string' && destinationRaw.id.trim()
        ? destinationRaw.id
        : fallbackContainer.id;

    return {
      id: '',
      title,
      instruction,
      cadence: normalizeCadence(raw?.cadence, tz),
      destination: { type: destinationType, id: destinationId },
      scope: {
        channel: true,
        thread: false,
        messages: [],
        files: [],
        people: [],
      },
      tools: { drive: false, calendar: false, codebase: false },
      outputFormat: 'brief',
      delivery: { mode: normalizeDeliveryMode(raw?.deliveryMode) },
      enabled: true,
      history: [],
    };
  } catch {
    return null;
  }
}

function makeClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function defaultCadenceFromText(text: string, tz: string): Cadence {
  const lower = text.toLowerCase();
  if (lower.includes('every hour') || lower.includes('hourly')) {
    return { kind: 'hourly', minute: 0, tz };
  }
  if (lower.includes('weekday')) {
    return { kind: 'weekday', hour: 9, minute: 0, dow: [1, 2, 3, 4, 5], tz };
  }
  if (lower.includes('weekly')) {
    return { kind: 'weekly', hour: 9, minute: 0, dow: [1], tz };
  }
  if (lower.includes('every') && lower.includes('minute')) {
    return { kind: 'custom', everyMinutes: 5, tz };
  }
  return { kind: 'daily', hour: 9, minute: 0, tz };
}

export function shouldGateForApproval(text: string, steps: string[], requireApproval: boolean) {
  if (requireApproval) return true;
  if (riskyVerbPattern.test(text)) return true;
  return steps.some((step) => riskyVerbPattern.test(step));
}

function formatSummary(summary: string, outputFormat: AgentCommand['outputFormat']) {
  if (outputFormat === 'checklist') {
    return summary
      .split('.')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `- [ ] ${line}`)
      .join('\n');
  }
  if (outputFormat === 'doc') {
    return `## Overview\n\n${summary}\n\n## Next Steps\n\n- [ ] Validate assumptions\n- [ ] Share with team`;
  }
  if (outputFormat === 'pr') {
    return `## Summary\n${summary}\n\n## Proposed Changes\n- [ ] Update implementation\n- [ ] Add tests\n\n## Risks\n- [ ] Verify rollout`;
  }
  return summary;
}

export async function proposeRunPlan(
  command: AgentCommand,
  context: { channelName?: string; threadText?: string }
): Promise<RunPlan> {
  const fallback = (): RunPlan => {
    const steps = [
      `Understand the ask: ${command.text.slice(0, 70)}`,
      'Collect relevant context from current channel and selected scope',
      'Draft output and verify key facts',
      `Deliver ${command.outputFormat} response with concise highlights`,
    ];
    const needsApproval = shouldGateForApproval(command.text, steps, command.requireApproval);
    return {
      title: command.text.length > 56 ? `${command.text.slice(0, 53)}...` : command.text,
      steps,
      artifacts: [
        { id: 'a1', type: 'doc', title: 'Working draft' },
        { id: 'a2', type: 'link', title: 'References' },
        { id: 'a3', type: 'canvas', title: 'Open Canvas' },
      ],
      needsApproval,
      approvalReason: needsApproval
        ? 'Potentially risky action detected or approval required by settings.'
        : undefined,
      summary: formatSummary(
        `Prepared a plan for "${command.text}" in ${
          context.channelName ? `#${context.channelName}` : 'this workspace'
        }.`,
        command.outputFormat
      ),
      nextQuestions: ['Should I prioritize speed or completeness?', 'Any constraints I should follow?'],
    };
  };

  const client = makeClient();
  if (!client) return fallback();

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: RUN_SIMULATION_PROMPT_TEMPLATE,
        },
        {
          role: 'user',
          content: JSON.stringify({
            USER_REQUEST: command.text,
            OUTPUT_FORMAT: command.outputFormat,
            CONTAINER_ID: context.channelName || command.container.id,
            CONTEXT_JSON: context,
            RISKY_VERBS: ['send', 'delete', 'deploy', 'create calendar event', 'push', 'merge'],
          }),
        },
      ],
      temperature: 0.4,
    });

    const output = response.output_text?.trim() || '';
    const parsed = parseJSON(output, runPlanSchema);
    if (!parsed) return fallback();
    return {
      ...parsed,
      artifacts: [
        { id: 'a-doc', type: 'doc', title: 'Draft output' },
        { id: 'a-link', type: 'link', title: 'Source notes' },
        { id: 'a-canvas', type: 'canvas', title: 'Open Canvas' },
      ],
      summary: formatSummary(parsed.summary, command.outputFormat),
      needsApproval:
        parsed.needsApproval || shouldGateForApproval(command.text, parsed.steps, command.requireApproval),
      approvalReason:
        parsed.approvalReason ||
        (shouldGateForApproval(command.text, parsed.steps, command.requireApproval)
          ? 'Potentially risky action detected.'
          : undefined),
      nextQuestions: ['Should this be shared broadly or kept in-thread?'],
    };
  } catch {
    return fallback();
  }
}

export async function proposeAutopilot(command: AgentCommand): Promise<Autopilot> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const fallback = (): Autopilot => ({
    id: '',
    title: `Autopilot: ${command.text.slice(0, 32)}`,
    instruction: command.text,
    cadence: defaultCadenceFromText(command.text, tz),
    destination: command.container,
    scope: command.scope,
    tools: command.tools,
    outputFormat: command.outputFormat,
    delivery: { mode: command.outputFormat === 'brief' ? 'digest' : 'verbose' },
    enabled: true,
    history: [],
  });

  const client = makeClient();
  if (!client) return fallback();

  try {
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content:
            'Parse this Slack autopilot command. Return strict JSON only with: title, instruction, cadence(kind/hour/minute/dow/tz/everyMinutes), destinationSuggestion(type,id), deliveryMode.',
        },
        { role: 'user', content: JSON.stringify({ text: command.text, container: command.container, tz }) },
      ],
      temperature: 0.2,
    });

    const output = response.output_text?.trim() || '';
    const parsed = parseJSON(output, autopilotSchema);
    if (!parsed) {
      const relaxed = parseAutopilotRelaxed(output, command.container, tz);
      if (!relaxed) return fallback();
      return {
        ...relaxed,
        scope: command.scope,
        tools: command.tools,
        outputFormat: command.outputFormat,
      };
    }

    return {
      id: '',
      title: parsed.title,
      instruction: parsed.instruction,
      cadence: parsed.cadence,
      destination: parsed.destinationSuggestion,
      scope: command.scope,
      tools: command.tools,
      outputFormat: command.outputFormat,
      delivery: { mode: parsed.deliveryMode },
      enabled: true,
      history: [],
    };
  } catch {
    return fallback();
  }
}
