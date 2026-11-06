import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import {
  deviceTypes, DomainError, incidentStatuses, isId, isOneOf, issueCategories,
  parseIncidentInput, presentIncident, schools, type IncidentStore,
} from './store.js';

export interface AppOptions {
  title: string;
  commit: string;
  integrationSecret: string;
  localDemo: boolean;
}

export function createApp(store: IncidentStore, options: AppOptions) {
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
  app.get('/api/catalog', (_req, res) => { res.json({ schools, deviceTypes, issueCategories, incidentStatuses }); });
  app.get('/api/loaners', async (_req, res) => { res.json(await store.loaners()); });
  app.get('/api/incidents', async (_req, res) => { res.json((await store.list()).map(presentIncident)); });
  app.post('/api/incidents', mutations, async (req, res) => {
    res.status(201).json(presentIncident(await store.create(parseIncidentInput(req.body))));
  });
  app.use('/api/incidents/:id', (req, res, next) => {
    if (!isId(req.params.id)) {
      res.status(400).json({ error: 'Invalid incident ID.' }); return;
    }
    next();
  });
  app.patch('/api/incidents/:id', mutations, async (req, res) => {
    if (!isId(req.params.id)) throw new DomainError('Invalid incident ID.', 400);
    if (!isOneOf(incidentStatuses, req.body?.status) || Object.keys(req.body).length !== 1) {
      throw new DomainError('Supply only a valid incident status.', 400);
    }
    res.json(presentIncident(await store.update(req.params.id, req.body.status)));
  });
  app.post('/api/incidents/:id/loaner', mutations, async (req, res) => {
    if (!isId(req.params.id) || !isId(req.body?.loanerId) || Object.keys(req.body).length !== 1) {
      throw new DomainError('Supply only a valid incident and loaner ID.', 400);
    }
    res.json(presentIncident(await store.assign(req.params.id, req.body.loanerId)));
  });
  app.delete('/api/incidents/:id/loaner', mutations, async (req, res) => {
    if (!isId(req.params.id)) throw new DomainError('Invalid incident ID.', 400);
    res.json(presentIncident(await store.returnLoaner(req.params.id)));
  });
  app.delete('/api/incidents/:id', mutations, async (req, res) => {
    if (!isId(req.params.id)) throw new DomainError('Invalid incident ID.', 400);
    await store.delete(req.params.id);
    res.status(204).end();
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Endpoint not found.' }); });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { index: 'index.html' }));
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof DomainError) { res.status(error.statusCode).json({ error: error.message }); return; }
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
