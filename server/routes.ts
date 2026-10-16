import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, publicProviderInfo, writeStoredSettings, readStoredSettings } from './config.js';
import {
  buildTree, listDir, readFile, writeFile, safeResolve, languageFor, toPosix,
} from './services/workspace.js';
import { quickOpen, searchContent, listFiles } from './services/search.js';
import { complete } from './services/llm.js';
import { runCommand } from './services/shell.js';

/** Resolves the workspace root for a request, defaulting to the server default. */
function rootFrom(req: express.Request): string {
  const raw = typeof req.query.root === 'string' ? req.query.root : typeof req.body?.root === 'string' ? req.body.root : '';
  if (!raw) return config.defaultWorkspace;
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) throw new Error(`Workspace does not exist: ${resolved}`);
  return resolved;
}

function wrap(handler: (req: express.Request, res: express.Response) => Promise<unknown> | unknown) {
  return async (req: express.Request, res: express.Response) => {
    try {
      await handler(req, res);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  };
}

export function createRouter(): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      defaultWorkspace: config.defaultWorkspace,
      provider: publicProviderInfo(),
      platform: process.platform,
      node: process.version,
    });
  });

  router.get('/settings', (_req, res) => {
    const stored = readStoredSettings();
    res.json({ ...publicProviderInfo(), stored: { ...stored, apiKey: stored.apiKey ? '***' : undefined } });
  });

  router.post(
    '/settings',
    wrap((req, res) => {
      const { apiKey, baseUrl, model } = req.body ?? {};
      const patch: Record<string, string> = {};
      if (typeof apiKey === 'string' && apiKey.trim()) patch.apiKey = apiKey.trim();
      if (typeof baseUrl === 'string' && baseUrl.trim()) patch.baseUrl = baseUrl.trim();
      if (typeof model === 'string' && model.trim()) patch.model = model.trim();
      writeStoredSettings(patch);
      res.json(publicProviderInfo());
    }),
  );

  /** Validate the LLM connection without running a full agent turn. */
  router.post(
    '/settings/test',
    wrap(async (_req, res) => {
      const started = Date.now();
      const text = await complete([{ role: 'user', content: 'Reply with exactly: OK' }], 20);
      res.json({ ok: true, latencyMs: Date.now() - started, sample: text.trim().slice(0, 120) });
    }),
  );

  router.get(
    '/workspace/tree',
    wrap((req, res) => {
      const root = rootFrom(req);
      res.json({ root, tree: buildTree(root) });
    }),
  );

  router.get(
    '/workspace/files',
    wrap((req, res) => {
      const root = rootFrom(req);
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      res.json({ root, files: q ? quickOpen(root, q, 60) : listFiles(root, 2000).map((p: string) => ({ path: p, score: 0 })) });
    }),
  );

  router.get(
    '/workspace/file',
    wrap((req, res) => {
      const root = rootFrom(req);
      const rel = String(req.query.path ?? '');
      res.json(readFile(root, rel));
    }),
  );

  router.put(
    '/workspace/file',
    wrap((req, res) => {
      const root = rootFrom(req);
      const { path: rel, content } = req.body ?? {};
      const result = writeFile(root, String(rel), String(content ?? ''));
      res.json({ ...result, savedAt: Date.now() });
    }),
  );

  router.get(
    '/workspace/list',
    wrap((req, res) => {
      const root = rootFrom(req);
      res.json({ root, entries: listDir(root, String(req.query.path ?? '')) });
    }),
  );

  router.post(
    '/workspace/search',
    wrap((req, res) => {
      const root = rootFrom(req);
      const { query, isRegex, caseSensitive, include, maxResults } = req.body ?? {};
      const hits = searchContent(root, {
        query: String(query ?? ''),
        isRegex: Boolean(isRegex),
        caseSensitive: Boolean(caseSensitive),
        include: include ? String(include) : undefined,
        maxResults: Number.isFinite(maxResults) ? maxResults : 200,
      });
      res.json({ hits, total: hits.length });
    }),
  );

  /** Create a new file or folder from the Explorer. */
  router.post(
    '/workspace/create',
    wrap((req, res) => {
      const root = rootFrom(req);
      const { path: rel, type } = req.body ?? {};
      const abs = safeResolve(root, String(rel));
      if (fs.existsSync(abs)) throw new Error(`Already exists: ${rel}`);
      if (type === 'directory') {
        fs.mkdirSync(abs, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, '', 'utf8');
      }
      res.json({ path: toPosix(String(rel)), type, language: type === 'file' ? languageFor(String(rel)) : null });
    }),
  );

  router.post(
    '/workspace/rename',
    wrap((req, res) => {
      const root = rootFrom(req);
      const from = safeResolve(root, String(req.body?.from ?? ''));
      const to = safeResolve(root, String(req.body?.to ?? ''));
      if (!fs.existsSync(from)) throw new Error(`Not found: ${req.body?.from}`);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      res.json({ from: toPosix(String(req.body?.from)), to: toPosix(String(req.body?.to)) });
    }),
  );

  router.post(
    '/workspace/delete',
    wrap((req, res) => {
      const root = rootFrom(req);
      const rel = String(req.body?.path ?? '');
      const abs = safeResolve(root, rel);
      if (!rel) throw new Error('Refusing to delete the workspace root.');
      if (!fs.existsSync(abs)) throw new Error(`Not found: ${rel}`);
      fs.rmSync(abs, { recursive: true, force: true });
      res.json({ path: toPosix(rel), deleted: true });
    }),
  );

  /** Manual terminal used by the Editor Window's bottom panel. */
  router.post(
    '/terminal/run',
    wrap(async (req, res) => {
      const root = rootFrom(req);
      const command = String(req.body?.command ?? '');
      if (!command.trim()) throw new Error('command is required');
      const result = await runCommand(root, command);
      res.json(result);
    }),
  );

  return router;
}



