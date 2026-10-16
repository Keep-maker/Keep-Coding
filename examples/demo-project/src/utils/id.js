let counter = 0;

/** Generates short, stable, human-readable task ids. */
export function makeId() {
  counter += 1;
  return `task-${counter}`;
}
