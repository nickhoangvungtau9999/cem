const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

// GET /api/exposure?employee_id=&game=
router.get('/', (req, res) => {
  const db = getDb();
  const { employee_id = '', game = '' } = req.query;
  let sql = `
    SELECT x.*, e.full_name AS employee_name
    FROM exposure_log x
    LEFT JOIN employees e ON e.id = x.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (employee_id.trim()) { sql += ' AND x.employee_id = ?'; params.push(padId(employee_id)); }
  if (game.trim()) { sql += ' AND x.game = ?'; params.push(game.trim()); }
  sql += ' ORDER BY x.game_date DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/exposure/summary — overview: sessions per game/function across all employees
router.get('/summary', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT game, function, COUNT(DISTINCT employee_id) AS employees, COUNT(*) AS sessions
    FROM exposure_log GROUP BY game, function ORDER BY game, function
  `).all();
  res.json(rows);
});

// GET /api/exposure/summary/:employeeId — per-employee exposure summary (used
// as the Exposure tab on the employee 360 profile).
router.get('/summary/:employeeId', (req, res) => {
  const db = getDb();
  const id = padId(req.params.employeeId);
  const rows = db.prepare(`
    SELECT game, function, COUNT(*) AS sessions, MAX(game_date) AS last_date
    FROM exposure_log WHERE employee_id = ?
    GROUP BY game, function ORDER BY game, function
  `).all(id);
  res.json(rows);
});

module.exports = router;
