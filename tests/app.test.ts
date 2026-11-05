import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MemoryTaskStore, TaskLimitError } from '../src/store.js';

const options = { title: 'Test Board', commit: 'abc123', integrationSecret: 'fake-test-value', localDemo: true };

test('UI, liveness, readiness and sanitized release info', async () => {
  const app = createApp(new MemoryTaskStore(), options);
  await request(app).get('/').expect(200).expect('Content-Type', /html/);
  await request(app).get('/healthz').expect(200, { status: 'ok' });
  await request(app).get('/readyz').expect(200);
  const info = await request(app).get('/api/info').expect(200);
  assert.equal(info.body.commit, 'abc123');
  assert.equal(info.body.secretConfigured, true);
  assert.ok(!JSON.stringify(info.body).includes('fake-test-value'));
});

test('CRUD persists, and validates title, ID and completion flag', async () => {
  const app = createApp(new MemoryTaskStore(), options);
  assert.equal((await request(app).get('/api/tasks')).body.length, 5);
  const created = await request(app).post('/api/tasks').send({ title: " O'Brien <script>literal</script> " }).expect(201);
  assert.equal(created.body.title, "O'Brien <script>literal</script>");
  await request(app).patch(`/api/tasks/${created.body.id}`).send({ completed: true }).expect(200)
    .expect((res) => { assert.equal(res.body.completed, true); });
  await request(app).patch(`/api/tasks/${created.body.id}`).send({ completed: 'true' }).expect(400);
  await request(app).delete(`/api/tasks/${created.body.id}`).expect(204);
  await request(app).delete(`/api/tasks/${created.body.id}`).expect(404);
  await request(app).patch('/api/tasks/bad-id').send({ completed: false }).expect(400);
  for (const title of ['', '   ', 42, 'x'.repeat(121)]) {
    await request(app).post('/api/tasks').send({ title }).expect(400);
  }
  await request(app).post('/api/tasks').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/tasks').send({ title: 'x'.repeat(9000) }).expect(413);
});

test('unresolved or missing Key Vault references fail readiness', async () => {
  for (const integrationSecret of ['', '@Microsoft.KeyVault(SecretUri=https://example/secrets/test/)']) {
    const app = createApp(new MemoryTaskStore(), { ...options, localDemo: false, integrationSecret });
    await request(app).get('/readyz').expect(503);
    const info = await request(app).get('/api/info').expect(200);
    assert.equal(info.body.secretConfigured, false);
  }
});

test('dependency failures are explicit and sanitized; cap returns conflict', async () => {
  const store = new MemoryTaskStore();
  store.check = async () => { throw new Error('secret-in-error'); };
  store.list = async () => { throw new Error('secret-in-error'); };
  store.create = async () => { throw new TaskLimitError(); };
  const app = createApp(store, options);
  await request(app).get('/readyz').expect(503);
  const failed = await request(app).get('/api/tasks').expect(500);
  assert.ok(!JSON.stringify(failed.body).includes('secret-in-error'));
  await request(app).post('/api/tasks').send({ title: 'limit' }).expect(409);
});

test('memory mode enforces the task cap', async () => {
  const store = new MemoryTaskStore();
  for (let i = 5; i < 100; i++) await store.create(`Task ${i}`);
  await assert.rejects(() => store.create('over cap'), TaskLimitError);
});
