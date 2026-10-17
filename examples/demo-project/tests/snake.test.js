import { SnakeGame, DIRECTIONS } from '../src/game.js';
import assert from 'node:assert';

// Deterministic rng so food placement is predictable.
let values;
function makeRng() {
  values = [0.1, 0.2, 0.3];
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

// 1) initial state
let game = new SnakeGame({ width: 20, height: 12, rng: makeRng() });
assert.equal(game.length, 3, 'snake starts with 3 segments');
assert.equal(game.score, 0, 'score starts at 0');
assert.equal(game.gameOver, false, 'not game over at start');
assert.equal(game.direction, DIRECTIONS.right, 'moves right at start');
assert.ok(game.food, 'food is placed');

// 2) stepping moves the head forward
const headBefore = { ...game.snake[0] };
game.step();
assert.equal(game.snake[0].x, headBefore.x + 1, 'head advanced');
assert.equal(game.length, 3, 'length unchanged when not eating');

// 3) turning 180 degrees is ignored (no instant self-kill)
game.turn('left');
assert.equal(game.direction, DIRECTIONS.right, 'reverse turn ignored');

// 4) valid turn works
game.turn('up');
assert.equal(game.direction, DIRECTIONS.up, 'turn to up accepted');

// 5) hitting the wall ends the game
let wall = new SnakeGame({ width: 4, height: 4, rng: makeRng });
wall.snake = [{ x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }];
wall.direction = DIRECTIONS.right;
wall.food = { x: 0, y: 0 };
wall.step();
assert.equal(wall.gameOver, true, 'wall collision ends the game');

// 6) eating food grows the snake and scores
let eat = new SnakeGame({ width: 8, height: 8, rng: makeRng });
eat.snake = [{ x: 2, y: 1 }, { x: 1, y: 1 }];
eat.direction = DIRECTIONS.right;
eat.food = { x: 3, y: 1 };
eat.step();
assert.equal(eat.length, 3, 'snake grew after eating');
assert.equal(eat.score, 1, 'score increased');
assert.notDeepEqual(eat.food, { x: 3, y: 1 }, 'new food placed');

// 7) self collision ends the game
let self = new SnakeGame({ width: 8, height: 8, rng: makeRng });
self.snake = [{ x: 4, y: 2 }, { x: 4, y: 3 }, { x: 3, y: 3 }];
self.direction = DIRECTIONS.down;
self.food = { x: 0, y: 0 };
self.turn('down'); // no-op? down is same dir, fine
// make it collide with its own body: place head just above its own tail row
self.snake = [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
self.direction = DIRECTIONS.down;
self.step(); // head goes to (4,5) which is occupied by body
assert.equal(self.gameOver, true, 'self collision ends the game');

// 8) reset restores initial state
let reset = new SnakeGame({ width: 20, height: 12, rng: makeRng });
reset.score = 99;
reset.snake = [{ x: 9, y: 9 }];
reset.reset();
assert.equal(reset.score, 0, 'score reset');
assert.equal(reset.length, 3, 'length reset');
assert.equal(reset.gameOver, false, 'gameOver reset');

// 9) stepping after game over is a no-op
wall.snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const before = JSON.stringify(wall.snake);
wall.step();
assert.equal(JSON.stringify(wall.snake), before, 'no move after game over');

// 10) unknown turn name is ignored
let t = new SnakeGame({ width: 20, height: 12, rng: makeRng });
t.turn('sideways');
assert.equal(t.direction, DIRECTIONS.right, 'unknown direction ignored');

console.log('all snake tests passed');
