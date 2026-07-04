const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/schema');
const { importWorkbook } = require('../db/importer');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

router.use(requireLogin, requireAdmin);

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file selected' });
  try {
    const db = getDb();
    const results = importWorkbook(db, req.file.path, req.file.originalname, req.session.userId);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

router.get('/log', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM import_log ORDER BY id DESC LIMIT 100').all();
  res.json(rows);
});

module.exports = router;
