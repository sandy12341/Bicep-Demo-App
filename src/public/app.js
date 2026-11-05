const byId = (id) => document.getElementById(id);
let tasks = [];
let filter = 'all';
let busy = false;

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Request failed (${response.status}).` }));
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined : response.json();
}

function showError(error) {
  byId('error').textContent = error.message;
  byId('error').hidden = false;
}

function render() {
  const completed = tasks.filter((task) => task.completed).length;
  byId('total-count').textContent = tasks.length;
  byId('open-count').textContent = tasks.length - completed;
  byId('done-count').textContent = completed;
  byId('task-count').textContent = `${tasks.length} tasks`;
  const shown = tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.completed : !task.completed));
  byId('tasks').replaceChildren();
  byId('empty').hidden = shown.length > 0;
  for (const task of shown) {
    const li = document.createElement('li');
    li.classList.toggle('done', task.completed);
    const toggle = document.createElement('button');
    toggle.className = 'task-toggle';
    toggle.textContent = task.completed ? '\u2713' : '';
    toggle.setAttribute('aria-label', `${task.completed ? 'Reopen' : 'Complete'} ${task.title}`);
    toggle.setAttribute('aria-pressed', String(task.completed));
    toggle.disabled = busy;
    toggle.addEventListener('click', () => mutate(() => request(`/api/tasks/${task.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !task.completed }),
    })));
    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.title;
    const remove = document.createElement('button');
    remove.className = 'delete';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${task.title}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => mutate(() => request(`/api/tasks/${task.id}`, { method: 'DELETE' })));
    li.append(toggle, text, remove);
    byId('tasks').append(li);
  }
}

async function load() {
  tasks = await request('/api/tasks');
  render();
}

async function mutate(action) {
  if (busy) return;
  busy = true;
  byId('error').hidden = true;
  byId('add-button').disabled = true;
  render();
  try {
    await action();
    await load();
    byId('announcement').textContent = 'Task board updated.';
  } catch (error) { showError(error); }
  finally { busy = false; byId('add-button').disabled = false; render(); }
}

byId('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = byId('task-title');
  const title = input.value.trim();
  if (!title) { showError(new Error('Enter a task title.')); return; }
  mutate(async () => {
    await request('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    input.value = '';
  });
});
for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    for (const other of document.querySelectorAll('[data-filter]')) other.setAttribute('aria-pressed', String(other === button));
    render();
  });
}
byId('refresh').addEventListener('click', () => { load().catch(showError); });

async function initialize() {
  const info = await request('/api/info');
  byId('app-title').textContent = info.title;
  document.title = info.title;
  byId('commit').textContent = info.commit;
  byId('local-banner').hidden = !info.localDemo;
  byId('storage-status').textContent = info.localDemo ? 'Local memory' : info.databaseConnected ? 'Table Storage connected' : 'Unavailable';
  byId('vault-status').textContent = info.localDemo ? 'Local placeholder' : info.secretConfigured ? 'Secret resolved' : 'Not resolved';
  await load();
}
initialize().catch(showError);
