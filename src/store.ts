import { randomUUID } from 'node:crypto';

export const schools = [
  { id: 'north', name: 'North Creek School (fictional)' },
  { id: 'east', name: 'East Meadow School (fictional)' },
  { id: 'west', name: 'West Ridge School (fictional)' },
] as const;
export const deviceTypes = ['chromebook', 'laptop'] as const;
export const issueCategories = ['power', 'screen', 'keyboard', 'connectivity'] as const;
export const incidentStatuses = ['open', 'in-repair', 'resolved'] as const;
export type DeviceType = typeof deviceTypes[number];
export type IssueCategory = typeof issueCategories[number];
export type IncidentStatus = typeof incidentStatuses[number];
export type SchoolId = typeof schools[number]['id'];

export interface IncidentInput {
  schoolId: SchoolId;
  assetTag: string;
  deviceType: DeviceType;
  category: IssueCategory;
}
export interface Incident extends IncidentInput {
  id: string;
  status: IncidentStatus;
  loanerId: string;
  createdAt: string;
  updatedAt: string;
}
export interface Loaner {
  id: string;
  assetTag: string;
  deviceType: DeviceType;
  incidentId: string;
}

// Keep this line shared by the independent power and screen demonstration PRs.
const urgentCategories: readonly IssueCategory[] = [];
export function presentIncident(incident: Incident) {
  return { ...incident, priority: incident.status !== 'resolved' && urgentCategories.includes(incident.category) ? 'urgent' : 'standard' };
}

export class DomainError extends Error {
  constructor(message: string, public readonly statusCode: 400 | 404 | 409) { super(message); }
}
export class IncidentLimitError extends DomainError {
  constructor() { super('The demo is limited to 100 incidents. Delete an unassigned incident first.', 409); }
}
export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some((item) => item === value);
}
export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
export function parseIncidentInput(body: unknown): IncidentInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DomainError('Enter the structured incident fields.', 400);
  const fields = Object.keys(body);
  if (fields.some((key) => !['schoolId', 'assetTag', 'deviceType', 'category'].includes(key))) {
    throw new DomainError('Only school, synthetic asset tag, device type and issue category are accepted.', 400);
  }
  if (!('schoolId' in body) || !isOneOf(schools.map((school) => school.id), body.schoolId)
    || !('deviceType' in body) || !isOneOf(deviceTypes, body.deviceType)
    || !('category' in body) || !isOneOf(issueCategories, body.category)
    || !('assetTag' in body) || typeof body.assetTag !== 'string' || !/^DEMO-[A-Z0-9-]{1,20}$/.test(body.assetTag)) {
    throw new DomainError('Select valid catalog values and an asset tag starting DEMO- (uppercase letters, numbers or hyphens; up to 25 characters).', 400);
  }
  return { schoolId: body.schoolId, assetTag: body.assetTag, deviceType: body.deviceType, category: body.category };
}
export function requireIncident(incident: Incident | undefined): Incident {
  if (!incident) throw new DomainError('Incident not found.', 404);
  return incident;
}
export function requireLoaner(loaner: Loaner | undefined): Loaner {
  if (!loaner) throw new DomainError('Loaner not found.', 404);
  return loaner;
}
export function assertTransition(incident: Incident, status: IncidentStatus): void {
  const allowed: Record<IncidentStatus, readonly IncidentStatus[]> = {
    open: ['in-repair'], 'in-repair': ['resolved'], resolved: ['open'],
  };
  if (!allowed[incident.status].includes(status)) throw new DomainError('Use Open -> In repair -> Resolved, or reopen a Resolved incident.', 409);
  if (status === 'resolved' && incident.loanerId) throw new DomainError('Return the loaner before resolving this incident.', 409);
}
export function assertAssignment(incident: Incident, loaner: Loaner): void {
  if (incident.status === 'resolved') throw new DomainError('Reopen the incident before assigning a loaner.', 409);
  if (incident.loanerId || loaner.incidentId) throw new DomainError('The incident or loaner already has an assignment. Refresh availability.', 409);
  if (incident.deviceType !== loaner.deviceType) throw new DomainError('Choose a loaner of the same device type.', 409);
}
export function assertUnassigned(incident: Incident): void {
  if (incident.loanerId) throw new DomainError('Return the loaner before deleting this incident.', 409);
}

export interface IncidentStore {
  list(): Promise<Incident[]>;
  loaners(): Promise<Loaner[]>;
  create(input: IncidentInput): Promise<Incident>;
  update(id: string, status: IncidentStatus): Promise<Incident>;
  assign(id: string, loanerId: string): Promise<Incident>;
  returnLoaner(id: string): Promise<Incident>;
  delete(id: string): Promise<void>;
  check(): Promise<void>;
  close(): Promise<void>;
}
export function sampleIncidents(): Incident[] {
  const now = new Date().toISOString();
  const data: (IncidentInput & { status: IncidentStatus })[] = [
    { schoolId: 'north', assetTag: 'DEMO-CB-101', deviceType: 'chromebook', category: 'power', status: 'open' },
    { schoolId: 'east', assetTag: 'DEMO-CB-202', deviceType: 'chromebook', category: 'screen', status: 'open' },
    { schoolId: 'north', assetTag: 'DEMO-LT-103', deviceType: 'laptop', category: 'keyboard', status: 'open' },
    { schoolId: 'west', assetTag: 'DEMO-LT-304', deviceType: 'laptop', category: 'connectivity', status: 'in-repair' },
    { schoolId: 'east', assetTag: 'DEMO-CB-205', deviceType: 'chromebook', category: 'power', status: 'resolved' },
  ];
  return data.map((input, index) => ({
    ...input, id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    loanerId: '', createdAt: now, updatedAt: now,
  }));
}
export function sampleLoaners(): Loaner[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    assetTag: `DEMO-LOAN-${index + 1}`, deviceType: index < 3 ? 'chromebook' : 'laptop', incidentId: '',
  }));
}
export function newIncident(input: IncidentInput): Incident {
  const now = new Date().toISOString();
  return { ...input, id: randomUUID(), status: 'open', loanerId: '', createdAt: now, updatedAt: now };
}

export class MemoryIncidentStore implements IncidentStore {
  private readonly incidents = new Map(sampleIncidents().map((incident) => [incident.id, incident]));
  private readonly inventory = new Map(sampleLoaners().map((loaner) => [loaner.id, loaner]));
  async list() { return [...this.incidents.values()].map((incident) => ({ ...incident })); }
  async loaners() { return [...this.inventory.values()].map((loaner) => ({ ...loaner })); }
  async create(input: IncidentInput) {
    if (this.incidents.size >= 100) throw new IncidentLimitError();
    const incident = newIncident(parseIncidentInput(input));
    this.incidents.set(incident.id, incident);
    return { ...incident };
  }
  async update(id: string, status: IncidentStatus) {
    const incident = requireIncident(this.incidents.get(id));
    assertTransition(incident, status);
    Object.assign(incident, { status, updatedAt: new Date().toISOString() });
    return { ...incident };
  }
  async assign(id: string, loanerId: string) {
    const incident = requireIncident(this.incidents.get(id));
    const loaner = requireLoaner(this.inventory.get(loanerId));
    assertAssignment(incident, loaner);
    Object.assign(incident, { loanerId, updatedAt: new Date().toISOString() });
    loaner.incidentId = id;
    return { ...incident };
  }
  async returnLoaner(id: string) {
    const incident = requireIncident(this.incidents.get(id));
    if (!incident.loanerId) throw new DomainError('This incident has no loaner to return.', 409);
    const loaner = requireLoaner(this.inventory.get(incident.loanerId));
    if (loaner.incidentId !== id) throw new Error('Loaner assignment is inconsistent.');
    loaner.incidentId = '';
    Object.assign(incident, { loanerId: '', updatedAt: new Date().toISOString() });
    return { ...incident };
  }
  async delete(id: string) {
    assertUnassigned(requireIncident(this.incidents.get(id)));
    this.incidents.delete(id);
  }
  async check() { /* Explicit local demo has no external dependency. */ }
  async close() { /* No connections in local memory mode. */ }
}
