/**
 * Mock provider that returns a markdown torture-test document instead of a tool
 * trajectory. Used to verify the renderer handles headings, nested lists, wide
 * tables, task lists, long code lines, and raw HTML/XSS attempts safely.
 *
 * Usage: node tools/mock-markdown.mjs [port]
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 9912);

const DOC = [
  '# H1 heading',
  '## H2 heading',
  '### H3 heading',
  '',
  'Paragraph with **bold**, *italic*, ~~strike~~, `inline code`, and a [link](https://example.com).',
  '',
  '1. First',
  '2. Second',
  '   - nested bullet',
  '   - another',
  '',
  '| Very long column header | Another long header | Result |',
  '| --- | --- | --- |',
  '| a really long cell value that should scroll horizontally instead of breaking the layout | second | pass |',
  '',
  '- [ ] todo',
  '- [x] done',
  '',
  '> quoted text',
  '',
  '```ts',
  'const veryLongLine = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";',
  '```',
  '',
  '<script>window.__xss = true;</script>',
  '<img src=x onerror="window.__xss2 = true">',
].join('\n');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    if (parsed.stream === false) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: DOC }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

server.listen(port, () => console.log(`[mock-markdown] on http://127.0.0.1:${port}`));
