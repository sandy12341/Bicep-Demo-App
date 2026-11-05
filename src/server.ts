import { createApp } from './app.js';
import { MemoryTaskStore } from './store.js';
import { TableTaskStore } from './table-store.js';

const localDemo = process.env.DEMO_MODE === 'true';
if (localDemo && process.env.WEBSITE_SITE_NAME) throw new Error('In-memory DEMO_MODE is not allowed in Azure.');
const store = localDemo ? new MemoryTaskStore() : new TableTaskStore();
const app = createApp(store, {
  title: process.env.APP_TITLE ?? 'Bicep Task Board',
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
