# Keep Coding

Web AI coding tool replicating Cursor's core experience (Editor Window + Agents Window).

## Stack

- **Frontend**: Vite + React 18, Monaco Editor, Tailwind-less hand-rolled CSS
- **Backend**: Express 4 over TS (tsx), streaming chat completions against any OpenAI-compatible endpoint
- **Tooling**: Playwright end-to-end suite + local mocks for LLM / shell / markdown streaming

## Quick start

```bash
npm install
cp .env.example .env   # fill in CURSOR_FORK_API_KEY
npm run dev
```

The dev server runs concurrently on:

- `http://127.0.0.1:8787` — API server
- `http://127.0.0.1:5173` — Vite UI

A bundled demo workspace lives at `examples/demo-project`; the server opens it by default so a fresh clone is immediately usable.

## Configuration

All provider configuration is in `.env` (or the in-app Settings dialog, which writes to `.data/settings.json`). `.env`, `.data/` and `vendor/` are gitignored and never committed.

## Tests

```bash
npm run typecheck       # tsc --noEmit
npm run test:tools      # local tool tests
npm run test:api        # end-to-end API suite (requires a running server)
npm run test:markdown   # markdown rendering regression
npm run test:streaming  # streaming shimmer / thinking-state regression
```

## Repository layout

```
src/        React app (editor + agents windows)
server/     Express API
tools/      Mocks, verification scripts, e2e harness
examples/   Sample project auto-opened on first launch
shots/      E2E screenshots (gitignored)
```
