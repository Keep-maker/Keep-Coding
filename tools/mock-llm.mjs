/**
 * Mock OpenAI-compatible endpoint used to verify the agent loop end to end
 * without consuming real API credits. It scripts a deterministic tool-using
 * response: search -> read -> edit -> run_command -> final summary.
 *
 * Usage: node tools/mock-llm.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 9911);
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

function textDelta(content) {
  return { choices: [{ index: 0, delta: { content }, finish_reason: null }] };
}

function toolDelta(index, name, argsFragment, id) {
  return {
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index, id, type: 'function', function: { name, arguments: argsFragment } }] },
        finish_reason: null,
      },
    ],
  };
}

function done(reason) {
  return { choices: [{ index: 0, delta: {}, finish_reason: reason }] };
}

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

    // Support the non-streaming path used by the "Test connection" button.
    if (parsed.stream === false) {
      console.log('[mock] non-streaming request');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
      return;
    }

    // Each completed tool round is recorded as an assistant message with tool_calls.
    const step = messages.filter((m) => m.role === 'assistant' && m.tool_calls).length;
    callCount += 1;

    console.log(`[mock] request #${callCount} step=${step} messages=${messages.length} tools=${parsed.tools?.length ?? 0}`);

    // Scripted 4-step agent trajectory.
    if (step === 0) {
      sse(res, [
        textDelta('I will look at the project first.\n\n'),
        toolDelta(0, 'list_files', '{}', 'c1'),
        done('tool_calls'),
      ]);
      return;
    }
    if (step === 1) {
      sse(res, [toolDelta(0, 'read_file', JSON.stringify({ path: 'src/utils/format.js' }), 'c2'), done('tool_calls')]);
      return;
    }
    if (step === 2) {
      sse(res, [
        toolDelta(
          0,
          'edit_file',
          JSON.stringify({
            path: 'src/utils/format.js',
            old_string: "  const box = task.done ? '[x]' : '[ ]';",
            new_string: "  const box = task.done ? '[x]' : '[ ]';\n  const overdue = task.due && Date.parse(task.due) < Date.now();",
          }),
          'c3',
        ),
        done('tool_calls'),
      ]);
      return;
    }
    if (step === 3) {
      sse(res, [toolDelta(0, 'run_command', JSON.stringify({ command: 'npm test', purpose: 'Verify the tests still pass' }), 'c4'), done('tool_calls')]);
      return;
    }
    sse(res, [
      textDelta('Done. I added an `overdue` flag in `src/utils/format.js` and verified the suite with `npm test`, which passes.\n\n'),
      done('stop'),
    ]);
  });
});

server.listen(port, () => console.log(`[mock] OpenAI-compatible server on http://127.0.0.1:${port}`));


