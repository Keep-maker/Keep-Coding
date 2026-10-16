const PRIORITY_LABELS = {
  low: 'LOW',
  normal: 'MED',
  high: 'HIGH',
};

/** Formats a task for display in the CLI. */
export function formatTask(task) {
  const box = task.done ? '[x]' : '[ ]';
  const priority = PRIORITY_LABELS[task.priority] ?? 'MED';
  return `${box} ${priority} ${task.title}`;
}
