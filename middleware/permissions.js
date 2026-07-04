// middleware/permissions.js — single permission gate for the whole app.
// A logged-in user's capability is driven entirely by the app_pos_level (1-5)
// of the employee record linked via users.employee_id (imported straight from
// the Employee Info sheet's "App pos Level" column). No per-module matrix.
// Admins always bypass and get the top tier.
const { getDb } = require('../db/schema');
const { PERMISSION_RANK, tierForAppPosLevel } = require('../db/constants');

function getSessionEmployee(db, req) {
  if (!req.session || !req.session.employeeId) return null;
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(req.session.employeeId) || null;
}

// Effective tier: admin always 'approve'; a per-user permission_override (set
// by an admin in Settings for exceptions) wins next; otherwise derive from
// the linked employee's app_pos_level.
function getUserTier(db, req) {
  if (!req.session || !req.session.userId) return 'none';
  if (req.session.role === 'admin') return 'approve';
  const user = db.prepare('SELECT permission_override FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.permission_override) return user.permission_override;
  const emp = getSessionEmployee(db, req);
  return tierForAppPosLevel(emp ? emp.app_pos_level : 0);
}

// requirePermission('edit') → caller needs at least 'edit' (view < edit < approve).
// Attaches req.userPermLevel for the route handler to branch on if needed.
function requirePermission(minLevel = 'view') {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    const db = getDb();
    const level = getUserTier(db, req);
    req.userPermLevel = level;
    if (PERMISSION_RANK[level] === undefined || PERMISSION_RANK[level] < PERMISSION_RANK[minLevel]) {
      return res.status(403).json({ error: `Insufficient permission (need ${minLevel}, have ${level})` });
    }
    next();
  };
}

module.exports = { requirePermission, getUserTier, getSessionEmployee };
