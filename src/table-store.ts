import { TableClient, odata, type TableEntityResult, type TransactionAction } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import {
  assertAssignment, assertTransition, assertUnassigned, DomainError, IncidentLimitError,
  deviceTypes, incidentStatuses, isId, isOneOf, newIncident, parseIncidentInput, sampleIncidents, sampleLoaners,
  type Incident, type IncidentInput, type IncidentStatus, type IncidentStore, type Loaner,
} from './store.js';

const partitionKey = 'board';
const metadataKey = '!metadata';
const schemaVersion = 2;
type StoredIncident = Omit<Incident, 'id'>;
type StoredLoaner = Omit<Loaner, 'id'>;
type Metadata = { count: number; seedVersion: number };
function status(error: unknown): number | undefined {
  if (typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}
function toIncident(row: TableEntityResult<StoredIncident>): Incident {
  if (!row.rowKey?.startsWith('incident:') || !isId(row.rowKey.slice(9)) || !isOneOf(incidentStatuses, row.status)
    || typeof row.loanerId !== 'string' || (row.loanerId !== '' && !isId(row.loanerId))
    || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string') throw new Error('Stored incident has an invalid shape.');
  let input: IncidentInput;
  try {
    input = parseIncidentInput({ schoolId: row.schoolId, assetTag: row.assetTag, deviceType: row.deviceType, category: row.category });
  } catch (error) {
    if (error instanceof DomainError) throw new Error('Stored incident contains invalid catalog fields.');
    throw error;
  }
  return { ...input, id: row.rowKey.slice(9), status: row.status, loanerId: row.loanerId, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function toLoaner(row: TableEntityResult<StoredLoaner>): Loaner {
  if (!row.rowKey?.startsWith('loaner:') || !isId(row.rowKey.slice(7)) || !isOneOf(deviceTypes, row.deviceType)
    || typeof row.assetTag !== 'string' || !/^DEMO-[A-Z0-9-]{1,20}$/.test(row.assetTag)
    || typeof row.incidentId !== 'string' || (row.incidentId !== '' && !isId(row.incidentId))) throw new Error('Stored loaner has an invalid shape.');
  return { id: row.rowKey.slice(7), assetTag: row.assetTag, deviceType: row.deviceType, incidentId: row.incidentId };
}
function assertMetadata(row: Metadata): void {
  if (row.seedVersion !== schemaVersion || !Number.isInteger(row.count) || row.count < 0 || row.count > 100) {
    throw new Error('Incompatible or invalid table metadata. Use a fresh Classroom Ready instance; the old task board must remain untouched.');
  }
}
export function productionTableClient(): TableClient {
  const endpoint = process.env.TABLE_STORAGE_ENDPOINT;
  const table = process.env.TABLE_NAME;
  if (!endpoint || !table) throw new Error('TABLE_STORAGE_ENDPOINT and TABLE_NAME are required.');
  if (new URL(endpoint).protocol !== 'https:') throw new Error('Production Table Storage requires HTTPS.');
  return new TableClient(endpoint, table, new DefaultAzureCredential(), { retryOptions: { maxRetries: 3 } });
}
export async function initializeTable(client: TableClient): Promise<void> {
  try {
    assertMetadata(await client.getEntity<Metadata>(partitionKey, metadataKey));
    return;
  } catch (error) { if (status(error) !== 404) throw error; }
  for await (const row of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${partitionKey}` } })) {
    if (row.partitionKey !== partitionKey) throw new Error('Table query returned an unexpected partition.');
    // Another initializer may have committed after our first metadata read.
    try { assertMetadata(await client.getEntity<Metadata>(partitionKey, metadataKey)); return; } catch (error) {
      if (status(error) !== 404) throw error;
      throw new Error('Refusing to seed a nonempty table without valid Classroom Ready metadata.');
    }
  }
  const incidents = sampleIncidents().map(({ id, ...incident }) => ({ partitionKey, rowKey: `incident:${id}`, ...incident }));
  const loaners = sampleLoaners().map(({ id, ...loaner }) => ({ partitionKey, rowKey: `loaner:${id}`, ...loaner }));
  const actions: TransactionAction[] = [
    ['create', { partitionKey, rowKey: metadataKey, count: incidents.length, seedVersion: schemaVersion }],
    ...[...incidents, ...loaners].map((row): TransactionAction => ['create', row]),
  ];
  try { await client.submitTransaction(actions); } catch (error) {
    if (status(error) !== 409) throw error;
    assertMetadata(await client.getEntity<Metadata>(partitionKey, metadataKey));
  }
}
export class TableIncidentStore implements IncidentStore {
  constructor(private readonly client: TableClient = productionTableClient()) {}
  async initialize(): Promise<void> {
    for (let attempt = 1; attempt <= 8; attempt++) {
      try { await initializeTable(this.client); console.log(JSON.stringify({ event: 'table_initialized' })); return; } catch (error) {
        console.error(JSON.stringify({ event: 'table_initialization_failed', attempt, name: error instanceof Error ? error.name : 'Unknown', statusCode: status(error) }));
        if (attempt === 8 || status(error) === undefined) throw error;
        await new Promise((resolve) => setTimeout(resolve, 15_000));
      }
    }
  }
  async list(): Promise<Incident[]> {
    const incidents: Incident[] = [];
    for await (const row of this.client.listEntities<StoredIncident>({
      queryOptions: { filter: odata`PartitionKey eq ${partitionKey} and RowKey ge ${'incident:'} and RowKey lt ${'incident;'}` },
    })) {
      if (incidents.length >= 100) throw new Error('Incident table exceeds the demo limit.');
      incidents.push(toIncident(row));
    }
    return incidents.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  async loaners(): Promise<Loaner[]> {
    const loaners: Loaner[] = [];
    for await (const row of this.client.listEntities<StoredLoaner>({
      queryOptions: { filter: odata`PartitionKey eq ${partitionKey} and RowKey ge ${'loaner:'} and RowKey lt ${'loaner;'}` },
    })) {
      if (loaners.length >= 6) throw new Error('Loaner inventory exceeds the demo limit.');
      loaners.push(toLoaner(row));
    }
    return loaners;
  }
  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try { return await operation(); } catch (error) {
        if (status(error) === 404) throw new DomainError('The record no longer exists. Refresh and try again.', 404);
        if (status(error) !== 412) throw error;
        if (attempt === 7) throw new DomainError('Another request changed this record. Refresh and try again.', 409);
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw new Error('Storage concurrency retry limit exceeded.');
  }
  private async incidentRow(id: string) {
    try { return await this.client.getEntity<StoredIncident>(partitionKey, `incident:${id}`); } catch (error) {
      if (status(error) === 404) throw new DomainError('Incident not found.', 404);
      throw error;
    }
  }
  private async loanerRow(id: string) {
    try { return await this.client.getEntity<StoredLoaner>(partitionKey, `loaner:${id}`); } catch (error) {
      if (status(error) === 404) throw new DomainError('Loaner not found.', 404);
      throw error;
    }
  }
  async create(input: IncidentInput): Promise<Incident> {
    const validated = parseIncidentInput(input);
    return this.mutate(async () => {
      const metadata = await this.client.getEntity<Metadata>(partitionKey, metadataKey);
      assertMetadata(metadata);
      if (metadata.count >= 100) throw new IncidentLimitError();
      const incident = newIncident(validated);
      const { id, ...properties } = incident;
      await this.client.submitTransaction([
        ['update', { partitionKey, rowKey: metadataKey, count: metadata.count + 1 }, 'Merge', { etag: metadata.etag }],
        ['create', { partitionKey, rowKey: `incident:${id}`, ...properties }],
      ]);
      return incident;
    });
  }
  async update(id: string, next: IncidentStatus): Promise<Incident> {
    return this.mutate(async () => {
      const row = await this.incidentRow(id);
      const incident = toIncident(row);
      assertTransition(incident, next);
      const updated = { ...row, partitionKey, rowKey: `incident:${id}`, status: next, updatedAt: new Date().toISOString() };
      await this.client.updateEntity(updated, 'Merge', { etag: row.etag });
      return toIncident(updated);
    });
  }
  async assign(id: string, loanerId: string): Promise<Incident> {
    return this.mutate(async () => {
      const metadata = await this.client.getEntity<Metadata>(partitionKey, metadataKey);
      assertMetadata(metadata);
      const row = await this.incidentRow(id);
      const loaner = await this.loanerRow(loanerId);
      assertAssignment(toIncident(row), toLoaner(loaner));
      const updated = { ...row, partitionKey, rowKey: `incident:${id}`, loanerId, updatedAt: new Date().toISOString() };
      await this.client.submitTransaction([
        ['update', { partitionKey, rowKey: metadataKey, count: metadata.count }, 'Merge', { etag: metadata.etag }],
        ['update', updated, 'Merge', { etag: row.etag }],
        ['update', { partitionKey, rowKey: `loaner:${loanerId}`, incidentId: id }, 'Merge', { etag: loaner.etag }],
      ]);
      return toIncident(updated);
    });
  }
  async returnLoaner(id: string): Promise<Incident> {
    return this.mutate(async () => {
      const row = await this.incidentRow(id);
      const incident = toIncident(row);
      if (!incident.loanerId) throw new DomainError('This incident has no loaner to return.', 409);
      const loaner = await this.loanerRow(incident.loanerId);
      if (toLoaner(loaner).incidentId !== id) throw new Error('Loaner assignment is inconsistent.');
      const updated = { ...row, partitionKey, rowKey: `incident:${id}`, loanerId: '', updatedAt: new Date().toISOString() };
      await this.client.submitTransaction([
        ['update', updated, 'Merge', { etag: row.etag }],
        ['update', { partitionKey, rowKey: `loaner:${incident.loanerId}`, incidentId: '' }, 'Merge', { etag: loaner.etag }],
      ]);
      return toIncident(updated);
    });
  }
  async delete(id: string): Promise<void> {
    return this.mutate(async () => {
      // The SDK's batch delete is unconditional. Read metadata before the incident:
      // assignment also updates metadata, so a stale unassigned read cannot delete an assigned row.
      const metadata = await this.client.getEntity<Metadata>(partitionKey, metadataKey);
      assertMetadata(metadata);
      const row = await this.incidentRow(id);
      assertUnassigned(toIncident(row));
      if (metadata.count < 1) throw new Error('Invalid incident count.');
      await this.client.submitTransaction([
        ['update', { partitionKey, rowKey: metadataKey, count: metadata.count - 1 }, 'Merge', { etag: metadata.etag }],
        ['delete', { partitionKey, rowKey: `incident:${id}` }],
      ]);
    });
  }
  async check(): Promise<void> { assertMetadata(await this.client.getEntity<Metadata>(partitionKey, metadataKey)); }
  async close(): Promise<void> { /* Azure SDK connections need no application shutdown call. */ }
}
