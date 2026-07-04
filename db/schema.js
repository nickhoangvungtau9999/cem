// db/schema.js — better-sqlite3, synchronous. Single source of truth for table structure.
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'casino.db');
let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      employee_id TEXT,
      permission_override TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      full_name TEXT,
      position TEXT,
      level_name INTEGER,
      app_pos_level INTEGER,
      nick_name TEXT,
      mentor_id TEXT,
      mentor_name TEXT,
      email TEXT,
      mobile_phone TEXT,
      hire_date TEXT,
      last_working_date TEXT,
      promotion_date TEXT,
      reward TEXT,
      pickup_point TEXT,
      ad_user TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(full_name);
    CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

    CREATE TABLE IF NOT EXISTS employee_work_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      action_change TEXT,
      effective_date TEXT,
      position TEXT,
      department TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ewh_emp ON employee_work_history(employee_id);
    CREATE INDEX IF NOT EXISTS idx_ewh_date ON employee_work_history(effective_date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ewh ON employee_work_history(employee_id, effective_date, action_change);

    CREATE TABLE IF NOT EXISTS employee_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      relation TEXT,
      relation_employee_id TEXT,
      relation_name TEXT,
      relation_position TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_erel_emp ON employee_relations(employee_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_erel ON employee_relations(employee_id, relation_employee_id, relation);

    -- Escalation level definitions: C1, C2, VW, WW, FWW, S, T — one row each.
    CREATE TABLE IF NOT EXISTS disciplinary_matrix (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level_code TEXT UNIQUE,
      action_name TEXT,
      expiration_months TEXT,
      scope TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Violation catalogue: which escalation level applies on the 1st..5th
    -- repeat offense. Looked up by category+violation, resolves to a
    -- disciplinary_matrix.level_code for a given offense count.
    CREATE TABLE IF NOT EXISTS disciplinary_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      violation TEXT,
      offense_1st TEXT,
      offense_2nd TEXT,
      offense_3rd TEXT,
      offense_4th TEXT,
      offense_5th TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_dviol ON disciplinary_violations(category, violation);

    CREATE TABLE IF NOT EXISTS cctv_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gaming_date TEXT,
      incident_file_number TEXT,
      specific TEXT,
      pos TEXT,
      employee_id TEXT,
      nick_name TEXT,
      narrative TEXT,
      location TEXT,
      sublocation TEXT,
      incident_type TEXT,
      action_taken TEXT,
      by_id TEXT,
      mgr_remark TEXT,
      status TEXT DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cctv_emp ON cctv_incidents(employee_id);
    CREATE INDEX IF NOT EXISTS idx_cctv_date ON cctv_incidents(gaming_date);
    CREATE INDEX IF NOT EXISTS idx_cctv_fileno ON cctv_incidents(incident_file_number);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_cctv ON cctv_incidents(incident_file_number, employee_id);

    CREATE TABLE IF NOT EXISTS disciplinary_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_ref INTEGER,
      employee_id TEXT NOT NULL,
      level_code TEXT,
      category TEXT,
      violation TEXT,
      notes TEXT,
      approval_status TEXT DEFAULT 'Pending Approval',
      created_by INTEGER,
      approved_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      approved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_case_emp ON disciplinary_cases(employee_id);
    CREATE INDEX IF NOT EXISTS idx_case_status ON disciplinary_cases(approval_status);

    CREATE TABLE IF NOT EXISTS attendance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notice_date TEXT,
      employee_id TEXT,
      position TEXT,
      name TEXT,
      shift TEXT,
      att_type TEXT,
      start_date TEXT,
      end_date TEXT,
      days INTEGER,
      reason TEXT,
      document_type TEXT,
      mgr_acknowledge TEXT,
      doc_submission_date TEXT,
      mgr_action TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance_log(employee_id);
    CREATE INDEX IF NOT EXISTS idx_att_type ON attendance_log(att_type);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_att ON attendance_log(employee_id, notice_date, att_type, start_date);

    CREATE TABLE IF NOT EXISTS training_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      training_date TEXT,
      month TEXT,
      game TEXT,
      employee_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_train_emp ON training_records(employee_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_train ON training_records(employee_id, training_date, game);

    CREATE TABLE IF NOT EXISTS exposure_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT,
      function TEXT,
      game TEXT,
      game_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_exp_emp ON exposure_log(employee_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_exp ON exposure_log(employee_id, function, game, game_date);

    CREATE TABLE IF NOT EXISTS performance_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL,
      tag_type TEXT,
      criteria_json TEXT,
      note TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_perf_emp ON performance_notes(employee_id);

    CREATE TABLE IF NOT EXISTS vote_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      eligible_voter_levels TEXT NOT NULL,
      eligible_nominee_positions TEXT NOT NULL,
      max_votes_per_voter INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vote_topic_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      voter_user_id INTEGER NOT NULL,
      employee_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(topic_id, voter_user_id, employee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vtv_topic ON vote_topic_votes(topic_id);

    CREATE TABLE IF NOT EXISTS import_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      sheet_name TEXT,
      rows_added INTEGER DEFAULT 0,
      rows_skipped INTEGER DEFAULT 0,
      status TEXT,
      error TEXT,
      imported_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!userCols.includes('permission_override')) {
    db.exec('ALTER TABLE users ADD COLUMN permission_override TEXT');
  }

  return db;
}

module.exports = { getDb, initDb, DB_PATH };
