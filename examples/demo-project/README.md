# Snake CLI

A small terminal snake game with zero dependencies, built with Node.js ES Modules.

## Structure

```
src/
  game.js    # Pure game logic (SnakeGame class) – no terminal required
  index.js   # CLI entry point – renders the board, handles keyboard input
tests/
  snake.test.js
```

## Play

```bash
npm start
```

| Key              | Action              |
|------------------|---------------------|
| `w` / `ArrowUp`    | Move up             |
| `s` / `ArrowDown`  | Move down           |
| `a` / `ArrowLeft`  | Move left           |
| `d` / `ArrowRight` | Move right          |
| `r`                | Restart             |
| `q` / `Ctrl+C`    | Quit                |

## Test

```bash
npm test
```
