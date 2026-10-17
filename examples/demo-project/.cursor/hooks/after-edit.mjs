/**
 * Example after_edit hook: reports that a formatter would normally run here.
 */
let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  process.stdout.write(JSON.stringify({ additionalContext: 'after_edit hook observed the change.' }));
});
