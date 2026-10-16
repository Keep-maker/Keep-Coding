# Cursor Fork

A web-based AI coding tool that replicates the core Cursor 3 experience, built on top of
[VS Code](https://github.com/microsoft/vscode)'s open-source editor core.

The app ships **two switchable window modes**, mirroring Cursor 3:

| | **Editor Window** | **Agents Window** |
|---|---|---|
| **Role** | Classic IDE for browsing and hand-editing code | Agent-first workbench for delegating work |
| **Layout** | Activity bar → file tree/search → tabs → editor → terminal → status bar | Session rail → transcript → composer, plus a review side panel |
| **Key features** | File tree, multi-tab editing, Monaco syntax highlighting, fuzzy quick-open (Ctrl+P), workspace-wide search, integrated terminal, breadcrumbs, dirty-state tracking | Multiple parallel agents, streaming responses, live tool-call transparency (diffs + terminal output), Agent/Plan/Ask modes, change review with unified diffs |

Both windows share one workspace, one file state, and one agent session list, so you can
start an agent in the Agents Window and inspect its edits in the Editor Window (and vice versa).

---

## Quick start

```bash
npm install

# Configure the model (any OpenAI-compatible endpoint)
cp .env.example .env      # then edit CURSOR_FORK_API_KEY

npm run dev               # API on :8787, Vite UI on :5173
```

Open <http://127.0.0.1:5173>.

To set the key in the browser instead, open **Model settings** (gear icon, or `Ctrl+,`)
and use **Test connection** to verify — no restart needed.

### Single-port production run

```bash
npm run build
npm start                 # serves the built UI + API from http://127.0.0.1:8787
```

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `CURSOR_FORK_API_KEY` | `sk-xxx` | Bearer token for the model provider |
| `CURSOR_FORK_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI-compatible base URL (the `/chat/completions` path is appended) |
| `CURSOR_FORK_MODEL` | `deepseek-flash` | Model id sent in each request |
| `CURSOR_FORK_WORKSPACE` | `examples/demo-project` | Folder the app opens by default |
| `CURSOR_FORK_PORT` | `8787` | API port |
| `CURSOR_FORK_MAX_STEPS` | `40` | Max agent tool-call rounds per turn |
| `CURSOR_FORK_COMMAND_TIMEOUT_MS` | `120000` | Shell timeout for agent commands |

Values saved from the in-app Settings dialog are stored in `.data/settings.json` and take
precedence over `.env`.

---

## Architecture

```
server/                     Node + Express + WebSocket API
  config.ts                 env / stored-setting resolution, provider info
  routes.ts                 workspace (tree, file, search, CRUD) + terminal routes
  index.ts                  HTTP server, agent WebSocket, static SPA hosting
  agent/
    tools.ts                the 6 agent tools (read/list/search/edit/write/run)
    loop.ts                 stream → tool calls → feed results back → repeat
    sessions.ts             concurrent session manager + transcripts
  services/
    workspace.ts            sandboxed filesystem, tree building, language detection
    search.ts               content search + fuzzy quick-open
    shell.ts                shell runner with timeout + output clamping
    llm.ts                  OpenAI-compatible streaming client

src/                        React UI
  state/store.ts            single observable store shared by both windows
  api/                      REST + agent WebSocket clients
  components/editor/        Editor Window
  components/agents/        Agents Window
  styles/                   design tokens + per-window stylesheets

vendor/vscode/              shallow clone of microsoft/vscode (reference; not built)
tools/                      verification scripts, mock provider, screenshot helper
examples/demo-project/    sample workspace the app opens by default
```

### How the agent works

Each turn is a bounded loop (`server/agent/loop.ts`):

1. Stream a chat completion with the 6 tool schemas attached.
2. Accumulate streamed text (rendered live) and incremental tool-call fragments.
3. Execute each tool against the workspace, capturing a **before/after snapshot**.
4. Append the tool results to the message history and loop.
5. Stop when the model replies without tool calls, or at `CURSOR_FORK_MAX_STEPS`.

Every session gets its own `AbortController`, so agents run **concurrently** and the UI can
stop one without touching the others.

### Agent tools

| Tool | Purpose |
|---|---|
| `list_files` | Enumerate the workspace or a subdirectory |
| `read_file` | Read a file, optionally a line range, with line numbers for reference |
| `search_code` | Plain-text or regex content search with glob filtering |
| `edit_file` | Replace an exact, unique text block (surgical edits) |
| `write_file` | Create or fully overwrite a file |
| `run_command` | Execute a shell command in the workspace root |

`edit_file` requires the matched text to be unique unless `replace_all` is set, which makes
ambiguous edits fail loudly instead of silently corrupting a file.

### Safety boundaries

- Every path is resolved through `safeResolve`, which rejects anything escaping the
  workspace root (`../` traversal is blocked, verified by tests).
- Shell commands run with the workspace as `cwd` and are killed on timeout
  (process-tree kill on Windows).
- Command output is clamped to 40 KB; tool results sent to the model to 30 KB.
- Binary files are refused by `read_file`; `.git`, `node_modules`, and similar
  directories are excluded from the tree and from search.

---

## Verification

```bash
npm run typecheck     # whole-project TypeScript check
npm run test:tools    # 11 agent-tool edge cases (CRLF, ambiguity, traversal, ...)
npm run test:api      # 10 end-to-end API + agent-loop checks (needs the dev server)

npm run mock:llm      # optional: local OpenAI-compatible mock on :9911
```

`test:api` drives real agent runs over the WebSocket, including a **parallel-agents** check.

The mock provider (`tools/mock-llm.mjs`) scripts a 4-step trajectory
(`list_files → read_file → edit_file → run_command`) so the full loop can be verified
without spending API credits:

```bash
npm run mock:llm                       # terminal 1
# point Settings → Base URL at http://127.0.0.1:9911/v1
```

Visual checks use Playwright: `node tools/shot.mjs` walks both windows, saves screenshots into
`shots/`, and exits non-zero if the page logged any console errors.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick open (fuzzy file search) |
| `Ctrl+,` | Model settings |
| `Ctrl+S` | Save the active file (files also autosave 700 ms after you stop typing) |
| `Ctrl+Shift+A` | Switch to the Agents Window |
| `Ctrl+Shift+E` | Switch to the Editor Window |
| `Enter` / `Shift+Enter` | Send agent prompt / newline |

---

## Research notes

`research/cursor-docs/` contains the Cursor 3 product documentation that informed the
window and agent design (Agents Window, Agent overview, Plan Mode, Projects, Prompting,
Design Mode).

Two tooling caveats, recorded for reproducibility:

- **Firecrawl and Context7 were not available in the build environment** (no such MCP
  server was configured). The Cursor documentation above was fetched directly and
  converted to text, and framework API reference came from the installed packages'
  TypeScript declarations under `node_modules` rather than a docs-lookup service.
- The VS Code tree in `vendor/vscode` was cloned for reference only. It is gitignored;
  re-clone it with `gh repo clone microsoft/vscode vendor/vscode` if you want it locally.

---

## Relationship to VS Code

`vendor/vscode` is a shallow clone of `microsoft/vscode` kept as a **reference** for the
editor and workbench design — the layout of this app's parts (activity bar, sidebar,
editor area, panel, status bar) mirrors VS Code's real workbench structure, and the editor
is Monaco, the same editor core VS Code ships. This project does not build or embed the VS
Code desktop application; it is an independent web implementation of the Cursor-style
experience on top of the Monaco editor.



