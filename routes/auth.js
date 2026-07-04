const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { getUserTier } = require('../middleware/permissions');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username/password' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.name = user.name;
  req.session.role = user.role;
  req.session.employeeId = user.employee_id;

  const tier = getUserTier(db, req);
  res.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role, employeeId: user.employee_id, tier } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDb();
  const tier = getUserTier(db, req);
  res.json({
    id: req.session.userId,
    username: req.session.username,
    name: req.session.name,
    role: req.session.role,
    employeeId: req.session.employeeId,
    tier,
  });
});

module.exports = router;
