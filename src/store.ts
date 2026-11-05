import { randomUUID } from 'node:crypto';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStore {
  list(): Promise<Task[]>;
  create(title: string): Promise<Task>;
  update(id: string, completed: boolean): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
  check(): Promise<void>;
  close(): Promise<void>;
}

export class TaskLimitError extends Error {
  constructor() { super('The demo is limited to 100 tasks. Delete a task first.'); }
}

export function sampleTasks(): Task[] {
  const titles = [
    'Explore the Bicep modules',
    'Review an infrastructure what-if',
    'Ship a UI change through a pull request',
    'Verify passwordless Table Storage access',
    'Tear down the disposable environment',
  ];
  return titles.map((title, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title, completed: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }));
}

export class MemoryTaskStore implements TaskStore {
  private readonly tasks = new Map(sampleTasks().map((task) => [task.id, task]));
  async list() { return [...this.tasks.values()].map((task) => ({ ...task })); }
  async create(title: string) {
    if (this.tasks.size >= 100) throw new TaskLimitError();
    const now = new Date().toISOString();
    const task = { id: randomUUID(), title, completed: false, createdAt: now, updatedAt: now };
    this.tasks.set(task.id, task);
    return { ...task };
  }
  async update(id: string, completed: boolean) {
    const task = this.tasks.get(id);
    if (!task) return null;
    Object.assign(task, { completed, updatedAt: new Date().toISOString() });
    return { ...task };
  }
  async delete(id: string) { return this.tasks.delete(id); }
  async check() { /* Explicit local demo has no external dependency. */ }
  async close() { /* No connections in local memory mode. */ }
}
