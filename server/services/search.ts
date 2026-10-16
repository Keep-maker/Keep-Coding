import fs from 'node:fs';
import path from 'node:path';
import { buildTree, flattenFiles, fuzzyScore, globToRegExp, isBinary, safeResolve, toPosix } from './workspace.js';

export interface SearchHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface SearchOptions {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  include?: string;
  maxResults?: number;
}

/** Ripgrep-style content search implemented in-process so there is no external binary dependency. */
export function searchContent(root: string, options: SearchOptions): SearchHit[] {
  const { query } = options;
  const maxResults = options.maxResults ?? 200;
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
      hits.push({
        path: file,
        line: i + 1,
        column: match.index + 1,
        preview: lines[i].trim().slice(0, 240),
      });
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
