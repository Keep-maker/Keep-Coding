/**
 * Direct unit checks for the agent tools, covering the edge cases that matter
 * most on Windows: CRLF files, ambiguous edits, and path escapes.
 *
 * Usage: npx tsx tools/tools-test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileTool, editFileTool, writeFileTool, findTool } from '../server/agent/tools.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cursorfork-'));
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
}

const ctx = { root };

// --- CRLF preservation ---
fs.writeFileSync(path.join(root, 'crlf.txt'), 'alpha\r\nbeta\r\ngamma\r\n', 'utf8');
const crlfEdit = await editFileTool.run(
  { path: 'crlf.txt', old_string: 'beta', new_string: 'beta-updated' },
  ctx,
);
check('CRLF edit applies', !crlfEdit.isError, crlfEdit.content);
const crlfAfter = fs.readFileSync(path.join(root, 'crlf.txt'), 'utf8');
check('CRLF endings preserved', crlfAfter.includes('\r\n') && !crlfAfter.includes('\n\n'), JSON.stringify(crlfAfter));

// --- ambiguous edit is rejected ---
fs.writeFileSync(path.join(root, 'dupe.txt'), 'x\ny\nx\n', 'utf8');
const ambiguous = await editFileTool.run({ path: 'dupe.txt', old_string: 'x', new_string: 'z' }, ctx);
check('ambiguous edit rejected', ambiguous.isError === true, ambiguous.content.slice(0, 60));
const allReplaced = await editFileTool.run(
  { path: 'dupe.txt', old_string: 'x', new_string: 'z', replace_all: true },
  ctx,
);
check('replace_all works', !allReplaced.isError, allReplaced.content);

// --- missing needle reports clearly ---
const missing = await editFileTool.run({ path: 'crlf.txt', old_string: 'not-present', new_string: 'x' }, ctx);
check('missing old_string reported', missing.isError === true, missing.content.slice(0, 60));

// --- path escape blocked ---
const escape = await readFileTool.run({ path: '../../../etc/passwd' }, ctx);
check('path escape blocked', escape.isError === true, escape.content.slice(0, 60));

// --- create + read round trip ---
const created = await writeFileTool.run({ path: 'nested/dir/new.ts', content: 'export const x = 1;\n' }, ctx);
check('create nested file', !created.isError, created.content);
check('file exists on disk', fs.existsSync(path.join(root, 'nested/dir/new.ts')));

// --- reading a binary file is refused ---
fs.writeFileSync(path.join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const binary = await readFileTool.run({ path: 'image.png' }, ctx);
check('binary read refused', binary.isError === true, binary.content.slice(0, 60));

// --- line ranges ---
fs.writeFileSync(path.join(root, 'lines.txt'), 'one\ntwo\nthree\nfour\n', 'utf8');
const ranged = await readFileTool.run({ path: 'lines.txt', start_line: 2, end_line: 3 }, ctx);
check('line range read', ranged.content.includes('two') && ranged.content.includes('three') && !ranged.content.includes('four'));

// --- unknown tool ---
check('unknown tool lookup returns undefined', findTool('nope') === undefined);

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} tool checks passed`);
process.exit(fail ? 1 : 0);
