import { readFileTool, listFilesTool, globTool, grepTool, treeTool, readImageTool, fileInfoTool } from './read.js';
import { editFileTool, multiEditTool, writeFileTool, deleteFileTool, moveFileTool } from './edit.js';
import { runCommandTool, todoWriteTool, askQuestionTool } from './execute.js';
import { taskTool } from './task.js';
import type { ToolDefinition } from './types.js';

/** Every tool the agent may call, in the order they are advertised to the model. */
export const ALL_TOOLS: ToolDefinition[] = [
  // exploration
  listFilesTool,
  treeTool,
  globTool,
  grepTool,
  readFileTool,
  fileInfoTool,
  readImageTool,
  // modification
  editFileTool,
  multiEditTool,
  writeFileTool,
  moveFileTool,
  deleteFileTool,
  // execution and coordination
  runCommandTool,
  todoWriteTool,
  askQuestionTool,
  taskTool,
];

export function findTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.schema.name === name);
}

export function toolSchemas() {
  return ALL_TOOLS.map((tool) => tool.schema);
}

/** Tools that can change the workspace; used for snapshotting and approval. */
export function isMutating(name: string): boolean {
  return Boolean(findTool(name)?.mutates);
}

export type { ToolDefinition, ToolContext, ToolResult } from './types.js';
