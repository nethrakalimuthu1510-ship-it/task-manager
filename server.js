const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');
const { Server } = require('socket.io');

const SECRET = process.env.JWT_SECRET || 'change-this-secret';
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const db = new DatabaseSync(path.join(__dirname, 'tasks.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);

// ---------- App + Socket.IO ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sign = (u) => jwt.sign({ id: u.id, name: u.name }, SECRET, { expiresIn: '7d' });

// Authorization middleware: only logged-in users reach the task routes
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Please log in again.' }); }
}

io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth.token, SECRET); next(); }
  catch { next(new Error('unauthorized')); }
});
io.on('connection', (s) => s.join(`user:${s.user.id}`));
const notify = (userId) => io.to(`user:${userId}`).emit('tasks:changed');

// ---------- Auth routes ----------
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required.' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (name,email,password) VALUES (?,?,?)').run(name, email.toLowerCase(), hash);
    res.status(201).json({ token: sign({ id: r.lastInsertRowid, name }), name });
  } catch {
    res.status(409).json({ error: 'That email is already registered.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email = '', password = '' } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password))
    return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(u), name: u.name });
});

// ---------- Task routes (CRUD, scoped to the logged-in user) ----------
app.get('/api/tasks', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id));
});

app.post('/api/tasks', auth, (req, res) => {
  const { title, description = '', status = 'todo', due_date = null } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const r = db.prepare('INSERT INTO tasks (user_id,title,description,status,due_date) VALUES (?,?,?,?,?)')
    .run(req.user.id, title, description, status, due_date);
  notify(req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/tasks/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  const n = { ...t, ...req.body };
  db.prepare('UPDATE tasks SET title=?, description=?, status=?, due_date=? WHERE id=?')
    .run(n.title, n.description, n.status, n.due_date, t.id);
  notify(req.user.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Task not found.' });
  notify(req.user.id);
  res.status(204).end();
});

server.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
