import fs from 'node:fs';
import path from 'node:path';

export interface Skill {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  file: string;
  /** Directory holding the skill, for resolving bundled scripts/resources. */
  dir: string;
  /** Markdown body, injected into the prompt when the skill is activated. */
  body: string;
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
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

function scanSkillsDir(dir: string, source: Skill['source'], out: Skill[]): void {
  if (!fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(dir, entry.name);
    const file = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const { data, body } = parseFrontmatter(raw);
      out.push({
        name: data.name ?? entry.name,
        description: data.description ?? '',
        file,
        dir: skillDir,
        body,
        source,
      });
    } catch {
      /* skip unreadable skills */
    }
  }
}

/**
 * Discovers Agent Skills (the open standard Cursor also uses) from
 * `.cursor/skills/<name>/SKILL.md` in the workspace and `~/.cursor/skills` for
 * the user level. Project skills shadow user skills of the same name.
 */
export function discoverSkills(root: string, home: string): Skill[] {
  const project: Skill[] = [];
  const user: Skill[] = [];
  scanSkillsDir(path.join(root, '.cursor', 'skills'), 'project', project);
  scanSkillsDir(path.join(home, '.cursor', 'skills'), 'user', user);

  const byName = new Map<string, Skill>();
  for (const skill of [...user, ...project]) byName.set(skill.name, skill);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Short catalogue injected into the system prompt so the model knows what exists. */
export function skillCatalog(skills: Skill[]): string {
  if (!skills.length) return '';
  return skills
    .map((skill) => `- ${skill.name}: ${skill.description || '(no description)'}`)
    .join('\n');
}

export function findSkill(skills: Skill[], name: string): Skill | undefined {
  return skills.find((skill) => skill.name === name);
}
