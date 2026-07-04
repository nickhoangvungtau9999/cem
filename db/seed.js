// db/seed.js — default accounts so the app is usable on first boot.
const bcrypt = require('bcryptjs');
const { getDb } = require('./schema');

function seed() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO users (username, password_hash, name, role, employee_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  insert.run('admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin', null);
  insert.run('user', bcrypt.hashSync('user123', 10), 'Demo User', 'user', null);

  console.log('Default users created: admin/admin123 (admin), user/user123 (view-only, no linked employee)');
}

module.exports = { seed };
