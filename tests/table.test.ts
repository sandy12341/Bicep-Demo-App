import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { TableClient } from '@azure/data-tables';
import { TableIncidentStore, initializeTable } from '../src/table-store.js';
import { DomainError, IncidentLimitError, presentIncident, type IncidentInput } from '../src/store.js';

const input: IncidentInput = { schoolId: 'north', assetTag: 'DEMO-TEST', deviceType: 'chromebook', category: 'power' };
const integration = { skip: !process.env.AZURITE_CONNECTION_STRING };
async function withTable(run: (client: TableClient, store: TableIncidentStore) => Promise<void>) {
  const client = TableClient.fromConnectionString(process.env.AZURITE_CONNECTION_STRING!, `edu${randomUUID().replaceAll('-', '')}`, { allowInsecureConnection: true });
  await client.createTable();
  try { await run(client, new TableIncidentStore(client)); } finally { await client.deleteTable(); }
}
function assertConflict(results: PromiseSettledResult<unknown>[]) {
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failure = results.find((result) => result.status === 'rejected');
  assert.ok(failure?.status === 'rejected' && failure.reason instanceof DomainError && failure.reason.statusCode === 409);
}

test('Table atomic seed, lifecycle, persistence, cap and no seed resurrection', integration, async () => {
  await withTable(async (client, store) => {
    await Promise.all([initializeTable(client), initializeTable(client)]);
    await store.check();
    assert.equal((await store.list()).length, 5);
    assert.equal((await store.loaners()).length, 6);
    const incident = await store.create(input);
    await store.update(incident.id, 'in-repair');
    await store.update(incident.id, 'resolved');
    await initializeTable(client);
    const restarted = new TableIncidentStore(client);
    assert.equal((await restarted.list()).find((item) => item.id === incident.id)?.status, 'resolved');
    await restarted.delete(incident.id);
    await assert.rejects(() => store.delete(incident.id), (error) => error instanceof DomainError && error.statusCode === 404);
    for (let i = 5; i < 99; i++) await store.create({ ...input, assetTag: `DEMO-${i}` });
    const outcomes = await Promise.allSettled([store.create(input), restarted.create(input)]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const failure = outcomes.find((result) => result.status === 'rejected');
    assert.ok(failure?.status === 'rejected' && failure.reason instanceof IncidentLimitError);
    assert.equal((await store.list()).length, 100);
    await store.delete('10000000-0000-4000-8000-000000000001');
    await initializeTable(client);
    assert.equal((await store.list()).length, 99);
  });
});

test('Table exclusive assignment, reciprocal persistence, guarded resolution/delete and return', integration, async () => {
  await withTable(async (client, store) => {
    await initializeTable(client);
    const incidents = await store.list();
    const loaner = (await store.loaners()).find((item) => item.deviceType === 'chromebook')!;
    const ids = incidents.filter((item) => item.deviceType === 'chromebook' && item.status === 'open').map((item) => item.id);
    assertConflict(await Promise.allSettled([store.assign(ids[0], loaner.id), new TableIncidentStore(client).assign(ids[1], loaner.id)]));
    const assigned = (await store.list()).filter((item) => item.loanerId === loaner.id);
    assert.equal(assigned.length, 1);
    const id = assigned[0].id;
    assert.equal((await store.loaners()).find((item) => item.id === loaner.id)?.incidentId, id);
    await store.update(id, 'in-repair');
    await assert.rejects(() => store.update(id, 'resolved'), DomainError);
    await assert.rejects(() => store.delete(id), DomainError);
    assert.equal((await new TableIncidentStore(client).list()).find((item) => item.id === id)?.loanerId, loaner.id);
    await store.returnLoaner(id);
    assert.equal((await store.loaners()).find((item) => item.id === loaner.id)?.incidentId, '');
    await store.update(id, 'resolved');
    await store.update(id, 'open');
    await store.assign(ids.find((other) => other !== id)!, loaner.id);
  });
});

test('Table assignment races with resolution and deletion cannot orphan a loaner', integration, async () => {
  for (const operation of ['resolve', 'delete'] as const) {
    await withTable(async (client, store) => {
      await initializeTable(client);
      const incident = await store.create(input);
      await store.update(incident.id, 'in-repair');
      const loaner = (await store.loaners()).find((item) => item.deviceType === 'chromebook')!;
      const other = new TableIncidentStore(client);
      const results = await Promise.allSettled([
        store.assign(incident.id, loaner.id),
        operation === 'resolve' ? other.update(incident.id, 'resolved') : other.delete(incident.id),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const saved = (await store.list()).find((item) => item.id === incident.id);
      const inventory = (await store.loaners()).find((item) => item.id === loaner.id)!;
      if (inventory.incidentId) {
        assert.equal(inventory.incidentId, saved?.id);
        assert.equal(saved?.loanerId, loaner.id);
        assert.equal(saved?.status, 'in-repair');
      } else {
        assert.ok(!saved || saved.status === 'resolved');
        assert.ok(!saved?.loanerId);
      }
    });
  }
});

test('legacy schema and missing-marker data are rejected without modifications', integration, async () => {
  await withTable(async (client) => {
    await client.createEntity({ partitionKey: 'board', rowKey: '!metadata', count: 5, seedVersion: 1 });
    const before = await client.getEntity('board', '!metadata');
    await assert.rejects(() => initializeTable(client), /fresh Classroom Ready/);
    assert.deepEqual(await client.getEntity('board', '!metadata'), before);
  });
  await withTable(async (client) => {
    await client.createEntity({ partitionKey: 'board', rowKey: 'legacy', title: 'Preserve me' });
    await assert.rejects(() => initializeTable(client), /nonempty table/);
    assert.equal((await client.getEntity('board', 'legacy')).title, 'Preserve me');
  });
});

test('priority projection never writes existing Table rows or timestamps', integration, async () => {
  await withTable(async (client, store) => {
    await initializeTable(client);
    const incident = await store.create(input);
    const rowKey = `incident:${incident.id}`;
    const before = await client.getEntity('board', rowKey);
    for (const item of await store.list()) presentIncident(item);
    assert.deepEqual(await client.getEntity('board', rowKey), before);
    assert.ok(!('priority' in before));
  });
});
