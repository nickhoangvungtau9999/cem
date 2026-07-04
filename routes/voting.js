const express = require('express');
const { getDb } = require('../db/schema');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { getSessionEmployee } = require('../middleware/permissions');
const { resolveLevel } = require('../db/constants');
const { padId } = require('../db/util');
const router = express.Router();

router.use(requireLogin);

function today() { return new Date().toISOString().slice(0, 10); }
function parseJson(v, fallback) { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }

// Eligibility to vote is by job rank (employees.level_name ladder), not the
// app_pos_level system-access tier — voting is an HR activity tied to
// seniority, separate from what a user is allowed to edit in the app.
function myLevel(db, req) {
  if (req.session.role === 'admin') return Infinity;
  const emp = getSessionEmployee(db, req);
  return resolveLevel(emp);
}

function enrichTopic(t) {
  const voterLevels = parseJson(t.eligible_voter_levels, []);
  const nomineePositions = parseJson(t.eligible_nominee_positions, []);
  const td = today();
  const isActive = t.status === 'active' && t.start_date <= td && t.end_date >= td;
  return { ...t, voterLevels, nomineePositions, isActive };
}

// GET /api/voting/options — distinct rank levels + position titles in use,
// for building the admin "create topic" eligibility pickers.
router.get('/options', requireAdmin, (req, res) => {
  const db = getDb();
  const levels = db.prepare("SELECT DISTINCT level_name FROM employees WHERE level_name IS NOT NULL ORDER BY level_name").all().map((r) => r.level_name);
  const positions = db.prepare("SELECT DISTINCT position FROM employees WHERE position IS NOT NULL ORDER BY position").all().map((r) => r.position);
  res.json({ levels, positions });
});

// ── Admin: manage topics ─────────────────────────────────────────────────────

router.get('/admin', requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT vt.*, u.name AS created_by_name FROM vote_topics vt
    LEFT JOIN users u ON u.id = vt.created_by ORDER BY vt.created_at DESC
  `).all();
  const counts = db.prepare('SELECT topic_id, COUNT(*) AS total FROM vote_topic_votes GROUP BY topic_id').all();
  const countMap = Object.fromEntries(counts.map((c) => [c.topic_id, c.total]));
  res.json(rows.map((t) => ({ ...enrichTopic(t), total_votes: countMap[t.id] || 0 })));
});

router.post('/admin', requireAdmin, (req, res) => {
  const db = getDb();
  const {
    title, description, start_date, end_date,
    eligible_voter_levels = [], eligible_nominee_positions = [], max_votes_per_voter = 1,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date/end_date are required' });
  if (start_date > end_date) return res.status(400).json({ error: 'start_date must be before end_date' });
  if (!Array.isArray(eligible_voter_levels) || !eligible_voter_levels.length)
    return res.status(400).json({ error: 'Must select at least 1 eligible voter rank' });
  if (!Array.isArray(eligible_nominee_positions) || !eligible_nominee_positions.length)
    return res.status(400).json({ error: 'Must select at least 1 eligible nominee position' });

  const info = db.prepare(`
    INSERT INTO vote_topics (title, description, start_date, end_date, eligible_voter_levels,
                              eligible_nominee_positions, max_votes_per_voter, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(
    title.trim(), description?.trim() || null, start_date, end_date,
    JSON.stringify(eligible_voter_levels.map(Number)),
    JSON.stringify(eligible_nominee_positions),
    Number(max_votes_per_voter) || 1,
    req.session.userId
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.patch('/admin/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const topic = db.prepare('SELECT * FROM vote_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic does not exist' });

  const { title, description, start_date, end_date, eligible_voter_levels, eligible_nominee_positions, max_votes_per_voter, status } = req.body;
  const updates = ["updated_at = datetime('now')"];
  const params = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description?.trim() || null); }
  if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
  if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date); }
  if (eligible_voter_levels !== undefined) { updates.push('eligible_voter_levels = ?'); params.push(JSON.stringify(eligible_voter_levels.map(Number))); }
  if (eligible_nominee_positions !== undefined) { updates.push('eligible_nominee_positions = ?'); params.push(JSON.stringify(eligible_nominee_positions)); }
  if (max_votes_per_voter !== undefined) { updates.push('max_votes_per_voter = ?'); params.push(Number(max_votes_per_voter) || 1); }
  if (status !== undefined && ['active', 'closed'].includes(status)) { updates.push('status = ?'); params.push(status); }

  params.push(req.params.id);
  db.prepare(`UPDATE vote_topics SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/admin/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM vote_topic_votes WHERE topic_id = ?').run(req.params.id);
  db.prepare('DELETE FROM vote_topics WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/admin/:id/results', requireAdmin, (req, res) => {
  const db = getDb();
  const topic = db.prepare('SELECT * FROM vote_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic does not exist' });

  const results = db.prepare(`
    SELECT v.employee_id, e.full_name AS name, e.position, COUNT(*) AS vote_count
    FROM vote_topic_votes v JOIN employees e ON e.id = v.employee_id
    WHERE v.topic_id = ? GROUP BY v.employee_id ORDER BY vote_count DESC
  `).all(req.params.id);
  const voterCount = db.prepare('SELECT COUNT(DISTINCT voter_user_id) AS n FROM vote_topic_votes WHERE topic_id = ?').get(req.params.id);

  res.json({ topic: enrichTopic(topic), results, total_voters: voterCount.n || 0 });
});

// ── User: view + vote ────────────────────────────────────────────────────────

// GET /api/voting — active topics the calling user is eligible to vote in
router.get('/', (req, res) => {
  const db = getDb();
  const level = myLevel(db, req);
  const all = db.prepare("SELECT * FROM vote_topics WHERE status = 'active' ORDER BY end_date ASC").all();
  const eligible = all.map(enrichTopic).filter((t) => t.isActive && t.voterLevels.includes(level));
  if (!eligible.length) return res.json([]);

  const myVotes = db.prepare(`
    SELECT topic_id, employee_id FROM vote_topic_votes
    WHERE voter_user_id = ? AND topic_id IN (${eligible.map(() => '?').join(',')})
  `).all(req.session.userId, ...eligible.map((t) => t.id));
  const myVoteMap = {};
  for (const v of myVotes) { (myVoteMap[v.topic_id] ||= []).push(v.employee_id); }

  res.json(eligible.map((t) => ({
    ...t,
    my_votes: myVoteMap[t.id] || [],
    votes_remaining: t.max_votes_per_voter - (myVoteMap[t.id]?.length || 0),
  })));
});

// GET /api/voting/:id/nominees?search= — eligible employees to vote for
router.get('/:id/nominees', (req, res) => {
  const db = getDb();
  const level = myLevel(db, req);
  const topic = db.prepare('SELECT * FROM vote_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic does not exist' });
  const t = enrichTopic(topic);
  if (!t.voterLevels.includes(level) && req.session.role !== 'admin') return res.status(403).json({ error: 'Not allowed to vote in this topic' });
  if (!t.isActive) return res.status(400).json({ error: 'Topic is closed or not yet open' });

  const search = (req.query.search || '').toLowerCase().trim();
  let sql = "SELECT id, full_name, position, level_name FROM employees WHERE status = 'Active' AND position IN (" + t.nomineePositions.map(() => '?').join(',') + ')';
  const params = [...t.nomineePositions];
  if (search) { sql += ' AND (lower(full_name) LIKE ? OR lower(id) LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const nominees = db.prepare(sql).all(...params);

  const myVotes = db.prepare('SELECT employee_id FROM vote_topic_votes WHERE topic_id = ? AND voter_user_id = ?').all(t.id, req.session.userId).map((r) => r.employee_id);

  res.json({
    topic: { ...t, my_votes: myVotes, votes_remaining: t.max_votes_per_voter - myVotes.length },
    nominees: nominees.map((e) => ({ ...e, i_voted_for_this: myVotes.includes(e.id) })),
  });
});

// POST /api/voting/:id/vote — cast or retract. Body: { employee_id, action }
router.post('/:id/vote', (req, res) => {
  const db = getDb();
  const { action = 'vote' } = req.body;
  const employeeId = padId(req.body.employee_id || '');
  if (!employeeId) return res.status(400).json({ error: 'Missing employee_id' });
  if (!['vote', 'unvote'].includes(action)) return res.status(400).json({ error: "action must be 'vote' or 'unvote'" });

  const level = myLevel(db, req);
  const topic = db.prepare('SELECT * FROM vote_topics WHERE id = ?').get(req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic does not exist' });
  const t = enrichTopic(topic);
  if (!t.isActive) return res.status(400).json({ error: 'Topic is closed or not yet open' });
  if (!t.voterLevels.includes(level) && req.session.role !== 'admin') return res.status(403).json({ error: 'You are not allowed to vote in this topic' });

  const emp = db.prepare('SELECT id, position FROM employees WHERE id = ?').get(employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  if (!t.nomineePositions.includes(emp.position)) return res.status(400).json({ error: 'This employee is not in the nominee list' });

  const existing = db.prepare('SELECT id FROM vote_topic_votes WHERE topic_id = ? AND voter_user_id = ? AND employee_id = ?').get(t.id, req.session.userId, employeeId);

  if (action === 'unvote') {
    if (!existing) return res.status(400).json({ error: 'You have not voted for this employee' });
    db.prepare('DELETE FROM vote_topic_votes WHERE id = ?').run(existing.id);
    return res.json({ ok: true, action: 'unvoted' });
  }

  if (existing) return res.status(400).json({ error: 'You already voted for this employee' });
  const myCount = db.prepare('SELECT COUNT(*) AS n FROM vote_topic_votes WHERE topic_id = ? AND voter_user_id = ?').get(t.id, req.session.userId).n;
  if (myCount >= t.max_votes_per_voter) return res.status(400).json({ error: `You have used all ${t.max_votes_per_voter} votes for this topic` });

  db.prepare('INSERT INTO vote_topic_votes (topic_id, voter_user_id, employee_id) VALUES (?, ?, ?)').run(t.id, req.session.userId, employeeId);
  res.json({ ok: true, action: 'voted', votes_remaining: t.max_votes_per_voter - (myCount + 1) });
});

module.exports = router;
