const byId = (id) => document.getElementById(id);
let incidents = [];
let loaners = [];
let catalog;
let busy = false;
const labels = { chromebook: 'Chromebook', laptop: 'Laptop', power: "Won't power on", screen: 'Screen damage', keyboard: 'Keyboard issue', connectivity: 'Connectivity issue', open: 'Open', 'in-repair': 'In repair', resolved: 'Resolved' };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function option(select, value, text) {
  const node = element('option', text);
  node.value = value;
  select.append(node);
}
async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed (${response.status}).`;
    try { message = JSON.parse(text).error || message; } catch { message += ' The server returned an unreadable error response.'; }
    throw new Error(message);
  }
  return response.status === 204 ? undefined : response.json();
}
function showError(error) {
  byId('error').textContent = error.message;
  byId('error').hidden = false;
}
function action(incident, text, operation, disabled = false) {
  const button = element('button', text);
  button.type = 'button';
  button.disabled = busy || disabled;
  button.setAttribute('aria-label', `${text} ${incident.assetTag}`);
  button.addEventListener('click', () => mutate(operation));
  return button;
}
function changeStatus(incident, status) {
  return () => request(`/api/incidents/${incident.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
}
function render() {
  byId('open-count').textContent = incidents.filter((incident) => incident.status === 'open').length;
  byId('repair-count').textContent = incidents.filter((incident) => incident.status === 'in-repair').length;
  byId('resolved-count').textContent = incidents.filter((incident) => incident.status === 'resolved').length;
  byId('available-count').textContent = loaners.filter((loaner) => !loaner.incidentId).length;
  const shown = incidents.filter((incident) =>
    (byId('school-filter').value === 'all' || incident.schoolId === byId('school-filter').value)
    && (byId('status-filter').value === 'all' || incident.status === byId('status-filter').value));
  byId('incident-count').textContent = `${shown.length} incidents shown / ${incidents.length} district-wide`;
  byId('incidents').replaceChildren();
  byId('empty').hidden = shown.length > 0;
  for (const incident of shown) {
    const row = element('li');
    row.dataset.incidentId = incident.id;
    const details = element('div', undefined, 'incident-details');
    const heading = element('div', undefined, 'incident-heading');
    heading.append(element('h3', incident.assetTag), element('span', labels[incident.status], 'pill'));
    heading.append(element('span', incident.priority === 'urgent' ? 'Urgent' : 'Standard', `priority ${incident.priority}`));
    details.append(heading);
    details.append(element('p', `${catalog.schools.find((school) => school.id === incident.schoolId).name} / ${labels[incident.deviceType]} / ${labels[incident.category]}`, 'muted'));
    details.append(element('p', `Reported ${new Date(incident.createdAt).toLocaleString()} / Updated ${new Date(incident.updatedAt).toLocaleString()}`, 'timestamps'));
    const controls = element('div', undefined, 'incident-actions');
    if (incident.status === 'open') controls.append(action(incident, 'Start repair', changeStatus(incident, 'in-repair')));
    if (incident.status === 'in-repair') controls.append(action(incident, 'Resolve', changeStatus(incident, 'resolved'), Boolean(incident.loanerId)));
    if (incident.status === 'resolved') controls.append(action(incident, 'Reopen', changeStatus(incident, 'open')));
    if (incident.loanerId) {
      const loaner = loaners.find((item) => item.id === incident.loanerId);
      details.append(element('p', `Loaner: ${loaner ? loaner.assetTag : incident.loanerId}. Return it before resolution or deletion.`, 'muted'));
      controls.append(action(incident, 'Return loaner', () => request(`/api/incidents/${incident.id}/loaner`, { method: 'DELETE' })));
    } else if (incident.status !== 'resolved') {
      const select = element('select');
      select.setAttribute('aria-label', `Available loaner for ${incident.assetTag}`);
      select.disabled = busy;
      const available = loaners.filter((loaner) => !loaner.incidentId && loaner.deviceType === incident.deviceType);
      option(select, '', available.length ? 'Choose compatible loaner' : 'No compatible loaners available');
      for (const loaner of available) option(select, loaner.id, loaner.assetTag);
      const assign = action(incident, 'Assign loaner', () => request(`/api/incidents/${incident.id}/loaner`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loanerId: select.value }),
      }), true);
      select.addEventListener('change', () => { assign.disabled = busy || !select.value; });
      controls.append(select, assign);
    }
    controls.append(action(incident, 'Delete', () => request(`/api/incidents/${incident.id}`, { method: 'DELETE' }), Boolean(incident.loanerId)));
    row.append(details, controls);
    byId('incidents').append(row);
  }
  byId('loaners').replaceChildren();
  for (const loaner of loaners) {
    const row = element('li');
    row.dataset.loanerId = loaner.id;
    row.append(element('strong', loaner.assetTag), element('span', labels[loaner.deviceType]));
    const incident = incidents.find((item) => item.id === loaner.incidentId);
    row.append(element('span', loaner.incidentId ? `Assigned to ${incident ? incident.assetTag : loaner.incidentId}` : 'Available', 'muted'));
    byId('loaners').append(row);
  }
  byId('report-button').disabled = busy || !catalog;
  byId('refresh').disabled = busy || !catalog;
  for (const control of byId('incident-form').querySelectorAll('input, select')) control.disabled = busy || !catalog;
}
async function load() {
  const [nextIncidents, nextLoaners] = await Promise.all([request('/api/incidents'), request('/api/loaners')]);
  incidents = nextIncidents;
  loaners = nextLoaners;
}
async function mutate(operation) {
  if (busy) return;
  busy = true;
  byId('error').hidden = true;
  render();
  try {
    await operation();
    await load();
    byId('announcement').textContent = 'Device support dashboard updated.';
  } catch (error) {
    showError(error);
    try { await load(); } catch (refreshError) { showError(new Error(`${error.message} Refresh also failed: ${refreshError.message}`)); }
  } finally {
    busy = false;
    render();
    byId('refresh').focus();
  }
}
byId('incident-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = {
    schoolId: byId('school').value, assetTag: byId('asset-tag').value,
    deviceType: byId('device-type').value, category: byId('category').value,
  };
  mutate(async () => {
    await request('/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    byId('asset-tag').value = '';
  });
});
for (const id of ['school-filter', 'status-filter']) byId(id).addEventListener('change', render);
byId('refresh').addEventListener('click', () => mutate(async () => {}));
async function initialize() {
  const [info, nextCatalog] = await Promise.all([request('/api/info'), request('/api/catalog')]);
  catalog = nextCatalog;
  byId('app-title').textContent = info.title;
  document.title = info.title;
  byId('commit').textContent = info.commit;
  byId('local-banner').hidden = !info.localDemo;
  byId('storage-status').textContent = info.localDemo ? 'Local memory' : info.databaseConnected ? 'Table Storage connected' : 'Unavailable';
  byId('vault-status').textContent = info.localDemo ? 'Local placeholder' : info.secretConfigured ? 'Secret resolved' : 'Not resolved';
  for (const school of catalog.schools) {
    option(byId('school'), school.id, school.name);
    option(byId('school-filter'), school.id, school.name);
  }
  for (const value of catalog.deviceTypes) option(byId('device-type'), value, labels[value]);
  for (const value of catalog.issueCategories) option(byId('category'), value, labels[value]);
  for (const value of catalog.incidentStatuses) option(byId('status-filter'), value, labels[value]);
  await load();
  render();
}
initialize().catch(showError);
