import { providerConfig } from '../config.js';
import { streamChat, type ChatMessage, type ToolCall } from '../services/llm.js';
import { TOOL_SCHEMAS, findTool } from './tools.js';

export type AgentEvent =
  | { type: 'status'; status: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: any; summary: string }
  | { type: 'tool_result'; id: string; name: string; content: string; isError: boolean; meta?: Record<string, unknown> }
  | { type: 'step'; step: number }
  | { type: 'done'; reason: string }
  | { type: 'error'; message: string };

export interface RunAgentOptions {
  root: string;
  /** Prior conversation turns, excluding the system prompt. */
  history: ChatMessage[];
  /** Extra instructions appended to the system prompt (rules, mode, etc). */
  extraInstructions?: string;
  signal: AbortSignal;
}

const SYSTEM_PROMPT = `You are a coding agent embedded in a web IDE called Cursor Fork. You work directly inside the user's open workspace folder.

You have tools to explore and change the workspace:
- list_files: enumerate files (use it first when you do not know the project layout)
- read_file: read a file (ALWAYS read before editing)
- search_code: find text or regex matches across the repo
- edit_file: replace an exact block of text in a file
- write_file: create a new file or overwrite one completely
- run_command: execute shell commands (builds, tests, git, package managers)

Working rules:
1. Investigate before editing: read the relevant files and confirm assumptions with real file contents.
2. Make the smallest correct change. Never rewrite a whole file with write_file when edit_file can express the change.
3. When you use edit_file, old_string must match the file byte-for-byte including indentation, and must be unique.
4. After code changes, verify them: run the project's typecheck, tests, or build when a script exists.
5. If a command fails, read the error, fix the cause, and retry. Do not give up after a single failure.
6. Never invent file contents you have not read. If something is missing, say so.
7. When the task is complete, stop calling tools and summarise what you changed, which files were touched, and how you verified it. Keep the summary short and concrete.
8. Answer in the same language the user writes in (Chinese users expect Chinese).`;

function summariseCall(name: string, args: any): string {
  switch (name) {
    case 'read_file':
      return `Read ${args?.path ?? '?'}`;
    case 'list_files':
      return `List ${args?.directory ? args.directory : 'workspace'}`;
    case 'search_code':
      return `Search "${args?.query ?? ''}"`;
    case 'edit_file':
      return `Edit ${args?.path ?? '?'}`;
    case 'write_file':
      return `Write ${args?.path ?? '?'}`;
    case 'run_command':
      return args?.purpose ? String(args.purpose) : `Run ${String(args?.command ?? '').slice(0, 60)}`;
    default:
      return name;
  }
}

interface PendingToolCall {
  id: string;
  name: string;
  argsJson: string;
}

/**
 * Drives one agent turn: streams assistant text, executes tool calls, feeds the
 * results back to the model, and repeats until the model stops requesting tools.
 */
export async function* runAgent(options: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const provider = providerConfig();
  const messages: ChatMessage[] = [
    { role: 'system', content: options.extraInstructions ? `${SYSTEM_PROMPT}\n\n${options.extraInstructions}` : SYSTEM_PROMPT },
    ...options.history,
  ];

  for (let step = 1; step <= provider.maxSteps; step += 1) {
    if (options.signal.aborted) {
      yield { type: 'done', reason: 'aborted' };
      return;
    }
    yield { type: 'step', step };

    let assistantText = '';
    const calls = new Map<number, PendingToolCall>();
    let finishReason: string | null = null;
    let streamError: string | null = null;

    try {
      for await (const delta of streamChat(messages, TOOL_SCHEMAS, options.signal)) {
        if (delta.content) {
          assistantText += delta.content;
          yield { type: 'text', text: delta.content };
        }
        if (delta.toolCallChunk) {
          const chunk = delta.toolCallChunk;
          const existing = calls.get(chunk.index) ?? { id: '', name: '', argsJson: '' };
          if (chunk.id) existing.id = chunk.id;
          if (chunk.name) existing.name += chunk.name;
          if (chunk.argsFragment) existing.argsJson += chunk.argsFragment;
          if (!existing.id) existing.id = `call_${step}_${chunk.index}`;
          calls.set(chunk.index, existing);
        }
        if (delta.finishReason) finishReason = delta.finishReason;
      }
    } catch (err) {
      if (options.signal.aborted) {
        yield { type: 'done', reason: 'aborted' };
        return;
      }
      streamError = (err as Error).message;
    }

    if (streamError) {
      yield { type: 'error', message: streamError };
      return;
    }

    const toolCalls: ToolCall[] = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, call]) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.argsJson || '{}' },
      }));

    messages.push({
      role: 'assistant',
      content: assistantText || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });

    if (!toolCalls.length) {
      yield { type: 'done', reason: finishReason ?? 'stop' };
      return;
    }

    for (const call of toolCalls) {
      if (options.signal.aborted) {
        yield { type: 'done', reason: 'aborted' };
        return;
      }
      let args: any = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      yield { type: 'tool_start', id: call.id, name: call.function.name, args, summary: summariseCall(call.function.name, args) };

      const tool = findTool(call.function.name);
      let result: { content: string; meta?: Record<string, unknown>; isError?: boolean };
      if (!tool) {
        result = { content: `Error: unknown tool "${call.function.name}".`, isError: true };
      } else {
        try {
          result = await tool.run(args, { root: options.root });
        } catch (err) {
          result = { content: `Tool crashed: ${(err as Error).message}`, isError: true };
        }
      }

      yield {
        type: 'tool_result',
        id: call.id,
        name: call.function.name,
        content: result.content,
        isError: Boolean(result.isError),
        meta: result.meta,
      };

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: result.content.slice(0, 30_000),
      });
    }

    if (step === provider.maxSteps) {
      yield { type: 'error', message: `Stopped after ${provider.maxSteps} steps without finishing.` };
      return;
    }
  }
}
