const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin } = require('../middleware/auth');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

// GET /api/training?employee_id=&game=
router.get('/', (req, res) => {
  const db = getDb();
  const { employee_id = '', game = '' } = req.query;
  let sql = `
    SELECT t.*, e.full_name AS employee_name
    FROM training_records t
    LEFT JOIN employees e ON e.id = t.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (employee_id.trim()) { sql += ' AND t.employee_id = ?'; params.push(padId(employee_id)); }
  if (game.trim()) { sql += ' AND t.game = ?'; params.push(game.trim()); }
  sql += ' ORDER BY t.training_date DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/training/skill-matrix/:employeeId — per-employee skill summary:
// each distinct game they've trained on + most recent session date + count.
router.get('/skill-matrix/:employeeId', (req, res) => {
  const db = getDb();
  const id = padId(req.params.employeeId);
  const rows = db.prepare(`
    SELECT game, MAX(training_date) AS last_trained, COUNT(*) AS sessions
    FROM training_records WHERE employee_id = ?
    GROUP BY game ORDER BY game
  `).all(id);
  res.json(rows);
});

// GET /api/training/summary — overview: how many distinct employees trained per game
router.get('/summary', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT game, COUNT(DISTINCT employee_id) AS employees_trained, COUNT(*) AS sessions
    FROM training_records GROUP BY game ORDER BY game
  `).all();
  res.json(rows);
});

module.exports = router;
