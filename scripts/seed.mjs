import { TableClient } from '@azure/data-tables';
import { AzureCliCredential } from '@azure/identity';
import { initializeTable } from '../dist/table-store.js';

if (!process.env.TABLE_STORAGE_ENDPOINT || !process.env.TABLE_NAME) {
  throw new Error('TABLE_STORAGE_ENDPOINT and TABLE_NAME are required.');
}
const client = new TableClient(process.env.TABLE_STORAGE_ENDPOINT, process.env.TABLE_NAME, new AzureCliCredential());
await initializeTable(client);
console.log(JSON.stringify({ event: 'table_initialized' }));
