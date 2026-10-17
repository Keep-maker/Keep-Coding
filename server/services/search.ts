import fs from 'node:fs';
import path from 'node:path';
import { buildTree, flattenFiles, fuzzyScore, globToRegExp, isBinary, safeResolve, toPosix } from './workspace.js';

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
  /** Surrounding lines when -A/-B/-C style context is requested. */
  context?: string[];
}

export interface SearchOptions {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  include?: string;
  maxResults?: number;
  beforeContext?: number;
  afterContext?: number;
}

/** Content search implemented in-process so there is no external binary dependency. */
export function searchContent(root: string, options: SearchOptions): SearchHit[] {
  const { query } = options;
  const maxResults = options.maxResults ?? 200;
  const before = Math.max(0, options.beforeContext ?? 0);
  const after = Math.max(0, options.afterContext ?? 0);
  if (!query) return [];

  let matcher: RegExp;
  try {
    if (options.isRegex) {
      matcher = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
    } else {
      matcher = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.caseSensitive ? 'g' : 'gi');
    }
  } catch {
    return [];
  }

  const includeMatcher = options.include ? globToRegExp(options.include) : null;
  const files = flattenFiles(buildTree(root));
  const hits: SearchHit[] = [];

  for (const file of files) {
    if (hits.length >= maxResults) break;
    if (includeMatcher && !includeMatcher.test(file)) continue;
    if (isBinary(file)) continue;
    const abs = safeResolve(root, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.size > 1_500_000) continue;

    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      matcher.lastIndex = 0;
      const match = matcher.exec(lines[i]);
      if (!match) continue;
      const hit: SearchHit = {
        path: file,
        line: i + 1,
        column: match.index + 1,
        preview: lines[i].trim().slice(0, 240),
      };
      if (before || after) {
        const context: string[] = [];
        for (let j = Math.max(0, i - before); j <= Math.min(lines.length - 1, i + after); j += 1) {
          if (j === i) continue;
          context.push(`${String(j + 1).padStart(5, ' ')}| ${lines[j].slice(0, 240)}`);
        }
        hit.context = context;
      }
      hits.push(hit);
      if (hits.length >= maxResults) break;
    }
  }
  return hits;
}

export interface QuickOpenEntry {
  path: string;
  score: number;
}

export function quickOpen(root: string, query: string, limit = 40): QuickOpenEntry[] {
  const files = flattenFiles(buildTree(root));
  return files
    .map((file) => ({ path: file, score: fuzzyScore(query, file) }))
    .filter((e) => e.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function listFiles(root: string, limit = 2000): string[] {
  return flattenFiles(buildTree(root)).slice(0, limit);
}

export interface GlobMatch {
  path: string;
  modified: number;
  size: number;
}

/**
 * bare filename, so a pattern like *.test.ts matches test files at any depth.
 */
export function globSearch(root: string, pattern: string, limit = 100): GlobMatch[] {
  const normalized = pattern.replace(/\\/g, '/').trim();
  if (!normalized) return [];
  const matcher = globToRegExp(normalized);
  const bareMatcher = normalized.includes('/') ? null : globToRegExp(normalized);
  const files = flattenFiles(buildTree(root));

  const matches: GlobMatch[] = [];
  for (const file of files) {
    const name = file.split('/').pop() ?? file;
    if (!matcher.test(file) && !bareMatcher?.test(name)) continue;
    const abs = safeResolve(root, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    matches.push({ path: file, modified: stat.mtimeMs, size: stat.size });
  }
  return matches.sort((a, b) => b.modified - a.modified).slice(0, limit);
}
