// One-off: create a login for every employee with app_pos_level set.
// username = email local-part (before @), password = '1234' for all.
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');

const db = getDb();
const employees = db.prepare(`
  SELECT id, full_name, email, app_pos_level FROM employees
  WHERE app_pos_level IS NOT NULL
  ORDER BY id
`).all();

const insert = db.prepare(`
  INSERT INTO users (username, password_hash, name, role, employee_id) VALUES (?, ?, ?, 'user', ?)
`);
const findByEmployee = db.prepare('SELECT id FROM users WHERE employee_id = ?');
const findByUsername = db.prepare('SELECT id FROM users WHERE username = ?');

const passwordHash = bcrypt.hashSync('1234', 10);
const created = [];
const skipped = [];

for (const e of employees) {
  if (findByEmployee.get(e.id)) { skipped.push({ id: e.id, reason: 'already has an account' }); continue; }
  if (!e.email || !e.email.includes('@')) { skipped.push({ id: e.id, reason: 'no email' }); continue; }

  const username = e.email.split('@')[0].trim();
  if (!username) { skipped.push({ id: e.id, reason: 'empty username derived' }); continue; }
  if (findByUsername.get(username)) { skipped.push({ id: e.id, reason: `username '${username}' already taken` }); continue; }

  insert.run(username, passwordHash, e.full_name, e.id);
  created.push({ id: e.id, name: e.full_name, username, appPosLevel: e.app_pos_level });
}

console.log(`Created ${created.length} accounts, skipped ${skipped.length}`);
console.log(JSON.stringify({ created, skipped }, null, 2));
