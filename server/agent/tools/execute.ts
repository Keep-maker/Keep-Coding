import { runCommand } from '../../services/shell.js';
import { asString, type ToolDefinition } from './types.js';

export const runCommandTool: ToolDefinition = {
  schema: {
    name: 'run_command',
    description:
      'Execute a shell command in the workspace root and return stdout/stderr with the exit code. Use it for builds, tests, git, and package managers.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
        purpose: { type: 'string', description: 'Short reason for running this command, shown to the user.' },
      },
      required: ['command'],
    },
  },
  async run(input, ctx) {
    const command = asString(input.command);
    if (!command.trim()) return { content: 'Error: command must not be empty.', isError: true };
    const result = await runCommand(ctx.root, command);
    ctx.onOutput?.(`$ ${command}  (exit ${result.exitCode ?? 'null'})`);
    const parts = [
      `Command: ${command}`,
      `Exit code: ${result.exitCode ?? 'null'}${result.timedOut ? ' (timed out)' : ''}`,
      `Duration: ${result.durationMs}ms`,
      result.stdout ? `stdout:\n${result.stdout}` : 'stdout: (empty)',
      result.stderr ? `stderr:\n${result.stderr}` : '',
    ].filter(Boolean);
    return { content: parts.join('\n'), isError: result.exitCode !== 0, meta: { ...result } };
  },
};

/**
 * Todo list. Cursor's agent keeps a visible plan in the transcript; mirroring the
 * full list on every update lets the UI render live progress.
 */
export const todoWriteTool: ToolDefinition = {
  schema: {
    name: 'todo_write',
    description:
      'Create and maintain a task list for the current work. Call it early for multi-step tasks, keep exactly one item in_progress at a time, and update it as you complete work.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The complete, updated todo list.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable identifier.' },
              content: { type: 'string', description: 'What needs to be done.' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Current state.' },
            },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
  async run(input, ctx) {
    const raw = Array.isArray(input?.todos) ? input.todos : [];
    const todos = raw.map((todo: any, index: number) => ({
      id: asString(todo.id) || `todo-${index + 1}`,
      content: asString(todo.content),
      status: ['pending', 'in_progress', 'completed'].includes(todo.status) ? todo.status : 'pending',
    }));
    const done = todos.filter((todo: { status: string }) => todo.status === 'completed').length;
    ctx.onOutput?.(`Todos ${done}/${todos.length} complete`);
    return {
      content: `Todo list updated (${done}/${todos.length} complete):\n${todos.map((todo: { status: string; content: string }) => `- [${todo.status === 'completed' ? 'x' : todo.status === 'in_progress' ? '~' : ' '}] ${todo.content}`).join('\n')}`,
      meta: { todos },
    };
  },
};

/**
 * Asks the user a question mid-run. The run pauses until the UI answers; the
 * answer is delivered back through the tool result.
 */
export const askQuestionTool: ToolDefinition = {
  schema: {
    name: 'ask_question',
    description:
      'Ask the user a clarifying question when requirements are ambiguous and guessing would waste work. Provide 2-4 concrete options. Execution pauses until they answer.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask.' },
        options: {
          type: 'array',
          description: 'Concrete choices for the user.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Short identifier.' },
              label: { type: 'string', description: 'Choice text.' },
              description: { type: 'string', description: 'Optional clarification.' },
            },
            required: ['label'],
          },
        },
        allow_multiple: { type: 'boolean', description: 'Allow selecting more than one option.' },
      },
      required: ['question', 'options'],
    },
  },
  async run(input, ctx) {
    const question = asString(input.question);
    const options = (Array.isArray(input?.options) ? input.options : []).map((option: any, index: number) => ({
      id: asString(option.id) || `option-${index + 1}`,
      label: asString(option.label),
      description: asString(option.description) || undefined,
    }));
    if (!question || !options.length) {
      return { content: 'Error: question and at least one option are required.', isError: true };
    }

    // The session layer resolves this promise when the user answers in the UI.
    const answer = await ctx.ask?.(
      { question, options, allowMultiple: Boolean(input.allow_multiple) },
      ctx.toolCallId,
    );

    if (!answer) {
      return { content: 'The user did not answer. Proceed with your best judgement and state your assumption.', meta: { question, unanswered: true } };
    }
    ctx.onOutput?.(`Answered: ${answer.selected.join(', ')}`);
    return {
      content: `The user answered: ${answer.selected.join(', ')}${answer.note ? `\nAdditional note: ${answer.note}` : ''}`,
      meta: { question, selected: answer.selected, note: answer.note, answered: true },
    };
  },
};
