import os from 'node:os';
import { providerConfig } from '../config.js';
import { streamChat, type ChatMessage, type ToolCall } from '../services/llm.js';
import { checkpoints } from './checkpoints.js';
import { discoverHooks, runStage, type HookDefinition } from './hooks.js';
import { discoverRules, ruleCatalog, rulesForPath } from './rules.js';
import { discoverSkills, findSkill, skillCatalog, type Skill } from './skills.js';
import { ALL_TOOLS, findTool, isMutating, type ToolContext } from './tools/index.js';
import { registerSubagentRunner } from './tools/task.js';
import type { AskAnswer, AskQuestion, ToolResult } from './tools/types.js';

export type AgentEvent =
  | { type: 'status'; status: string }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: any; summary: string }
  | { type: 'tool_result'; id: string; name: string; content: string; isError: boolean; meta?: Record<string, unknown> }
  | { type: 'step'; step: number }
  | { type: 'question'; id: string; question: AskQuestion }
  | { type: 'subagent'; state: 'start' | 'end'; description: string; steps?: number }
  | { type: 'done'; reason: string }
  | { type: 'error'; message: string };

export interface RunAgentOptions {
  root: string;
  sessionId: string;
  history: ChatMessage[];
  extraInstructions?: string;
  mode?: string;
  /** Skills the user explicitly forced with a /command. */
  forcedSkills?: string[];
  signal: AbortSignal;
  /** Resolves when the UI answers an ask_question tool call. */
  onQuestion?: (id: string, question: AskQuestion) => Promise<AskAnswer | null>;
}

interface PendingToolCall {
  id: string;
  name: string;
  argsJson: string;
}

const BASE_PROMPT = `You are a coding agent embedded in a web IDE called Cursor Fork. You work directly inside the user's open workspace folder.

Working rules:
1. Investigate before editing: read the relevant files and confirm assumptions with real file contents.
2. For anything multi-step, call todo_write first and keep exactly one item in_progress, updating it as you go.
3. Make the smallest correct change. Prefer edit_file for one change and multi_edit for several changes across files instead of rewriting whole files.
4. When you use edit_file or multi_edit, old_string must match the file byte-for-byte including indentation and must be unique.
5. After code changes, verify them: run the project's typecheck, tests, or build when a script exists. Read failures and fix them rather than giving up.
6. Delegate long, self-contained research or exploration to the task tool so it does not consume this conversation's context.
7. Ask the user with ask_question when requirements are genuinely ambiguous and guessing would waste work.
8. Never invent file contents you have not read. If something is missing, say so.
9. When the task is complete, stop calling tools and summarise what changed, which files were touched, and how you verified it. Keep it short and concrete.
10. Answer in the same language the user writes in (Chinese users expect Chinese).`;

function summariseCall(name: string, args: any): string {
  switch (name) {
    case 'read_file':
      return `Read ${args?.path ?? '?'}`;
    case 'list_files':
      return `List ${args?.directory ? args.directory : 'workspace'}`;
    case 'directory_tree':
      return `Tree ${args?.directory || '.'}`;
    case 'glob_file_search':
      return `Glob ${args?.pattern ?? ''}`;
    case 'grep_search':
      return `Grep /${args?.pattern ?? ''}/`;
    case 'file_info':
      return `Stat ${args?.path ?? '?'}`;
    case 'read_image':
      return `Read image ${args?.path ?? '?'}`;
    case 'edit_file':
      return `Edit ${args?.path ?? '?'}`;
    case 'multi_edit':
      return `Multi-edit ${Array.isArray(args?.edits) ? `${args.edits.length} change(s)` : ''}`;
    case 'write_file':
      return `${args?.path ? 'Write' : 'Write'} ${args?.path ?? '?'}`;
    case 'delete_file':
      return `Delete ${args?.path ?? '?'}`;
    case 'move_file':
      return `Move ${args?.from ?? '?'} -> ${args?.to ?? '?'}`;
    case 'run_command':
      return args?.purpose ? String(args.purpose) : `Run ${String(args?.command ?? '').slice(0, 60)}`;
    case 'todo_write':
      return 'Update task list';
    case 'ask_question':
      return `Ask: ${String(args?.question ?? '').slice(0, 60)}`;
    case 'task':
      return `Sub-agent: ${args?.description ?? 'task'}`;
    default:
      return name;
  }
}

/** Builds the system prompt from base rules, project rules, and available skills. */
function buildSystemPrompt(
  root: string,
  skills: Skill[],
  rules: Awaited<ReturnType<typeof discoverRules>>,
  extra?: string,
): string {
  const sections = [BASE_PROMPT, `\nWorkspace root: ${root}`];

  if (rules.length) {
    // Always-on rules go into the prompt immediately; globbed rules are noted so
    // the model knows they exist and will be applied when it touches those files.
    const always = rules.filter((rule) => !rule.globs.length);
    const scoped = rules.filter((rule) => rule.globs.length);
    if (always.length) {
      sections.push(`\n# Project rules\n${always.map((rule) => `## ${rule.name}\n${rule.body.trim()}`).join('\n\n')}`);
    }
    if (scoped.length) {
      sections.push(`\n# Additional scoped rules\nThese apply depending on which files you touch:\n${ruleCatalog(scoped)}`);
    }
  }

  const catalogue = skillCatalog(skills);
  if (catalogue) {
    sections.push(
      `\n# Available skills\nSkills package domain knowledge and workflows. When a task matches one, read its SKILL.md before acting (they live in .cursor/skills/<name>/).\n${catalogue}`,
    );
  }

  if (extra) sections.push(`\n${extra}`);
  return sections.join('\n');
}

export interface SubagentRunnerOptions {
  root: string;
  sessionId: string;
  signal: AbortSignal;
  skills: Skill[];
  rules: Awaited<ReturnType<typeof discoverRules>>;
  hooks: HookDefinition[];
  onEvent?: (event: AgentEvent) => void;
  snapshot: (path: string) => void;
}

/**
 * Council-shaped driver for one agent turn: streams assistant text, runs tool
 * calls (with hooks, checkpoints and sub-agents), and repeats until the model
 * stops asking for tools.
 */
export async function* runAgent(options: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const provider = providerConfig();
  const skills = discoverSkills(options.root, os.homedir());
  const rules = discoverRules(options.root, os.homedir());
  const hooks = discoverHooks(options.root);

  const forced = (options.forcedSkills ?? [])
    .map((name) => findSkill(skills, name))
    .filter((skill): skill is Skill => Boolean(skill));
  const forcedBlock = forced.length
    ? `\n# Activated skills\n${forced.map((skill) => `## ${skill.name}\n${skill.body.trim()}`).join('\n\n')}`
    : '';

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(options.root, skills, rules, `${options.extraInstructions ?? ''}${forcedBlock}`) },
    ...options.history,
  ];

  // session_start hooks can inject context.
  const startOutcome = await runStage(hooks, 'session_start', { sessionId: options.sessionId, root: options.root });
  if (startOutcome.additionalContext) {
    messages.push({ role: 'system', content: startOutcome.additionalContext });
  }

  const askQuestion = options.onQuestion;

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
      for await (const delta of streamChat(messages, ALL_TOOLS.map((tool) => tool.schema), options.signal)) {
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
      const submitOutcome = await runStage(hooks, 'before_submit', { sessionId: options.sessionId, root: options.root });
      if (submitOutcome.block) {
        messages.push({ role: 'user', content: submitOutcome.block });
        continue;
      }
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

      // Before-tool hooks may rewrite arguments or block the call outright.
      const pre = await runStage(hooks, 'before_tool', {
        sessionId: options.sessionId,
        root: options.root,
        tool: { name: call.function.name, args },
      });
      if (pre.modifiedArgs) args = { ...args, ...pre.modifiedArgs };

      let result: ToolResult;
      if (pre.block) {
        result = { content: `Blocked by a project hook: ${pre.block}`, isError: true, meta: { blocked: true } };
      } else if (call.function.name === 'task') {
        yield { type: 'subagent', state: 'start', description: String(args?.description ?? 'subtask') };
        result = await runSubagentTool(args, options, skills, rules, hooks);
        yield { type: 'subagent', state: 'end', description: String(args?.description ?? 'subtask') };
      } else {
        result = await executeTool(call.function.name, args, {
          root: options.root,
          sessionId: options.sessionId,
          snapshot: (path) => checkpoints.recordOriginal(options.root, options.sessionId, path),
          ask: askQuestion
            ? (question, callId) => askQuestion(callId ?? '', question)
            : undefined,
          toolCallId: call.id,
        });
      }

      // Editing tools additionally fire after_edit so formatters/linters can run.
      if (isMutating(call.function.name) && !result.isError) {
        const editOutcome = await runStage(hooks, 'after_edit', {
          sessionId: options.sessionId,
          root: options.root,
          tool: { name: call.function.name, args },
          result: { content: result.content, isError: false },
        });
        if (editOutcome.additionalContext) {
          result = { ...result, content: `${result.content}\n\n${editOutcome.additionalContext}` };
        }
        if (editOutcome.block) {
          result = { ...result, isError: true, content: `${result.content}\n\nBlocked by an after_edit hook: ${editOutcome.block}` };
        }
      }

      const post = await runStage(hooks, 'after_tool', {
        sessionId: options.sessionId,
        root: options.root,
        tool: { name: call.function.name, args },
        result: { content: result.content, isError: Boolean(result.isError) },
      });
      if (post.additionalContext) result = { ...result, content: `${result.content}\n\n${post.additionalContext}` };
      if (post.block) result = { ...result, isError: true, content: `${result.content}\n\nBlocked by a project hook: ${post.block}` };

      yield {
        type: 'tool_result',
        id: call.id,
        name: call.function.name,
        content: result.content,
        isError: Boolean(result.isError),
        meta: result.meta,
      };

      // Images are sent back as multimodal content so vision models can see them.
      const isImage = result.meta?.isImage && typeof result.meta.dataUrl === 'string';
      if (isImage) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: [
            { type: 'text', text: result.content } as never,
            { type: 'image_url', image_url: { url: result.meta!.dataUrl } } as never,
          ] as never,
        });
      } else {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: result.content.slice(0, 30_000),
        });
      }
    }

    if (step === provider.maxSteps) {
      yield { type: 'error', message: `Stopped after ${provider.maxSteps} steps without finishing.` };
      return;
    }
  }
}

async function executeTool(name: string, args: any, ctx: ToolContext): Promise<ToolResult> {
  const tool = findTool(name);
  if (!tool) return { content: `Error: unknown tool "${name}".`, isError: true };
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    return { content: `Tool crashed: ${(err as Error).message}`, isError: true };
  }
}

/**
 * Runs a sub-agent: a nested agent loop with its own history. Only the final
 * text is returned to the parent, which is the whole point of the tool.
 */
async function runSubagentTool(
  args: any,
  parent: RunAgentOptions,
  skills: Skill[],
  rules: Awaited<ReturnType<typeof discoverRules>>,
  hooks: HookDefinition[],
): Promise<ToolResult> {
  const description = String(args?.description ?? 'subtask');
  const prompt = String(args?.prompt ?? '');
  if (!prompt.trim()) return { content: 'Error: prompt must not be empty.', isError: true };

  const provider = providerConfig();
  const maxSteps = Number.isFinite(args?.max_steps) ? Number(args.max_steps) : 12;
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${buildSystemPrompt(parent.root, skills, rules, undefined)}

You are a sub-agent handling one self-contained task delegated by a parent agent. Investigate, do the work, then report back concisely. You cannot ask the user questions.`,
    },
    { role: 'user', content: prompt },
  ];

  let steps = 0;
  let toolCalls = 0;

  for (let step = 1; step <= maxSteps; step += 1) {
    if (parent.signal.aborted) break;
    steps = step;

    let assistantText = '';
    const calls = new Map<number, PendingToolCall>();
    let failed = false;

    try {
      for await (const delta of streamChat(messages, ALL_TOOLS.filter((t) => t.schema.name !== 'task').map((t) => t.schema), parent.signal)) {
        if (delta.content) assistantText += delta.content;
        if (delta.toolCallChunk) {
          const chunk = delta.toolCallChunk;
          const existing = calls.get(chunk.index) ?? { id: '', name: '', argsJson: '' };
          if (chunk.id) existing.id = chunk.id;
          if (chunk.name) existing.name += chunk.name;
          if (chunk.argsFragment) existing.argsJson += chunk.argsFragment;
          if (!existing.id) existing.id = `sub_${step}_${chunk.index}`;
          calls.set(chunk.index, existing);
        }
      }
    } catch {
      failed = true;
    }
    if (failed && !assistantText) return { content: 'Sub-agent failed to produce a response.', isError: true, meta: { description } };

    const toolCallsForStep: ToolCall[] = [...calls.entries()].map(([, call]) => ({
      id: call.id,
      type: 'function' as const,
      function: { name: call.name, arguments: call.argsJson || '{}' },
    }));

    messages.push({
      role: 'assistant',
      content: assistantText || null,
      ...(toolCallsForStep.length ? { tool_calls: toolCallsForStep } : {}),
    });

    if (!toolCallsForStep.length) {
      return {
        content: assistantText || '(sub-agent returned nothing)',
        meta: { description, steps, toolCalls, isSubagentReport: true, report: assistantText },
      };
    }

    for (const call of toolCallsForStep) {
      toolCalls += 1;
      let toolArgs: any = {};
      try {
        toolArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        toolArgs = {};
      }
      const result = await executeTool(call.function.name, toolArgs, {
        root: parent.root,
        sessionId: parent.sessionId,
        snapshot: (path) => checkpoints.recordOriginal(parent.root, parent.sessionId, path),
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: result.content.slice(0, 20_000),
      });
    }
  }

  return {
    content: `Sub-agent "${description}" hit its ${maxSteps}-step limit without finishing.`,
    isError: true,
    meta: { description, steps, toolCalls, isSubagentReport: true },
  };
}

registerSubagentRunner(async (prompt, options, parent) => {
  const result = await runSubagentTool(
    { prompt, description: options.description, max_steps: options.maxSteps },
    {
      root: parent.root,
      sessionId: parent.sessionId,
      history: [],
      signal: new AbortController().signal,
    },
    discoverSkills(parent.root, os.homedir()),
    discoverRules(parent.root, os.homedir()),
    discoverHooks(parent.root),
  );
  const meta = (result.meta ?? {}) as Record<string, any>;
  return {
    report: String(meta.report ?? result.content),
    steps: Number(meta.steps ?? 0),
    toolCalls: Number(meta.toolCalls ?? 0),
  };
});
