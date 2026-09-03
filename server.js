const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const database = new Database(path.join(__dirname, 'data.sqlite'));
database.pragma('journal_mode = WAL');

database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    color TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    initials TEXT NOT NULL
  );
`);

const seed = database.transaction(() => {
  if (database.prepare('SELECT COUNT(*) AS count FROM departments').get().count === 0) {
    const insert = database.prepare('INSERT INTO departments (name, description, color) VALUES (?, ?, ?)');
    [
      ['Logística', 'Fluxo, armazenamento e entrega', '#e2f3ec'],
      ['Produtos', 'Catálogo e disponibilidade', '#fff0d8'],
      ['Pessoas', 'Equipe e funções', '#e8e8fb'],
    ].forEach((department) => insert.run(...department));
  }
  if (database.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0) {
    const insert = database.prepare('INSERT INTO products (name, category, stock, status) VALUES (?, ?, ?, ?)');
    [
      ['Kit boas-vindas', 'Materiais', 148, 'Disponível'],
      ['Crachá visitante', 'Identificação', 42, 'Estoque baixo'],
      ['Camiseta do evento', 'Vestuário', 0, 'Esgotado'],
      ['Pasta institucional', 'Materiais', 86, 'Disponível'],
    ].forEach((product) => insert.run(...product));
  }
  if (database.prepare('SELECT COUNT(*) AS count FROM employees').get().count === 0) {
    const insert = database.prepare('INSERT INTO employees (name, role, department, initials) VALUES (?, ?, ?, ?)');
    [
      ['Marina Costa', 'Coordenadora geral', 'Operações', 'MC'],
      ['Rafael Lima', 'Analista de logística', 'Logística', 'RL'],
      ['Bianca Alves', 'Especialista de produtos', 'Produtos', 'BA'],
      ['João Santos', 'Assistente administrativo', 'Pessoas', 'JS'],
    ].forEach((employee) => insert.run(...employee));
  }
});
seed();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'feira-das-profissoes-local-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));
app.use(express.static(path.join(__dirname, 'public')));

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const safeUser = (user) => ({ id: user.id, name: user.name, email: user.email });
const requireAuth = (request, response, next) => {
  if (!request.session.userId) return response.status(401).json({ message: 'Faça login para continuar.' });
  next();
};

app.post('/api/auth/register', async (request, response) => {
  const { name, email, password } = request.body;
  if (!name || name.trim().length < 2) return response.status(400).json({ message: 'Informe seu nome completo.' });
  if (!validEmail(email || '')) return response.status(400).json({ message: 'Digite um e-mail válido.' });
  if (!password || password.length < 6) return response.status(400).json({ message: 'A senha precisa ter pelo menos 6 caracteres.' });
  const normalizedEmail = email.trim().toLowerCase();
  if (database.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) {
    return response.status(409).json({ message: 'Este e-mail já está cadastrado.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const result = database.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), normalizedEmail, passwordHash);
  request.session.userId = result.lastInsertRowid;
  return response.status(201).json({ user: { id: result.lastInsertRowid, name: name.trim(), email: normalizedEmail } });
});

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body;
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return response.status(401).json({ message: 'E-mail ou senha incorretos.' });
  }
  request.session.userId = user.id;
  return response.json({ user: safeUser(user) });
});

app.post('/api/auth/forgot-password', (request, response) => {
  const email = (request.body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return response.status(400).json({ message: 'Digite um e-mail válido.' });
  const user = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return response.json({ message: 'Se o e-mail estiver cadastrado, as instruções estarão disponíveis.' });
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  database.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
  database.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(user.id, tokenHash, Date.now() + 15 * 60 * 1000);
  return response.json({ message: 'Código de recuperação gerado.', devToken: token });
});

app.post('/api/auth/reset-password', async (request, response) => {
  const { email, token, password } = request.body;
  if (!validEmail(email || '') || !token || !password || password.length < 6) {
    return response.status(400).json({ message: 'Confira e-mail, código e senha (mínimo de 6 caracteres).' });
  }
  const user = database.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const reset = user && database.prepare('SELECT * FROM password_resets WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > ?').get(user.id, tokenHash, Date.now());
  if (!reset) return response.status(400).json({ message: 'Código inválido ou expirado.' });
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 12), user.id);
  database.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  return response.json({ message: 'Senha atualizada. Você já pode entrar.' });
});

app.post('/api/auth/logout', (request, response) => {
  request.session.destroy((error) => {
    if (error) return response.status(500).json({ message: 'Não foi possível encerrar a sessão.' });
    response.clearCookie('connect.sid');
    return response.json({ message: 'Sessão encerrada.' });
  });
});

app.get('/api/me', (request, response) => {
  const user = request.session.userId && database.prepare('SELECT id, name, email FROM users WHERE id = ?').get(request.session.userId);
  return response.json({ user: user || null });
});

app.get('/api/dashboard', requireAuth, (request, response) => response.json({
  departments: database.prepare('SELECT * FROM departments ORDER BY id').all(),
  products: database.prepare('SELECT * FROM products ORDER BY id').all(),
  employees: database.prepare('SELECT * FROM employees ORDER BY id').all(),
}));

app.listen(port, () => console.log(`Feira das Profissões disponível em http://localhost:${port}`));
