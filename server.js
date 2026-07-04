require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./db/schema');
const { seed } = require('./db/seed');
const { requireLogin, requireAdmin } = require('./middleware/auth');

initDb();
seed();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'casino-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

// Make current user + permission tier available to every view.
app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    res.locals.currentUser = { name: req.session.name, username: req.session.username, role: req.session.role };
    res.locals.userTier = require('./middleware/permissions').getUserTier(require('./db/schema').getDb(), req);
  } else {
    res.locals.currentUser = null;
    res.locals.userTier = 'none';
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/import', require('./routes/import'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/disciplinary', require('./routes/disciplinary'));
app.use('/api/cctv', require('./routes/cctv'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/training', require('./routes/training'));
app.use('/api/exposure', require('./routes/exposure'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/voting', require('./routes/voting'));
app.use('/api/settings', require('./routes/settings'));

// ── Pages ────────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

app.get('/', requireLogin, (req, res) => {
  const db = require('./db/schema').getDb();
  const byPosition = db.prepare(`
    SELECT position, COUNT(*) AS n FROM employees WHERE status = 'Active' AND position IS NOT NULL
    GROUP BY position ORDER BY n DESC
  `).all();
  const stats = {
    employeesTotal: db.prepare("SELECT COUNT(*) n FROM employees WHERE status = 'Active'").get().n,
    byPosition,
    pendingCases: db.prepare("SELECT COUNT(*) n FROM disciplinary_cases WHERE approval_status = 'Pending Approval'").get().n,
    pendingCctv: db.prepare("SELECT COUNT(*) n FROM cctv_incidents WHERE status = 'Pending'").get().n,
    attendanceFlags: db.prepare(`
      SELECT COUNT(*) n FROM (
        SELECT a.employee_id FROM attendance_log a WHERE a.att_type = 'NS'
        GROUP BY a.employee_id HAVING COUNT(*) >= 1
        AND NOT EXISTS (SELECT 1 FROM disciplinary_cases dc WHERE dc.employee_id = a.employee_id AND dc.source = 'attendance' AND dc.violation = 'No Call No Show')
        UNION ALL
        SELECT a.employee_id FROM attendance_log a WHERE a.att_type = 'LATE'
        GROUP BY a.employee_id HAVING COUNT(*) >= 3
        AND NOT EXISTS (SELECT 1 FROM disciplinary_cases dc WHERE dc.employee_id = a.employee_id AND dc.source = 'attendance' AND dc.violation = 'Late arrival (<15 min)')
      )
    `).get().n,
    openVotes: db.prepare("SELECT COUNT(*) n FROM vote_topics WHERE status = 'active' AND date('now') BETWEEN start_date AND end_date").get().n,
    trainingThisMonth: db.prepare("SELECT COUNT(*) n FROM training_records WHERE strftime('%Y-%m', training_date) = strftime('%Y-%m', 'now')").get().n,
  };
  res.render('dashboard', { title: 'Home', currentPath: '/', stats });
});

app.get('/employees', requireLogin, (req, res) => {
  res.render('employees/list', { title: 'Employees', currentPath: '/employees' });
});

app.get('/employees/:id', requireLogin, (req, res) => {
  res.render('employees/detail', { title: 'Employee profile', currentPath: '/employees', empId: req.params.id });
});

app.get('/disciplinary', requireLogin, (req, res) => {
  res.render('disciplinary/list', { title: 'Disciplinary', currentPath: '/disciplinary' });
});

app.get('/cctv', requireLogin, (req, res) => {
  res.render('cctv/list', { title: 'CCTV', currentPath: '/cctv' });
});

app.get('/cctv/:id', requireLogin, (req, res) => {
  res.render('cctv/detail', { title: 'CCTV report', currentPath: '/cctv', incidentId: req.params.id });
});

app.get('/attendance', requireLogin, (req, res) => {
  res.render('attendance/list', { title: 'Attendance', currentPath: '/attendance' });
});

app.get('/training', requireLogin, (req, res) => {
  res.render('training/list', { title: 'Training', currentPath: '/training' });
});

app.get('/exposure', requireLogin, (req, res) => {
  res.render('exposure/list', { title: 'Exposure', currentPath: '/exposure' });
});

app.get('/performance', requireLogin, (req, res) => {
  res.render('performance/list', { title: 'Performance', currentPath: '/performance' });
});

app.get('/voting', requireLogin, (req, res) => {
  res.render('voting/list', { title: 'Voting', currentPath: '/voting' });
});

app.get('/settings', requireLogin, requireAdmin, (req, res) => {
  res.render('settings/index', { title: 'Settings', currentPath: '/settings' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).send('Not found');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ Casino Staff App running`);
  console.log(`  Local: http://localhost:${PORT}\n`);
});
