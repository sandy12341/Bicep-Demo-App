import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { TaskLimitError, type TaskStore } from './store.js';

export interface AppOptions {
  title: string;
  commit: string;
  integrationSecret: string;
  localDemo: boolean;
}

export function createApp(store: TaskStore, options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.WEBSITE_SITE_NAME) app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  const mutations = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  const secretConfigured = Boolean(options.integrationSecret.trim()) && !options.integrationSecret.startsWith('@Microsoft.KeyVault(');

  async function dependencyState() {
    let databaseConnected = false;
    try { await store.check(); databaseConnected = true; } catch (error) {
      console.error(JSON.stringify({ event: 'storage_readiness_failed', name: error instanceof Error ? error.name : 'Unknown' }));
    }
    return { databaseConnected, secretConfigured };
  }

  app.get('/healthz', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/readyz', async (_req, res) => {
    const state = await dependencyState();
    res.status(state.databaseConnected && state.secretConfigured ? 200 : 503)
      .json({ status: state.databaseConnected && state.secretConfigured ? 'ok' : 'unavailable' });
  });
  app.get('/api/info', async (_req, res) => {
    res.json({ title: options.title, commit: options.commit, localDemo: options.localDemo, ...(await dependencyState()) });
  });
  app.get('/api/tasks', async (_req, res) => { res.json(await store.list()); });
  app.post('/api/tasks', mutations, async (req, res) => {
    const title: unknown = req.body?.title;
    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 120) {
      res.status(400).json({ error: 'Enter a task title between 1 and 120 characters.' }); return;
    }
    res.status(201).json(await store.create(title.trim()));
  });
  app.use('/api/tasks/:id', (req, res, next) => {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid task ID.' }); return;
    }
    next();
  });
  app.patch('/api/tasks/:id', mutations, async (req, res) => {
    if (typeof req.params.id !== 'string') { res.status(400).json({ error: 'Invalid task ID.' }); return; }
    if (typeof req.body?.completed !== 'boolean') {
      res.status(400).json({ error: 'completed must be true or false.' }); return;
    }
    const task = await store.update(req.params.id, req.body.completed);
    if (!task) { res.status(404).json({ error: 'Task not found.' }); return; }
    res.json(task);
  });
  app.delete('/api/tasks/:id', mutations, async (req, res) => {
    if (typeof req.params.id !== 'string') { res.status(400).json({ error: 'Invalid task ID.' }); return; }
    if (!await store.delete(req.params.id)) { res.status(404).json({ error: 'Task not found.' }); return; }
    res.status(204).end();
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Endpoint not found.' }); });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { index: 'index.html' }));
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof TaskLimitError) { res.status(409).json({ error: error.message }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid JSON body.' }); return; }
    if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large.' }); return;
    }
    console.error(JSON.stringify({ event: 'request_failed', name: error instanceof Error ? error.name : 'Unknown' }));
    res.status(500).json({ error: 'The service could not complete this request. Please try again.' });
  };
  app.use(onError);
  return app;
}
