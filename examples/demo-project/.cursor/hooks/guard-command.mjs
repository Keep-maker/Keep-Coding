/**
 * Example before_tool hook: refuses obviously destructive shell commands.
 * Receives a JSON payload on stdin and may reply with { block } on stdout.
 */
let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }
  const command = String(payload?.tool?.args?.command ?? '');
  const destructive = /rm\s+-rf\s+\/(?!\w)|format\s+[a-z]:|del\s+\/f\s+\/s\s+\/q\s+[a-z]:/i;
  if (destructive.test(command)) {
    process.stdout.write(JSON.stringify({ block: 'Refused: command looks destructive.' }));
    return;
  }
  process.exit(0);
});
