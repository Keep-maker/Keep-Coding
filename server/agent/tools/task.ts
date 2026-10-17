import { asString, asNumber, type ToolDefinition, type ToolContext } from './types.js';

/**
 * Runs an isolated sub-agent turn and returns only its final report.
 *
 * Cursor's Task tool exists to protect the parent context window: the sub-agent
 * gets its own message history, does its own tool-calling, and hands back a
 * summary. The implementation is injected by the loop to avoid a circular import.
 */
export type SubagentRunner = (
  prompt: string,
  options: { description: string; maxSteps?: number },
  parent: ToolContext,
) => Promise<{ report: string; steps: number; toolCalls: number }>;

let runner: SubagentRunner | null = null;

export function registerSubagentRunner(fn: SubagentRunner): void {
  runner = fn;
}

export const taskTool: ToolDefinition = {
  schema: {
    name: 'task',
    description:
      'Delegate a self-contained piece of work to a sub-agent with its own context window. Use it to keep long research or exploration out of this conversation. The sub-agent cannot see this conversation, so the prompt must be complete and specific. It returns only its final report.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Short 3-5 word description of the task.' },
        prompt: { type: 'string', description: 'Complete, self-contained instructions for the sub-agent.' },
        max_steps: { type: 'integer', description: 'Upper bound on the sub-agent tool rounds, default 12.' },
      },
      required: ['description', 'prompt'],
    },
  },
  async run(input, ctx) {
    if (!runner) {
      return { content: 'Error: sub-agents are not available in this environment.', isError: true };
    }
    const description = asString(input.description) || 'subtask';
    const prompt = asString(input.prompt);
    if (!prompt.trim()) return { content: 'Error: prompt must not be empty.', isError: true };

    ctx.onOutput?.(`Sub-agent: ${description}`);
    try {
      const result = await runner(prompt, { description, maxSteps: asNumber(input.max_steps, 12) }, ctx);
      return {
        content: `Sub-agent "${description}" finished after ${result.steps} step(s) and ${result.toolCalls} tool call(s).\n\nIts report:\n${result.report}`,
        meta: { description, steps: result.steps, toolCalls: result.toolCalls, isSubagent: true, report: result.report },
      };
    } catch (err) {
      return { content: `Sub-agent failed: ${(err as Error).message}`, isError: true, meta: { description } };
    }
  },
};
