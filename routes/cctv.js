const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const router = express.Router();

router.use(requireLogin);

// GET /api/cctv?status=&search=
router.get('/', (req, res) => {
  const db = getDb();
  const { status = '', search = '' } = req.query;
  let sql = `
    SELECT c.*, e.full_name AS employee_name
    FROM cctv_incidents c
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (status.trim()) { sql += ' AND c.status = ?'; params.push(status.trim()); }
  if (search.trim()) {
    sql += ' AND (c.incident_file_number LIKE ? OR e.full_name LIKE ? OR c.specific LIKE ?)';
    const like = `%${search.trim()}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY c.gaming_date DESC, c.incident_file_number DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/cctv/:id — detail + sibling rows (same incident_file_number) + any linked disciplinary case
router.get('/:id', (req, res) => {
  const db = getDb();
  const incident = db.prepare(`
    SELECT c.*, e.full_name AS employee_name FROM cctv_incidents c
    LEFT JOIN employees e ON e.id = c.employee_id WHERE c.id = ?
  `).get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'CCTV report not found' });

  const siblings = db.prepare(`
    SELECT c.*, e.full_name AS employee_name FROM cctv_incidents c
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE c.incident_file_number = ? AND c.id != ?
  `).all(incident.incident_file_number, incident.id);

  const linkedCase = db.prepare(`
    SELECT * FROM disciplinary_cases WHERE source = 'cctv' AND source_ref = ?
  `).get(incident.id);

  res.json({ incident, siblings, linkedCase });
});

// PATCH /api/cctv/:id — update status/action_taken/mgr_remark (edit tier+)
router.patch('/:id', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const incident = db.prepare('SELECT id FROM cctv_incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'CCTV report not found' });

  const fields = ['status', 'action_taken', 'mgr_remark'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE cctv_incidents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// POST /api/cctv/:id/create-case — spawn a disciplinary case from this incident (edit tier+)
router.post('/:id/create-case', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const incident = db.prepare('SELECT * FROM cctv_incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'CCTV report not found' });

  const existing = db.prepare("SELECT id FROM disciplinary_cases WHERE source = 'cctv' AND source_ref = ?").get(incident.id);
  if (existing) return res.status(400).json({ error: 'A disciplinary case already exists for this report', caseId: existing.id });

  const { level_code, category, violation, notes } = req.body;
  if (!level_code) return res.status(400).json({ error: 'Missing level_code' });

  const info = db.prepare(`
    INSERT INTO disciplinary_cases (source, source_ref, employee_id, level_code, category, violation, notes, approval_status, created_by)
    VALUES ('cctv', ?, ?, ?, ?, ?, ?, 'Pending Approval', ?)
  `).run(incident.id, incident.employee_id, level_code, category || null, violation || incident.specific || null, notes || null, req.session.userId);

  db.prepare("UPDATE cctv_incidents SET status = 'Actioned' WHERE id = ?").run(incident.id);
  res.json({ ok: true, caseId: info.lastInsertRowid });
});

module.exports = router;
