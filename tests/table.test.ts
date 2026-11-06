import assert from 'node:assert/strict';
import test from 'node:test';
import { TableClient } from '@azure/data-tables';
import { TableTaskStore, initializeTable } from '../src/table-store.js';
import { TaskLimitError } from '../src/store.js';

test('Table Storage atomic seed, CRUD, restart, concurrency and no reseed', { skip: !process.env.AZURITE_CONNECTION_STRING }, async () => {
  const name = `tasks${Date.now()}`;
  const client = TableClient.fromConnectionString(process.env.AZURITE_CONNECTION_STRING!, name, { allowInsecureConnection: true });
  await client.createTable();
  try {
    await Promise.all([initializeTable(client), initializeTable(client)]);
    const store = new TableTaskStore(client);
    await store.initialize();
    assert.equal((await store.list()).length, 5);
    await store.check();
    const created = await store.create("O'Brien <script>literal</script>");
    assert.equal((await store.update(created.id, true))?.completed, true);
    await initializeTable(client);
    assert.equal((await new TableTaskStore(client).list()).length, 6);
    assert.equal((await store.list()).find((task) => task.id === created.id)?.completed, true);
    assert.equal(await store.delete(created.id), true);
    assert.equal(await store.delete(created.id), false);
    assert.equal(await store.update(created.id, false), null);
    for (let i = 5; i < 99; i++) await store.create(`capacity ${i}`);
    const outcomes = await Promise.allSettled([store.create('last one'), store.create('over cap')]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const failure = outcomes.find((result) => result.status === 'rejected');
    assert.ok(failure?.status === 'rejected' && failure.reason instanceof TaskLimitError);
    assert.equal((await store.list()).length, 100);
    await store.delete('10000000-0000-4000-8000-000000000001');
    await new TableTaskStore(client).initialize();
    assert.equal((await store.list()).length, 99);
  } finally { await client.deleteTable(); }
});
