const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

// ── reference data ───────────────────────────────────────────────────────────

// GET /api/disciplinary/matrix — level definitions + violation catalogue, for
// building the "create case" form (violation picklist + auto-suggested level).
router.get('/matrix', (req, res) => {
  const db = getDb();
  const levels = db.prepare('SELECT * FROM disciplinary_matrix ORDER BY id').all();
  const violations = db.prepare('SELECT * FROM disciplinary_violations ORDER BY category, violation').all();
  res.json({ levels, violations });
});

// GET /api/disciplinary/suggest?employee_id=&violation= — how many times this
// employee has already been cased for this violation, and which escalation
// level applies to the *next* occurrence per the violation catalogue.
router.get('/suggest', (req, res) => {
  const db = getDb();
  const employeeId = padId(req.query.employee_id || '');
  const violation = (req.query.violation || '').trim();
  if (!employeeId || !violation) return res.status(400).json({ error: 'Missing employee_id/violation' });

  const priorCount = db.prepare(`
    SELECT COUNT(*) n FROM disciplinary_cases
    WHERE employee_id = ? AND violation = ? AND approval_status = 'Approved'
  `).get(employeeId, violation).n;

  const viol = db.prepare('SELECT * FROM disciplinary_violations WHERE violation = ?').get(violation);
  const offenseCols = ['offense_1st', 'offense_2nd', 'offense_3rd', 'offense_4th', 'offense_5th'];
  const idx = Math.min(priorCount, offenseCols.length - 1);
  const suggestedLevel = viol ? viol[offenseCols[idx]] : null;

  res.json({ priorApprovedCount: priorCount, occurrence: priorCount + 1, suggestedLevelCode: suggestedLevel || null });
});

// ── cases ─────────────────────────────────────────────────────────────────────

// GET /api/disciplinary/cases?status=&employee_id=
router.get('/cases', (req, res) => {
  const db = getDb();
  const { status = '', employee_id = '' } = req.query;
  let sql = `
    SELECT c.*, e.full_name AS employee_name, e.position AS employee_position
    FROM disciplinary_cases c
    LEFT JOIN employees e ON e.id = c.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (status.trim()) { sql += ' AND c.approval_status = ?'; params.push(status.trim()); }
  if (employee_id.trim()) { sql += ' AND c.employee_id = ?'; params.push(padId(employee_id)); }
  sql += ' ORDER BY c.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/disciplinary/cases/:id
router.get('/cases/:id', (req, res) => {
  const db = getDb();
  const c = db.prepare(`
    SELECT c.*, e.full_name AS employee_name, e.position AS employee_position,
           cb.name AS created_by_name, ab.name AS approved_by_name
    FROM disciplinary_cases c
    LEFT JOIN employees e ON e.id = c.employee_id
    LEFT JOIN users cb ON cb.id = c.created_by
    LEFT JOIN users ab ON ab.id = c.approved_by
    WHERE c.id = ?
  `).get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });

  let cctv = null;
  if (c.source === 'cctv' && c.source_ref) {
    cctv = db.prepare('SELECT * FROM cctv_incidents WHERE id = ?').get(c.source_ref);
  }
  res.json({ case: c, cctv });
});

// POST /api/disciplinary/cases — create manual case (edit tier+)
router.post('/cases', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const { employee_id, level_code, category, violation, notes, source, source_ref } = req.body;
  const employeeId = padId(employee_id || '');
  if (!employeeId) return res.status(400).json({ error: 'Missing employee_id' });
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  if (!level_code) return res.status(400).json({ error: 'Missing level_code' });

  const info = db.prepare(`
    INSERT INTO disciplinary_cases (source, source_ref, employee_id, level_code, category, violation, notes, approval_status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Approval', ?)
  `).run(source || 'manual', source_ref || null, employeeId, level_code, category || null, violation || null, notes || null, req.session.userId);

  res.json({ ok: true, id: info.lastInsertRowid });
});

// PATCH /api/disciplinary/cases/:id — edit a still-pending case (edit tier+)
router.patch('/cases/:id', requirePermission('edit'), (req, res) => {
  const db = getDb();
  const c = db.prepare('SELECT * FROM disciplinary_cases WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (c.approval_status !== 'Pending Approval') return res.status(400).json({ error: 'Case already decided, cannot edit' });

  const fields = ['level_code', 'category', 'violation', 'notes'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE disciplinary_cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

// PATCH /api/disciplinary/cases/:id/decide — approve/reject (approve tier+ only)
router.patch('/cases/:id/decide', requirePermission('approve'), (req, res) => {
  const db = getDb();
  const { decision } = req.body; // 'Approved' | 'Rejected'
  if (!['Approved', 'Rejected'].includes(decision)) return res.status(400).json({ error: "decision must be 'Approved' or 'Rejected'" });

  const c = db.prepare('SELECT * FROM disciplinary_cases WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Case not found' });
  if (c.approval_status !== 'Pending Approval') return res.status(400).json({ error: 'Case has already been decided' });

  db.prepare(`
    UPDATE disciplinary_cases SET approval_status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ?
  `).run(decision, req.session.userId, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
