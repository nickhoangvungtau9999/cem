const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { PERFORMANCE_CRITERIA } = require('../db/constants');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

// GET /api/performance/criteria — the positive/negative checklist catalogue
router.get('/criteria', (req, res) => {
  res.json(PERFORMANCE_CRITERIA);
});

// GET /api/performance/:employeeId — notes history for one employee
router.get('/:employeeId', (req, res) => {
  const db = getDb();
  const id = padId(req.params.employeeId);
  const rows = db.prepare(`
    SELECT p.*, u.name AS created_by_name
    FROM performance_notes p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.employee_id = ?
    ORDER BY p.created_at DESC
  `).all(id);
  res.json(rows.map((r) => ({ ...r, criteria: r.criteria_json ? JSON.parse(r.criteria_json) : [] })));
});

// POST /api/performance/:employeeId — log a coaching note (edit tier+)
// Body: { tag_type: 'positive'|'negative'|'mixed', items: [{category, item}], note }
router.post('/:employeeId', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const id = padId(req.params.employeeId);
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const { tag_type, items = [], note } = req.body;
  if (!['positive', 'negative', 'mixed'].includes(tag_type)) return res.status(400).json({ error: 'Invalid tag_type' });
  if (!items.length && !note?.trim()) return res.status(400).json({ error: 'Pick at least 1 criterion or enter a note' });

  const info = db.prepare(`
    INSERT INTO performance_notes (employee_id, tag_type, criteria_json, note, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, tag_type, JSON.stringify(items), note || null, req.session.userId);

  res.json({ ok: true, id: info.lastInsertRowid });
});

module.exports = router;
