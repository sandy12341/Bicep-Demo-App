import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { DomainError, MemoryIncidentStore } from '../src/store.js';

function powershell(args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('pwsh', ['-NoProfile', '-NonInteractive', ...args], { timeout: 60_000 });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

test('PowerShell workload guard rejects legacy groups before mutation (mocked ARM)', async () => {
  const result = await powershell(['-Command', `
    . ./scripts/Common.ps1
    function Invoke-Az { '{"tags":{"demo":"bicep-taskboard","instance":"tbcore1"}}' }
    try {
      Assert-OwnedGroup '00000000-0000-0000-0000-000000000000' 'rg-taskboard-demo'
      throw 'Legacy group was accepted.'
    } catch {
      if ($_.Exception.Message -notmatch 'legacy/non-EDU') { throw }
    }
    function Invoke-Az { '{"tags":{"demo":"bicep-taskboard","instance":"educr1","workload":"classroom-ready"}}' }
    $null = Assert-OwnedGroup '00000000-0000-0000-0000-000000000000' 'rg-classroomready-demo'
  `]);
  assert.equal(result.code, 0, result.output);
});

test('PowerShell smoke contract cleans up only its own incident and loaner on success/failure', async () => {
  for (const failure of [false, true]) {
    const store = new MemoryIncidentStore();
    const incidents = await store.list();
    const loaners = await store.loaners();
    if (failure) {
      const assign = store.assign.bind(store);
      store.assign = async (id, loanerId) => {
        await assign(id, loanerId);
        throw new DomainError('Simulated failure after assignment persisted.', 409);
      };
    }
    // Production-shaped readiness/info exercises the script contract, not Azure identity or connectivity.
    const app = createApp(store, { title: 'Smoke harness', commit: 'script-test', integrationSecret: 'synthetic', localDemo: false });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const result = await powershell(['-File', './scripts/Smoke.ps1', '-AppUrl', `http://127.0.0.1:${address.port}`, '-ExpectedCommit', 'script-test']);
      if (failure) {
        assert.notEqual(result.code, 0);
        assert.match(result.output, /Simulated failure/);
      } else {
        assert.equal(result.code, 0, result.output);
        assert.match(result.output, /checks passed/);
      }
      assert.deepEqual(await store.list(), incidents);
      assert.deepEqual(await store.loaners(), loaners);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});
