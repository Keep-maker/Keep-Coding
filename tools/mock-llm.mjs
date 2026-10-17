/**
 * Mock OpenAI-compatible endpoint used to verify the agent loop end to end
 * without consuming real API credits.
 *
 * The scripted trajectory is self-contained: it writes its own scratch file,
 * edits it, runs it, then answers with rich markdown. That keeps the fixture
 * valid no matter what the open workspace happens to contain.
 *
 * Usage: node tools/mock-llm.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 9911);
const SCRATCH = '.mock-agent-check.js';
let callCount = 0;

function sse(res, chunks) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

const textDelta = (content) => ({ choices: [{ index: 0, delta: { content }, finish_reason: null }] });

const toolDelta = (index, name, argsFragment, id) => ({
  choices: [
    {
      index: 0,
      delta: { tool_calls: [{ index, id, type: 'function', function: { name, arguments: argsFragment } }] },
      finish_reason: null,
    },
  ],
});

const done = (reason) => ({ choices: [{ index: 0, delta: {}, finish_reason: reason }] });

// A realistic markdown answer so the renderer can be verified visually:
// headings, bold, lists, a table, a task list, a blockquote and a code block.
const RICH_MARKDOWN = [
  '## Changes made',
  '',
  'I created a scratch module, edited it, and verified it by running it.',
  '',
  '### What changed',
  '',
  `- \`${SCRATCH}\` - new file with a \`greet\` helper`,
  '- No existing files were modified',
  '',
  '### Verification',
  '',
  '| Check | Command | Result |',
  '| --- | --- | --- |',
  `| Run module | \`node ${SCRATCH}\` | pass |`,
  '| Type check | `npm run typecheck` | pass |',
  '',
  'Remaining work:',
  '',
  '- [x] Create the helper',
  '- [x] Run it to confirm output',
  '- [ ] Wire it into the CLI',
  '',
  '> Note: the scratch file is safe to delete once you have reviewed it.',
  '',
  '```js',
  'export function greet(name) {',
  "  return `hello, ${name}!`;",
  '}',
  '```',
  '',
  `Open \`${SCRATCH}\` to review it.`,
  '',
].join('\n');

const server = http.createServer((req, res) => {
  if (!req.url?.includes('/chat/completions')) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body);
    const messages = parsed.messages ?? [];

    // Non-streaming path, used by the "Test connection" button.
    if (parsed.stream === false) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }),
      );
      return;
    }

    // Each completed tool round is recorded as an assistant message with tool_calls.
    const step = messages.filter((m) => m.role === 'assistant' && m.tool_calls).length;
    callCount += 1;
    console.log(`[mock] request #${callCount} step=${step} messages=${messages.length} tools=${parsed.tools?.length ?? 0}`);

    if (step === 0) {
      sse(res, [textDelta('I will look at the project first.\n\n'), toolDelta(0, 'list_files', '{}', 'c1'), done('tool_calls')]);
      return;
    }
    if (step === 1) {
      sse(res, [
        toolDelta(
          0,
          'write_file',
          JSON.stringify({
            path: SCRATCH,
            content: "export function greet(name) {\n  return `hello, ${name}!`;\n}\n\nconsole.log(greet('agent'));\n",
          }),
          'c2',
        ),
        done('tool_calls'),
      ]);
      return;
    }
    if (step === 2) {
      sse(res, [
        toolDelta(
          0,
          'read_file',
          JSON.stringify({ path: SCRATCH }),
          'c3',
        ),
        done('tool_calls'),
      ]);
      return;
    }
    if (step === 3) {
      sse(res, [
        toolDelta(
          0,
          'edit_file',
          JSON.stringify({
            path: SCRATCH,
            old_string: "console.log(greet('agent'));",
            new_string: "console.log(greet('agent'));\nconsole.log(greet('world'));",
          }),
          'c4',
        ),
        done('tool_calls'),
      ]);
      return;
    }
    if (step === 4) {
      sse(res, [
        toolDelta(0, 'run_command', JSON.stringify({ command: `node ${SCRATCH}`, purpose: 'Verify the module runs' }), 'c5'),
        done('tool_calls'),
      ]);
      return;
    }
    sse(res, [textDelta(RICH_MARKDOWN), done('stop')]);
  });
});

server.on('request', () => {});
server.listen(port, () => console.log(`[mock] OpenAI-compatible server on http://127.0.0.1:${port}`));
