import { randomUUID } from 'node:crypto';
import { TableClient, odata, type TableEntityResult, type TransactionAction } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { sampleTasks, TaskLimitError, type Task, type TaskStore } from './store.js';

const partitionKey = 'board';
const metadataKey = '!metadata';
type StoredTask = Omit<Task, 'id'>;

function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

function toTask(row: TableEntityResult<StoredTask>): Task {
  if (!row.rowKey || typeof row.title !== 'string' || typeof row.completed !== 'boolean'
    || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string') {
    throw new Error('Stored task has an invalid shape.');
  }
  return { id: row.rowKey, title: row.title, completed: row.completed, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function productionTableClient(): TableClient {
  const endpoint = process.env.TABLE_STORAGE_ENDPOINT;
  const table = process.env.TABLE_NAME;
  if (!endpoint || !table) throw new Error('TABLE_STORAGE_ENDPOINT and TABLE_NAME are required.');
  if (new URL(endpoint).protocol !== 'https:') throw new Error('Production Table Storage requires HTTPS.');
  return new TableClient(endpoint, table, new DefaultAzureCredential(), { retryOptions: { maxRetries: 3 } });
}

export async function initializeTable(client: TableClient): Promise<void> {
  const entities = sampleTasks().map(({ id, ...task }) => ({ partitionKey, rowKey: id, ...task }));
  const actions: TransactionAction[] = [
    ['create', { partitionKey, rowKey: metadataKey, count: entities.length, seedVersion: 1 }],
    ...entities.map((entity): TransactionAction => ['create', entity]),
  ];
  try {
    // One atomic batch initializes both seed marker and samples; redeploy never resurrects deleted tasks.
    await client.submitTransaction(actions);
  } catch (error) {
    if (status(error) !== 409) throw error;
    const metadata = await client.getEntity<{ count: number; seedVersion: number }>(partitionKey, metadataKey);
    if (metadata.seedVersion !== 1 || typeof metadata.count !== 'number') {
      throw new Error('Table initialization metadata is invalid.');
    }
  }
}

export class TableTaskStore implements TaskStore {
  constructor(private readonly client: TableClient = productionTableClient()) {}

  async list(): Promise<Task[]> {
    const tasks: Task[] = [];
    for await (const entity of this.client.listEntities<StoredTask>({
      queryOptions: { filter: odata`PartitionKey eq ${partitionKey} and RowKey ne ${metadataKey}` },
    })) {
      if (tasks.length >= 100) throw new Error('Task table exceeds the supported demo limit.');
      tasks.push(toTask(entity));
    }
    return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try { return await operation(); } catch (error) {
        if (status(error) !== 412 || attempt === 7) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw new Error('Storage concurrency retry limit exceeded.');
  }

  async create(title: string): Promise<Task> {
    return this.mutate(async () => {
      const metadata = await this.client.getEntity<{ count: number }>(partitionKey, metadataKey);
      if (!Number.isInteger(metadata.count) || metadata.count < 0) throw new Error('Invalid task count.');
      if (metadata.count >= 100) throw new TaskLimitError();
      const now = new Date().toISOString();
      const task: Task = { id: randomUUID(), title, completed: false, createdAt: now, updatedAt: now };
      const { id, ...properties } = task;
      await this.client.submitTransaction([
        ['update', { partitionKey, rowKey: metadataKey, count: metadata.count + 1 }, 'Merge', { etag: metadata.etag }],
        ['create', { partitionKey, rowKey: id, ...properties }],
      ]);
      return task;
    });
  }

  async update(id: string, completed: boolean): Promise<Task | null> {
    return this.mutate(async () => {
      try {
        const row = await this.client.getEntity<StoredTask>(partitionKey, id);
        const updated = { ...row, partitionKey, rowKey: id, completed, updatedAt: new Date().toISOString() };
        await this.client.updateEntity(updated, 'Merge', { etag: row.etag });
        return toTask(updated);
      } catch (error) {
        if (status(error) === 404) return null;
        throw error;
      }
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.mutate(async () => {
      try {
        const metadata = await this.client.getEntity<{ count: number }>(partitionKey, metadataKey);
        await this.client.getEntity(partitionKey, id);
        if (!Number.isInteger(metadata.count) || metadata.count < 1) throw new Error('Invalid task count.');
        await this.client.submitTransaction([
          ['update', { partitionKey, rowKey: metadataKey, count: metadata.count - 1 }, 'Merge', { etag: metadata.etag }],
          ['delete', { partitionKey, rowKey: id }],
        ]);
        return true;
      } catch (error) {
        if (status(error) === 404) return false;
        throw error;
      }
    });
  }

  async check(): Promise<void> {
    const metadata = await this.client.getEntity<{ seedVersion: number }>(partitionKey, metadataKey);
    if (metadata.seedVersion !== 1) throw new Error('Sample data has not been initialized.');
  }

  async close(): Promise<void> { /* Azure SDK HTTP connections need no application shutdown call. */ }
}
