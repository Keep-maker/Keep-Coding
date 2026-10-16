/**
 * Tiny in-memory task tracker used as a demo workspace
 * for the Cursor Fork agent.
 */
import { makeId } from './utils/id.js';
import { formatTask } from './utils/format.js';

export class TaskStore {
  constructor() {
    this.tasks = [];
  }

  add(title, priority = 'normal') {
    const task = { id: makeId(), title, priority, done: false };
    this.tasks.push(task);
    return task;
  }

  complete(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.done = true;
    return task;
  }

  list() {
    return this.tasks.map(formatTask);
  }

  pending() {
    return this.tasks.filter((t) => !t.done);
  }
}
