const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

// Repeat-violation thresholds: att_type -> { minCount, violation } used to flag
// employees for a disciplinary case. 'NS' (No Call No Show) is serious enough
// to flag on the first occurrence; 'Late' needs a pattern before it's worth a case.
const FLAG_RULES = [
  { att_type: 'NS', minCount: 1, violation: 'No Call No Show', category: 'Attendance' },
  { att_type: 'LATE', minCount: 3, violation: 'Late arrival (<15 min)', category: 'Attendance' },
];

// GET /api/attendance?employee_id=&att_type=&search=
router.get('/', (req, res) => {
  const db = getDb();
  const { employee_id = '', att_type = '', search = '' } = req.query;
  let sql = `
    SELECT a.*, e.full_name AS employee_name
    FROM attendance_log a
    LEFT JOIN employees e ON e.id = a.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (employee_id.trim()) { sql += ' AND a.employee_id = ?'; params.push(padId(employee_id)); }
  if (att_type.trim()) { sql += ' AND a.att_type = ?'; params.push(att_type.trim().toUpperCase()); }
  if (search.trim()) {
    sql += ' AND (e.full_name LIKE ? OR a.reason LIKE ?)';
    const like = `%${search.trim()}%`;
    params.push(like, like);
  }
  sql += ' ORDER BY a.notice_date DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/attendance/flags — employees whose attendance pattern crosses a
// repeat-violation threshold and doesn't already have a disciplinary case.
router.get('/flags', (req, res) => {
  const db = getDb();
  const flags = [];
  for (const rule of FLAG_RULES) {
    const rows = db.prepare(`
      SELECT a.employee_id, e.full_name AS employee_name, COUNT(*) AS n
      FROM attendance_log a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.att_type = ?
      GROUP BY a.employee_id
      HAVING COUNT(*) >= ?
    `).all(rule.att_type, rule.minCount);

    for (const row of rows) {
      const existingCase = db.prepare(`
        SELECT id FROM disciplinary_cases WHERE employee_id = ? AND violation = ? AND source = 'attendance'
      `).get(row.employee_id, rule.violation);
      flags.push({
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        att_type: rule.att_type,
        count: row.n,
        violation: rule.violation,
        category: rule.category,
        alreadyCased: !!existingCase,
      });
    }
  }
  res.json(flags);
});

module.exports = router;
