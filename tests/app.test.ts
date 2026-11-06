import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  DomainError, IncidentLimitError, MemoryIncidentStore, presentIncident, sampleIncidents,
  type IncidentInput,
} from '../src/store.js';

const options = { title: 'Classroom Ready', commit: 'abc123', integrationSecret: 'fake-test-value', localDemo: true };
const input: IncidentInput = { schoolId: 'north', assetTag: 'DEMO-TEST-1', deviceType: 'chromebook', category: 'power' };

test('UI, catalog, health and sanitized release info', async () => {
  const app = createApp(new MemoryIncidentStore(), options);
  await request(app).get('/').expect(200).expect('Content-Type', /html/);
  await request(app).get('/healthz').expect(200, { status: 'ok' });
  await request(app).get('/readyz').expect(200);
  const info = await request(app).get('/api/info').expect(200);
  assert.equal(info.body.commit, 'abc123');
  assert.ok(!JSON.stringify(info.body).includes('fake-test-value'));
  assert.equal((await request(app).get('/api/catalog').expect(200)).body.schools.length, 3);
  await request(app).get('/api/tasks').expect(404);
});

test('structured incident validation, lifecycle, deletion and API response consistency', async () => {
  const app = createApp(new MemoryIncidentStore(), options);
  const initial = (await request(app).get('/api/incidents').expect(200)).body;
  assert.equal(initial.length, 5);
  const created = (await request(app).post('/api/incidents').send(input).expect(201)).body;
  assert.equal(created.assetTag, input.assetTag);
  assert.equal(created.status, 'open');
  assert.equal(created.priority, presentIncident(created).priority);
  await request(app).patch(`/api/incidents/${created.id}`).send({ status: 'resolved' }).expect(409);
  const repair = (await request(app).patch(`/api/incidents/${created.id}`).send({ status: 'in-repair' }).expect(200)).body;
  assert.equal(repair.priority, presentIncident(repair).priority);
  const resolved = (await request(app).patch(`/api/incidents/${created.id}`).send({ status: 'resolved' }).expect(200)).body;
  assert.equal(resolved.priority, 'standard');
  await request(app).patch(`/api/incidents/${created.id}`).send({ status: 'open' }).expect(200);
  await request(app).delete(`/api/incidents/${created.id}`).expect(204);
  await request(app).delete(`/api/incidents/${created.id}`).expect(404);
  for (const body of [
    {}, { ...input, schoolId: 'real-school' }, { ...input, deviceType: 'tablet' },
    { ...input, category: 'other' }, { ...input, studentId: 'not-accepted' },
    { ...input, assetTag: '<script>alert(1)</script>' }, { ...input, assetTag: 'DEMO-' },
    { ...input, assetTag: `DEMO-${'X'.repeat(21)}` },
  ]) await request(app).post('/api/incidents').send(body).expect(400);
  await request(app).patch('/api/incidents/bad-id').send({ status: 'open' }).expect(400);
  await request(app).patch(`/api/incidents/${initial[0].id}`).send({ status: 'invalid' }).expect(400);
  await request(app).patch(`/api/incidents/${initial[0].id}`).send({ status: 'in-repair', priority: 'urgent' }).expect(400);
  await request(app).post('/api/incidents').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/incidents').send({ ...input, assetTag: 'x'.repeat(9000) }).expect(413);
});

test('exclusive compatible assignment, return-before-resolution/deletion, and inventory availability', async () => {
  const store = new MemoryIncidentStore();
  const app = createApp(store, options);
  const incidents = await store.list();
  const loaners = await store.loaners();
  const id = incidents[0].id;
  await request(app).post(`/api/incidents/${id}/loaner`).send({ loanerId: loaners[3].id }).expect(409);
  await request(app).post(`/api/incidents/${id}/loaner`).send({ loanerId: 'bad' }).expect(400);
  await request(app).post(`/api/incidents/${id}/loaner`).send({ loanerId: loaners[0].id, extra: true }).expect(400);
  await request(app).post(`/api/incidents/${id}/loaner`).send({ loanerId: loaners[0].id }).expect(200);
  await request(app).post(`/api/incidents/${incidents[1].id}/loaner`).send({ loanerId: loaners[0].id }).expect(409);
  await request(app).patch(`/api/incidents/${id}`).send({ status: 'in-repair' }).expect(200);
  await request(app).patch(`/api/incidents/${id}`).send({ status: 'resolved' }).expect(409);
  await request(app).delete(`/api/incidents/${id}`).expect(409);
  assert.equal((await store.loaners()).filter((item) => !item.incidentId).length, 5);
  await request(app).delete(`/api/incidents/${id}/loaner`).expect(200);
  await request(app).delete(`/api/incidents/${id}/loaner`).expect(409);
  await request(app).patch(`/api/incidents/${id}`).send({ status: 'resolved' }).expect(200);
  await request(app).post(`/api/incidents/${id}/loaner`).send({ loanerId: loaners[0].id }).expect(409);
  assert.equal((await store.loaners()).filter((item) => !item.incidentId).length, 6);
});

test('concurrent memory assignments produce exactly one success and one conflict', async () => {
  const store = new MemoryIncidentStore();
  const incidents = await store.list();
  const loaner = (await store.loaners())[0];
  const results = await Promise.allSettled([store.assign(incidents[0].id, loaner.id), store.assign(incidents[1].id, loaner.id)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof DomainError && rejected.reason.statusCode === 409);
  const assigned = (await store.list()).filter((item) => item.loanerId === loaner.id);
  assert.equal(assigned.length, 1);
  assert.equal((await store.loaners())[0].incidentId, assigned[0].id);
});

test('priority projection excludes resolved incidents and never rewrites data', () => {
  const incidents = sampleIncidents();
  const before = JSON.stringify(incidents);
  for (const incident of incidents.filter((item) => item.status === 'resolved')) {
    assert.equal(presentIncident(incident).priority, 'standard');
  }
  assert.equal(JSON.stringify(incidents), before);
});

test('dependency failures are explicit and sanitized; missing secrets fail readiness', async () => {
  for (const integrationSecret of ['', '@Microsoft.KeyVault(SecretUri=https://example/secrets/test/)']) {
    await request(createApp(new MemoryIncidentStore(), { ...options, integrationSecret })).get('/readyz').expect(503);
  }
  const store = new MemoryIncidentStore();
  store.check = async () => { throw new Error('secret-in-error'); };
  store.list = async () => { throw new Error('secret-in-error'); };
  store.create = async () => { throw new IncidentLimitError(); };
  const app = createApp(store, options);
  await request(app).get('/readyz').expect(503);
  const failed = await request(app).get('/api/incidents').expect(500);
  assert.ok(!JSON.stringify(failed.body).includes('secret-in-error'));
  await request(app).post('/api/incidents').send(input).expect(409);
});

test('memory cap and missing-resource errors', async () => {
  const store = new MemoryIncidentStore();
  for (let i = 5; i < 100; i++) await store.create({ ...input, assetTag: `DEMO-${i}` });
  await assert.rejects(() => store.create(input), IncidentLimitError);
  await assert.rejects(() => store.update('30000000-0000-4000-8000-000000000001', 'in-repair'), DomainError);
});
