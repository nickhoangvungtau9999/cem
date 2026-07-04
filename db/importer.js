// db/importer.js — one gate for all daily Excel imports (webhook or manual
// upload alike). Detects known sheet names inside a workbook and routes each
// to its table. Safe to re-run on the same file: log/history-style tables
// are deduped via UNIQUE indexes (INSERT OR IGNORE), master tables (employees,
// disciplinary_matrix/violations) are upserted.
const XLSX = require('xlsx');
const { padId } = require('./util');

function normStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || /^nan$/i.test(s) || s === '--') return null;
  return s;
}

// Excel (1900 date system) serial -> ISO date, computed purely in UTC.
// Reading with `cellDates:true` and converting via .toISOString() looked
// tempting, but SheetJS's Date objects there get shifted by the machine's
// local UTC offset (verified: a clean serial like 41172 came back as
// 2012-09-19T16:59:30Z instead of 2012-09-20 on this UTC+7 box — a 7h
// shift matching the local offset exactly). Reading raw numeric serials and
// converting by hand sidesteps that entirely.
function excelSerialToISO(serial) {
  const utcMs = Math.round((serial - 25569) * 86400000);
  return new Date(utcMs).toISOString().slice(0, 10);
}

function normDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return excelSerialToISO(v);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const day = Math.round(v.getTime() / 86400000);
    return new Date(day * 86400000).toISOString().slice(0, 10);
  }
  return normStr(v);
}

function normInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// ── per-sheet handlers ───────────────────────────────────────────────────────

function importEmployeeInfo(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT INTO employees (id, full_name, position, level_name, app_pos_level, mentor_id, mentor_name,
                            email, mobile_phone, hire_date, last_working_date, promotion_date, reward,
                            pickup_point, ad_user, status, updated_at)
    VALUES (@id,@full_name,@position,@level_name,@app_pos_level,@mentor_id,@mentor_name,
            @email,@mobile_phone,@hire_date,@last_working_date,@promotion_date,@reward,
            @pickup_point,@ad_user,@status, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      full_name=excluded.full_name, position=excluded.position, level_name=excluded.level_name,
      app_pos_level=excluded.app_pos_level, mentor_id=excluded.mentor_id, mentor_name=excluded.mentor_name,
      email=excluded.email, mobile_phone=excluded.mobile_phone, hire_date=excluded.hire_date,
      last_working_date=excluded.last_working_date, promotion_date=excluded.promotion_date,
      reward=excluded.reward, pickup_point=excluded.pickup_point, ad_user=excluded.ad_user,
      status=excluded.status, updated_at=datetime('now')
  `);

  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const id = padId(r['EmployeeID']);
      if (!id) { skipped++; continue; }
      const lastWorking = normDate(r['Last Working Date']);
      stmt.run({
        id,
        full_name: normStr(r['Full Name']),
        position: normStr(r['Position']),
        level_name: normInt(r['Level Name']),
        app_pos_level: normInt(r['App pos Level']),
        mentor_id: r['Mentor id'] != null ? padId(r['Mentor id']) : null,
        mentor_name: normStr(r['Mentor']),
        email: normStr(r['Email']),
        mobile_phone: r['Mobile Phone'] != null ? String(r['Mobile Phone']).trim() : null,
        hire_date: normDate(r['Hire Date']),
        last_working_date: lastWorking,
        promotion_date: normDate(r['Promotion Date']),
        reward: normStr(r['Reward']),
        pickup_point: normStr(r['Pickup Point']),
        ad_user: normStr(r['ADUser']),
        status: lastWorking ? 'Inactive' : 'Active',
      });
      added++;
    }
  });
  run(rows);
  return { added, skipped };
}

function importWorkHistory(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO employee_work_history (employee_id, action_change, effective_date, position, department)
    VALUES (?, ?, ?, ?, ?)
  `);
  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const id = padId(r['ID']);
      if (!id) { skipped++; continue; }
      const info = stmt.run(id, normStr(r['Action Change']), normDate(r['Effective Date']), normStr(r['Position']), normStr(r['Department']));
      if (info.changes) added++; else skipped++;
    }
  });
  run(rows);
  return { added, skipped };
}

function importCoupleList(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO employee_relations (employee_id, relation, relation_employee_id, relation_name, relation_position)
    VALUES (?, ?, ?, ?, ?)
  `);
  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const id = padId(r['ID']);
      if (!id) { skipped++; continue; }
      const relEmpId = r['RelationID'] != null ? padId(r['RelationID']) : null;
      const info = stmt.run(id, normStr(r['Relation']), relEmpId, normStr(r['Relation Name']), normStr(r['Relation Pos']));
      if (info.changes) added++; else skipped++;
    }
  });
  run(rows);
  return { added, skipped };
}

// Disciplinary Matrix sheet is two side-by-side tables sharing rows:
// cols 0-3 = level definitions (Level, Action, Expiration, Scope), one row
// per level code. cols 4-10 = violation catalogue (Category, Violations,
// 1st..5th offense), Category forward-filled down the column. Real header
// row is at raw index 1 (index 0 is a merged "Offense" title over cols 6-10).
function importDisciplinaryMatrix(db, sheet) {
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const dataRows = raw.slice(2); // skip title row + header row

  const levelStmt = db.prepare(`
    INSERT INTO disciplinary_matrix (level_code, action_name, expiration_months, scope)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(level_code) DO UPDATE SET action_name=excluded.action_name,
      expiration_months=excluded.expiration_months, scope=excluded.scope
  `);
  const violStmt = db.prepare(`
    INSERT INTO disciplinary_violations (category, violation, offense_1st, offense_2nd, offense_3rd, offense_4th, offense_5th)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category, violation) DO UPDATE SET
      offense_1st=excluded.offense_1st, offense_2nd=excluded.offense_2nd, offense_3rd=excluded.offense_3rd,
      offense_4th=excluded.offense_4th, offense_5th=excluded.offense_5th
  `);

  let added = 0, skipped = 0;
  let currentCategory = null;
  const run = db.transaction((rowsArr) => {
    for (const row of rowsArr) {
      const levelCode = normStr(row[0]);
      if (levelCode) {
        levelStmt.run(levelCode, normStr(row[1]), row[2] != null ? String(row[2]).trim() : null, normStr(row[3]));
        added++;
      }
      const category = normStr(row[4]);
      if (category) currentCategory = category;
      const violation = normStr(row[5]);
      if (violation) {
        violStmt.run(currentCategory, violation, normStr(row[6]), normStr(row[7]), normStr(row[8]), normStr(row[9]), normStr(row[10]));
        added++;
      }
      if (!levelCode && !violation) skipped++;
    }
  });
  run(dataRows);
  return { added, skipped };
}

function importCctv(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT INTO cctv_incidents (gaming_date, incident_file_number, specific, pos, employee_id, nick_name,
                                 narrative, location, sublocation, incident_type, action_taken, by_id, mgr_remark)
    VALUES (@gaming_date,@incident_file_number,@specific,@pos,@employee_id,@nick_name,
            @narrative,@location,@sublocation,@incident_type,@action_taken,@by_id,@mgr_remark)
    ON CONFLICT(incident_file_number, employee_id) DO UPDATE SET
      action_taken=excluded.action_taken, mgr_remark=excluded.mgr_remark, narrative=excluded.narrative
  `);
  const nickStmt = db.prepare(`UPDATE employees SET nick_name = ? WHERE id = ? AND (nick_name IS NULL OR nick_name = '')`);

  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const employeeId = padId(r['EmployeeID']);
      const incidentFileNumber = normStr(r['Incident File Number']);
      if (!employeeId || !incidentFileNumber) { skipped++; continue; }
      const nickName = normStr(r['Nick Name']);
      stmt.run({
        gaming_date: normDate(r['Gaming Date']),
        incident_file_number: incidentFileNumber,
        specific: normStr(r['Specific']),
        pos: normStr(r['POS']),
        employee_id: employeeId,
        nick_name: nickName,
        narrative: normStr(r['Narrative']),
        location: normStr(r['Location']),
        sublocation: normStr(r['Sublocation']),
        incident_type: normStr(r['Incident Type']),
        action_taken: normStr(r['Action Taken']),
        by_id: r['By (ID)'] != null ? padId(r['By (ID)']) : null,
        mgr_remark: normStr(r['MGR Remark']),
      });
      if (nickName) nickStmt.run(nickName, employeeId);
      added++;
    }
  });
  run(rows);
  return { added, skipped };
}

function importAttendance(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO attendance_log (notice_date, employee_id, position, name, shift, att_type, start_date,
                                           end_date, days, reason, document_type, mgr_acknowledge, doc_submission_date, mgr_action)
    VALUES (@notice_date,@employee_id,@position,@name,@shift,@att_type,@start_date,
            @end_date,@days,@reason,@document_type,@mgr_acknowledge,@doc_submission_date,@mgr_action)
  `);
  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const employeeId = padId(r['ID']);
      if (!employeeId) { skipped++; continue; }
      const attType = normStr(r['Att. Type']);
      const info = stmt.run({
        notice_date: normDate(r['Notice Date']),
        employee_id: employeeId,
        position: normStr(r['Position']),
        name: normStr(r['Name']),
        shift: normStr(r['Shift']),
        att_type: attType ? attType.toUpperCase() : null,
        start_date: normDate(r['Start Date']),
        end_date: normDate(r['End Date']),
        days: normInt(r['Days']),
        reason: normStr(r['Reason']),
        document_type: normStr(r['Document Type']),
        mgr_acknowledge: normStr(r['Mgr Acknowledge']),
        doc_submission_date: normDate(r['Doc Submission Date']),
        mgr_action: normStr(r['Mgr Action']),
      });
      if (info.changes) added++; else skipped++;
    }
  });
  run(rows);
  return { added, skipped };
}

function importTraining(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO training_records (training_date, month, game, employee_id)
    VALUES (?, ?, ?, ?)
  `);
  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const employeeId = padId(r['ID']);
      if (!employeeId) { skipped++; continue; }
      const info = stmt.run(normDate(r['Date']), normStr(r['Month']), normStr(r['Game']), employeeId);
      if (info.changes) added++; else skipped++;
    }
  });
  run(rows);
  return { added, skipped };
}

function importExposure(db, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO exposure_log (employee_id, function, game, game_date)
    VALUES (?, ?, ?, ?)
  `);
  let added = 0, skipped = 0;
  const run = db.transaction((rowsArr) => {
    for (const r of rowsArr) {
      const employeeId = padId(r['EmployeeID']);
      if (!employeeId) { skipped++; continue; }
      const info = stmt.run(employeeId, normStr(r['Function']), normStr(r['GameX']), normDate(r['Game_Date']));
      if (info.changes) added++; else skipped++;
    }
  });
  run(rows);
  return { added, skipped };
}

const SHEET_HANDLERS = {
  'employee info': { fn: importEmployeeInfo, label: 'Employee Info' },
  'tg transactions': { fn: importWorkHistory, label: 'TG Transactions' },
  'couple list': { fn: importCoupleList, label: 'Couple List' },
  'disciplinary matrix': { fn: importDisciplinaryMatrix, label: 'Disciplinary Matrix' },
  'cctv daily record': { fn: importCctv, label: 'CCTV Daily Record' },
  'attendance log': { fn: importAttendance, label: 'attendance log' },
  'training record': { fn: importTraining, label: 'Training Record' },
  'exposure': { fn: importExposure, label: 'Exposure' },
};

// Import every recognized sheet found in the workbook at filePath. Unknown
// sheets are reported back as skipped-with-no-handler so the caller can warn.
function importWorkbook(db, filePath, filename, importedBy) {
  const wb = XLSX.readFile(filePath);
  const results = [];
  const logStmt = db.prepare(`
    INSERT INTO import_log (filename, sheet_name, rows_added, rows_skipped, status, error, imported_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sheetName of wb.SheetNames) {
    const key = sheetName.trim().toLowerCase();
    const handler = SHEET_HANDLERS[key];
    if (!handler) {
      results.push({ sheet: sheetName, status: 'skipped', reason: 'no handler for this sheet name' });
      continue;
    }
    try {
      const { added, skipped } = handler.fn(db, wb.Sheets[sheetName]);
      logStmt.run(filename, handler.label, added, skipped, 'ok', null, importedBy || null);
      results.push({ sheet: handler.label, status: 'ok', added, skipped });
    } catch (e) {
      logStmt.run(filename, sheetName, 0, 0, 'error', e.message, importedBy || null);
      results.push({ sheet: sheetName, status: 'error', error: e.message });
    }
  }
  return results;
}

module.exports = { importWorkbook, SHEET_HANDLERS, normStr, normDate, normInt };
