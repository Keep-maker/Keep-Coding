/**
 * Termin
 * al snake.
 *
 * Interactive CLI entry point: renders the board to stdout and listens for
 * keyboard input on stdin. The pure game rules live in `src/game.js`.
 */
import { SnakeGame } from './game.js';

const game = new SnakeGame({ width: 24, height: 14 });

const KEYS = {
  k: 'up',
  j: 'down',
  h: 'left',
  l: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function render() {
  const rows = [];
  rows.push(' +'.padEnd(game.width + 1, '-'));
  for (let y = 0; y < game.height; y += 1) {
    let line = ' ';
    for (let x = 0; x < game.width; x += 1) {
      if (same(game.snake[0], { x, y })) line += 'O';
      else if (game.snake.some((s) => same(s, { x, y }))) line += '#';
      else if (same(game.food, { x, y })) line += '*';
      else line += '.';
    }
    rows.push(line + ' ');
  }
  rows.push(' +'.padEnd(game.width + 1, '-'));
  rows.push(` score ${game.score}   len ${game.length}   [wasd/arrows] q=quit r=reset`);

  // clearLine / cursorTo only exist on TTY streams. Guard them so the game
  // keeps rendering (one board per tick) when stdout is a pipe/socket.
  if (typeof process.stdout.clearLine === 'function') {
    process.stdout.clearLine(0);
  }
  if (typeof process.stdout.cursorTo === 'function') {
    process.stdout.cursorTo(0, 0);
  }
  process.stdout.write(rows.join('\n') + '\n');
}

function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

let stopped = false;

// setRawMode only exists on TTY streams. Guard so the game can still launch
// (and render) when stdin is a pipe/socket (e.g. scripted or CI runs).
if (typeof process.stdin.setRawMode === 'function') {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  for (const char of chunk) {
    if (char === '\u0003' || char === 'q') {
      stopped = true;
    } else if (char === 'r') {
      game.reset();
    } else {
      const dir = KEYS[char];
      if (dir) game.turn(dir);
    }
  }
});

function tick() {
  if (stopped) {
    process.stdout.write('\n\nthanks for playing!\n');
    process.exit(0);
  }
  game.step();
  render();
  if (game.gameOver) {
    process.stdout.write('\n\nGAME OVER — score ' + game.score + '\n');
    process.exit(0);
  }
  setTimeout(tick, 110);
}

render();
setTimeout(tick, 110);
