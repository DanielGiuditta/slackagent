import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

interface AgentCommand {
  text: string;
  container: { type: 'channel' | 'dm'; id: string };
  outputFormat: 'brief' | 'checklist' | 'doc' | 'pr';
  requireApproval: boolean;
  scope: {
    channel?: boolean;
    thread?: boolean;
    messages?: string[];
    files?: string[];
    people?: string[];
  };
  tools: { drive: boolean; calendar: boolean; codebase: boolean };
}

interface Cadence {
  kind: 'daily' | 'weekday' | 'weekly' | 'hourly' | 'custom';
  hour?: number;
  minute?: number;
  dow?: number[];
  tz: string;
  everyMinutes?: number;
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

function createFallbackAutopilot(command: AgentCommand) {
  const tz = 'America/New_York';
  return {
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
  };
}

function parseJSON(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    const firstBrace = input.indexOf('{');
    const lastBrace = input.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(input.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeCadence(value: unknown, fallbackTz: string): Cadence {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const kindRaw = String(input.kind || 'daily').toLowerCase();
  const hour = typeof input.hour === 'number' ? Math.max(0, Math.min(23, Math.trunc(input.hour))) : 9;
  const minute = typeof input.minute === 'number' ? Math.max(0, Math.min(59, Math.trunc(input.minute))) : 0;
  const tz = typeof input.tz === 'string' && input.tz.trim() ? input.tz : fallbackTz;

  if (kindRaw === 'weekday' || kindRaw === 'weekdays') {
    return { kind: 'weekday', hour, minute, dow: [1, 2, 3, 4, 5], tz };
  }
  if (kindRaw === 'weekly') {
    return { kind: 'weekly', hour, minute, dow: [1], tz };
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

export async function POST(request: NextRequest) {
  try {
    const command: AgentCommand = await request.json();
    const tz = 'America/New_York';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: true, autopilot: createFallbackAutopilot(command) });
    }

    const client = new OpenAI({ apiKey });
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
    const parsed = parseJSON(output);

    if (!parsed || !parsed.title || !parsed.instruction) {
      return NextResponse.json({ ok: true, autopilot: createFallbackAutopilot(command) });
    }

    const destinationType = parsed.destinationSuggestion?.type === 'dm' ? 'dm' : 'channel';
    const destinationId = parsed.destinationSuggestion?.id || command.container.id;

    return NextResponse.json({
      ok: true,
      autopilot: {
        id: '',
        title: parsed.title,
        instruction: parsed.instruction,
        cadence: normalizeCadence(parsed.cadence, tz),
        destination: { type: destinationType, id: destinationId },
        scope: command.scope,
        tools: command.tools,
        outputFormat: command.outputFormat,
        delivery: { mode: parsed.deliveryMode === 'verbose' ? 'verbose' : 'digest' },
        enabled: true,
        history: [],
      },
    });
  } catch (error) {
    console.error('Autopilot preview error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
