const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { tierForAppPosLevel } = require('../db/constants');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin, requireAdmin);

// GET /api/settings/users
router.get('/users', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.employee_id, u.permission_override, u.created_at,
           e.full_name AS employee_name, e.app_pos_level
    FROM users u LEFT JOIN employees e ON e.id = u.employee_id
    ORDER BY u.id
  `).all();
  res.json(rows.map((u) => ({
    ...u,
    effective_tier: u.role === 'admin' ? 'approve' : (u.permission_override || tierForAppPosLevel(u.app_pos_level)),
  })));
});

// POST /api/settings/users — create a new login
router.post('/users', (req, res) => {
  const db = getDb();
  const { username, password, name, role = 'user', employee_id } = req.body;
  if (!username?.trim() || !password || !name?.trim()) return res.status(400).json({ error: 'Missing username/password/name' });
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  const empId = employee_id ? padId(employee_id) : null;
  if (empId && !db.prepare('SELECT id FROM employees WHERE id = ?').get(empId)) {
    return res.status(404).json({ error: 'Employee to link not found' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, name, role, employee_id) VALUES (?, ?, ?, ?, ?)
    `).run(username.trim(), bcrypt.hashSync(password, 10), name.trim(), role, empId);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/settings/users/:id
router.patch('/users/:id', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { name, role, employee_id, permission_override, password } = req.body;
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
  if (role !== undefined) {
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    updates.push('role = ?'); params.push(role);
  }
  if (employee_id !== undefined) { updates.push('employee_id = ?'); params.push(employee_id ? padId(employee_id) : null); }
  if (permission_override !== undefined) {
    if (permission_override && !['view', 'edit', 'approve'].includes(permission_override)) {
      return res.status(400).json({ error: 'Invalid permission_override' });
    }
    updates.push('permission_override = ?'); params.push(permission_override || null);
  }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }

  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// DELETE /api/settings/users/:id
router.delete('/users/:id', (req, res) => {
  const db = getDb();
  if (Number(req.params.id) === req.session.userId) return res.status(400).json({ error: 'Cannot delete the account you are logged in as' });
  const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n;
  const target = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin' && admins <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' });

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
