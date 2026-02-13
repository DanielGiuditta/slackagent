import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const RUN_SIMULATION_PROMPT = `
You are simulating a Slack agent run.

Goal:
- Convert the user's request into a realistic, safe run plan and final output that feels like an in-progress job.
- Keep updates concrete and scoped to the provided context.

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

interface AgentCommand {
  text: string;
  container: { type: 'channel' | 'dm'; id: string };
  outputFormat: 'brief' | 'checklist' | 'doc' | 'pr';
  requireApproval: boolean;
  contextMessages?: string[];
  scope: {
    channel?: boolean;
    thread?: boolean;
    messages?: string[];
    files?: string[];
    people?: string[];
  };
  tools: { drive: boolean; calendar: boolean; codebase: boolean };
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

function formatSummary(summary: string, outputFormat: string) {
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

function createFallbackPlan(command: AgentCommand) {
  const steps = [
    `Understand the ask: ${command.text.slice(0, 70)}`,
    'Collect relevant context from current channel and selected scope',
    'Draft output and verify key facts',
    `Deliver ${command.outputFormat} response with concise highlights`,
  ];
  return {
    title: command.text.length > 56 ? `${command.text.slice(0, 53)}...` : command.text,
    steps,
    summary: formatSummary(
      `Prepared a plan for "${command.text}" in #${command.container.id}.`,
      command.outputFormat
    ),
    needsApproval: command.requireApproval,
    approvalReason: command.requireApproval ? 'Approval required by settings.' : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const command: AgentCommand = await request.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Return fallback plan if no API key
      const plan = createFallbackPlan(command);
      return NextResponse.json({
        ok: true,
        run: {
          id: `run-${Date.now()}`,
          title: plan.title,
          status: 'completed',
          progressPct: 100,
          container: command.container,
          createdBy: 'you',
          createdAt: Date.now(),
          latestUpdate: 'Completed',
          artifacts: [],
          plan,
        },
      });
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: RUN_SIMULATION_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            USER_REQUEST: command.text,
            OUTPUT_FORMAT: command.outputFormat,
            CONTAINER_ID: command.container.id,
            CONTEXT_JSON: { channelName: command.container.id },
            RISKY_VERBS: ['send', 'delete', 'deploy', 'create calendar event', 'push', 'merge'],
          }),
        },
      ],
      temperature: 0.4,
    });

    const output = response.choices[0]?.message?.content?.trim() || '';
    const parsed = parseJSON(output);

    const plan = parsed || createFallbackPlan(command);
    const formattedSummary = formatSummary(plan.summary || '', command.outputFormat);

    return NextResponse.json({
      ok: true,
      run: {
        id: `run-${Date.now()}`,
        title: plan.title,
        status: 'completed',
        progressPct: 100,
        container: command.container,
        createdBy: 'you',
        createdAt: Date.now(),
        latestUpdate: 'Completed',
        artifacts: [
          { id: 'a-doc', type: 'doc', title: 'Draft output' },
          { id: 'a-link', type: 'link', title: 'Source notes' },
        ],
        plan: {
          ...plan,
          summary: formattedSummary,
        },
      },
    });
  } catch (error) {
    console.error('Agent command error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
