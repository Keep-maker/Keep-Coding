/**
 * Snake game core logic.
 *
 * This module is pure and framework-free so it can be unit tested without a
 * terminal. The CLI entry point in `src/index.js` drives it frame by frame.
 */

export const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const isOpposite = (a, b) => a.x === -b.x && a.y === -b.y;
const sameCell = (a, b) => a.x === b.x && a.y === b.y;

export class SnakeGame {
  /**
   * @param {object} [options]
   * @param {number} [options.width]  Playfield width in cells.
   * @param {number} [options.height] Playfield height in cells.
   * @param {() => number} [options.rng] Random source, returns [0, 1).
   */
  constructor({ width = 20, height = 12, rng = Math.random } = {}) {
    this.width = width;
    this.height = height;
    this.rng = rng;
    this.reset();
  }

  reset() {
    const midY = Math.floor(this.height / 2);
    this.snake = [
      { x: 3, y: midY },
      { x: 2, y: midY },
      { x: 1, y: midY },
    ];
    this.direction = DIRECTIONS.right;
    this.score = 0;
    this.gameOver = false;
    this.food = this.placeFood();
    return this;
  }

  /**
   * Change heading. Reverse moves are ignored so the snake can never eat
   * itself by instantly turning back on itself.
   */
  turn(name) {
    const next = DIRECTIONS[name];
    if (!next) return this;
    if (isOpposite(next, this.direction)) return this;
    this.direction = next;
    return this;
  }

  /** Advance the game by one tick. Returns `this` for chaining. */
  step() {
    if (this.gameOver) return this;

    const head = this.snake[0];
    const next = { x: head.x + this.direction.x, y: head.y + this.direction.y };

    if (this.#hitsWall(next) || this.#hitsSelf(next)) {
      this.gameOver = true;
      return this;
    }

    this.snake.unshift(next);

    if (sameCell(next, this.food)) {
      this.score += 1;
      this.food = this.placeFood();
    } else {
      this.snake.pop();
    }

    return this;
  }

  /** Number of segments the snake currently has. */
  get length() {
    return this.snake.length;
  }

  #hitsWall({ x, y }) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height;
  }

  #hitsSelf(cell) {
    return this.snake.some((segment) => sameCell(segment, cell));
  }

  /** Pick a free cell for the next food. Falls back to the head cell when full. */
  placeFood() {
    const occupied = new Set(this.snake.map((s) => `${s.x},${s.y}`));
    const free = [];
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return { ...this.snake[0] };
    return free[Math.floor(this.rng() * free.length)];
  }
}
