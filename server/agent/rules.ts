import fs from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../services/workspace.js';

export interface Rule {
  name: string;
  /** Glob patterns the rule applies to; empty means always apply. */
  globs: string[];
  /** "Always" | "Agent Requested" | "Manual" | "Model Decision" */
  activation: string;
  description: string;
  body: string;
  file: string;
  source: 'project' | 'user';
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const eq = line.indexOf(':');
    if (eq < 1) continue;
    data[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: raw.slice(match[0].length) };
}

/** `.mdc` files are the project rule format; `.md` is accepted for plain markdown rules. */
function scanRulesDir(dir: string, source: Rule['source'], out: Rule[]): void {
  if (!fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (!entry.isFile() || !/\.(mdc|md)$/i.test(entry.name)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const { data, body } = parseFrontmatter(raw);
      const rawGlobs = data.globs ?? data.glob ?? '';
      const globs = rawGlobs
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      out.push({
        name: entry.name.replace(/\.(mdc|md)$/i, ''),
        globs,
        activation: (data.alwaysApply === 'true' ? 'Always' : data.trigger) || 'Always',
        description: data.description ?? '',
        body,
        file,
        source,
      });
    } catch {
      /* skip unreadable rules */
    }
  }
}

/**
 * Discovers rules from `.cursor/rules` in the workspace plus the user-level
 * `~/.cursor/rules`, mirroring Cursor's project/user rule split.
 */
export function discoverRules(root: string, home: string): Rule[] {
  const project: Rule[] = [];
  const user: Rule[] = [];
  scanRulesDir(path.join(root, '.cursor', 'rules'), 'project', project);
  scanRulesDir(path.join(home, '.cursor', 'rules'), 'user', user);

  // Also honour a plain AGENTS.md at the project root, which many repos use.
  const agentsFile = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agentsFile)) {
    try {
      project.unshift({
        name: 'AGENTS.md',
        globs: [],
        activation: 'Always',
        description: 'Project instructions from AGENTS.md',
        body: fs.readFileSync(agentsFile, 'utf8'),
        file: agentsFile,
        source: 'project',
      });
    } catch {
      /* ignore */
    }
  }
  return [...user, ...project];
}

/** Rules whose globs match a path, plus every always-on rule. */
export function rulesForPath(rules: Rule[], relativePath: string): Rule[] {
  return rules.filter((rule) => {
    if (!rule.globs.length) return true;
    return rule.globs.some((glob) => globToRegExp(glob).test(relativePath) || globToRegExp(`**/${glob}`).test(relativePath));
  });
}

export function ruleCatalog(rules: Rule[]): string {
  if (!rules.length) return '';
  return rules
    .map((rule) => `- ${rule.name}${rule.globs.length ? ` (globs: ${rule.globs.join(', ')})` : ''}${rule.description ? `: ${rule.description}` : ''}`)
    .join('\n');
}
