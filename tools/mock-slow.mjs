/**
 * Mock provider that streams slowly, one token at a time, with a deliberate
 * pause before the first token. Used to verify the streaming shimmer and the
 * thinking placeholder - states that are impossible to capture with an
 * instantaneous mock.
 *
 * Usage: node tools/mock-slow.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 9913);

const ANSWER = [
  '## Summary',
  '',
  'I reviewed `src/game.js` and the surrounding modules. The renderer streams',
  'this paragraph **one token at a time** so the shimmer can be observed.',
  '',
  '### Details',
  '',
  '- The grid is stored as a flat array',
  '- Collision uses a `Set` of `row,col` keys',
  '- Score increments by 10 per pellet',
  '',
  '```js',
  'const key = `${row},${col}`;',
  'if (occupied.has(key)) return gameOver();',
  '```',
  '',
  'That is everything I found.',
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const parsed = JSON.parse(body || '{}');
    if (parsed.stream === false) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    // Long pause before the first token so the thinking state is observable.
    await sleep(2500);

    // Stream in small chunks with a steady cadence.
    const tokens = ANSWER.match(/\s+|\S+/g) ?? [];
    for (const token of tokens) {
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: token }, finish_reason: null }] })}\n\n`);
      await sleep(45);
    }
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

server.listen(port, () => console.log(`[mock-slow] streaming on http://127.0.0.1:${port}`));
