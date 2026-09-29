const $ = (s) => document.querySelector(s);
let token = localStorage.getItem('token');
let socket, registering = false;

// ---------- helpers ----------
async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  });
  if (res.status === 401 && token) { logout(); return; }
  if (res.status === 204) return;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- auth ----------
$('#authToggle').onclick = () => {
  registering = !registering;
  $('#name').hidden = !registering;
  $('#name').required = registering;
  $('#authSubmit').textContent = registering ? 'Create account' : 'Log in';
  $('#authToggle').textContent = registering ? 'Have an account? Log in' : 'New here? Create an account';
  $('#authHint').textContent = registering ? 'Create an account to start.' : 'Log in to see your tasks.';
};
$('#authForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#authError').textContent = '';
  try {
    const data = await api(registering ? '/register' : '/login', 'POST', {
      name: $('#name').value, email: $('#email').value, password: $('#password').value,
    });
    token = data.token;
    localStorage.setItem('token', token);
    localStorage.setItem('name', data.name);
    start();
  } catch (err) { $('#authError').textContent = err.message; }
};
function logout() {
  localStorage.clear(); token = null;
  if (socket) socket.disconnect();
  $('#app').hidden = true; $('#auth').hidden = false;
}
$('#logout').onclick = logout;

// ---------- tasks ----------
async function load() {
  const tasks = await api('/tasks');
  if (!tasks) return;
  document.querySelectorAll('.list').forEach((l) => (l.innerHTML = ''));
  for (const t of tasks) {
    const el = document.createElement('article');
    el.className = 'task';
    el.innerHTML = `
      <strong>${esc(t.title)}</strong>
      ${t.description ? `<span>${esc(t.description)}</span>` : ''}
      ${t.due_date ? `<small>Due ${esc(t.due_date)}</small>` : ''}
      <div class="row">
        <select aria-label="Status">
          <option value="todo">To do</option>
          <option value="doing">In progress</option>
          <option value="done">Done</option>
        </select>
        <button class="edit">Edit</button>
        <button class="del">Delete</button>
      </div>`;
    const sel = el.querySelector('select');
    sel.value = t.status;
    sel.onchange = () => api('/tasks/' + t.id, 'PUT', { status: sel.value });
    el.querySelector('.edit').onclick = async () => {
      const title = prompt('Task title', t.title);
      if (title === null || !title.trim()) return;
      const description = prompt('Details', t.description);
      await api('/tasks/' + t.id, 'PUT', { title, description: description ?? t.description });
    };
    el.querySelector('.del').onclick = () => confirm('Delete this task?') && api('/tasks/' + t.id, 'DELETE');
    document.querySelector(`[data-status="${t.status}"] .list`).append(el);
  }
}
$('#taskForm').onsubmit = async (e) => {
  e.preventDefault();
  await api('/tasks', 'POST', { title: $('#title').value, description: $('#desc').value, due_date: $('#due').value || null });
  e.target.reset();
};

// ---------- start + real-time ----------
function start() {
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#hello').textContent = 'Hi, ' + (localStorage.getItem('name') || '');
  load();
  socket = io({ auth: { token } });
  socket.on('tasks:changed', load); // refresh when any tab/device changes data
}
if (token) start();
