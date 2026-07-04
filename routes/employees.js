const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

// GET /api/employees?search=&status=Active
router.get('/', (req, res) => {
  const db = getDb();
  const { search = '', status = '' } = req.query;
  let sql = 'SELECT id, full_name, position, level_name, app_pos_level, status, pickup_point FROM employees WHERE 1=1';
  const params = [];
  if (search.trim()) {
    sql += ' AND (id LIKE ? OR full_name LIKE ? OR position LIKE ?)';
    const like = `%${search.trim()}%`;
    params.push(like, like, like);
  }
  if (status.trim()) {
    sql += ' AND status = ?';
    params.push(status.trim());
  }
  sql += ' ORDER BY full_name';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/employees/:id — 360 profile: info + work history + relations
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = padId(req.params.id);
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const history = db.prepare('SELECT * FROM employee_work_history WHERE employee_id = ? ORDER BY effective_date ASC, id ASC').all(id);
  const relations = db.prepare('SELECT * FROM employee_relations WHERE employee_id = ?').all(id);

  res.json({ employee, history, relations });
});

// PATCH /api/employees/:id — edit basic info (edit tier+)
router.patch('/:id', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const id = padId(req.params.id);
  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const fields = ['full_name', 'position', 'email', 'mobile_phone', 'pickup_point', 'status', 'reward'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  updates.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// POST /api/employees/:id/history — add a manual work-history entry (edit tier+)
router.post('/:id/history', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const id = padId(req.params.id);
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const { action_change, effective_date, position, department } = req.body;
  if (!action_change || !effective_date) return res.status(400).json({ error: 'Missing action_change/effective_date' });

  const info = db.prepare(`
    INSERT INTO employee_work_history (employee_id, action_change, effective_date, position, department)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, action_change, effective_date, position || null, department || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// POST /api/employees/:id/relations — add a relation/couple declaration (edit tier+)
router.post('/:id/relations', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const id = padId(req.params.id);
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const { relation, relation_employee_id } = req.body;
  if (!relation || !relation_employee_id) return res.status(400).json({ error: 'Missing relation/relation_employee_id' });
  const relEmpId = padId(relation_employee_id);
  const relEmp = db.prepare('SELECT full_name, position FROM employees WHERE id = ?').get(relEmpId);
  if (!relEmp) return res.status(404).json({ error: 'Related employee not found' });

  db.prepare(`
    INSERT OR IGNORE INTO employee_relations (employee_id, relation, relation_employee_id, relation_name, relation_position)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, relation, relEmpId, relEmp.full_name, relEmp.position);
  res.json({ ok: true });
});

module.exports = router;
