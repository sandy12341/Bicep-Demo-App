import { createApp } from './app.js';
import { MemoryIncidentStore } from './store.js';
import { TableIncidentStore } from './table-store.js';

const localDemo = process.env.DEMO_MODE === 'true';
if (localDemo && process.env.WEBSITE_SITE_NAME) throw new Error('In-memory DEMO_MODE is not allowed in Azure.');
const store = localDemo ? new MemoryIncidentStore() : new TableIncidentStore();
if (store instanceof TableIncidentStore) {
  try { await store.initialize(); } catch (error) {
    console.error(JSON.stringify({ event: 'startup_failed', name: error instanceof Error ? error.name : 'Unknown' }));
    process.exit(1);
  }
}
const app = createApp(store, {
  title: process.env.APP_TITLE ?? 'Classroom Ready',
  commit: process.env.APP_COMMIT ?? 'local',
  integrationSecret: process.env.DEMO_INTEGRATION_SECRET ?? (localDemo ? 'local-placeholder' : ''),
  localDemo,
});
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
const server = app.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'listening', port, localDemo }));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close().catch((error: unknown) => {
        console.error(JSON.stringify({ event: 'shutdown_failed', name: error instanceof Error ? error.name : 'Unknown' }));
        process.exitCode = 1;
      });
    });
  });
}
