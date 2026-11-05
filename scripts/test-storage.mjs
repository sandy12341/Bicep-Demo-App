import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', () => reject(new Error('Port 10002 is occupied; refusing to reuse or stop an existing service.')));
  server.listen(10002, '127.0.0.1', () => server.close(resolve));
});
const directory = await mkdtemp(join(tmpdir(), 'taskboard-azurite-'));
const emulator = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/azurite/dist/src/table/main.js', import.meta.url)),
  '--tableHost', '127.0.0.1', '--tablePort', '10002', '--location', directory, '--silent', '--skipApiVersionCheck', '--disableTelemetry',
], { stdio: 'inherit' });
let exited = false;
emulator.once('exit', () => { exited = true; });
const stopped = once(emulator, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    if (exited) throw new Error('Azurite exited before readiness.');
    ready = await new Promise((resolve) => {
      const socket = createConnection({ port: 10002, host: '127.0.0.1' });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Azurite did not become ready.');
  const runner = spawn(process.execPath, ['--import', 'tsx', '--test', 'tests/table.test.ts'], {
    stdio: 'inherit', env: { ...process.env, AZURITE_CONNECTION_STRING: 'UseDevelopmentStorage=true' },
  });
  const [code] = await once(runner, 'exit');
  process.exitCode = code ?? 1;
} finally {
  if (!exited) emulator.kill();
  await stopped;
  await rm(directory, { recursive: true, force: true });
}
