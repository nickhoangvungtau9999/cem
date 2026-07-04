# CLAUDE.md — casino-staff-app

Table Games staff management app, rebuilt from scratch (replaces `casino-app3` at
`D:\CEM Project\casino-app3`, kept only for reference). Node.js/Express +
better-sqlite3 + EJS (server-rendered, no build step — matches the portable-node
deployment used across every prior version of this app on this machine).

## Running

No `node`/`npm` on PATH — use the bundled runtime:
```
./node-v22.16.0-win-x64/node.exe server.js
```
Default accounts: `admin`/`admin123` (admin, full bypass), `user`/`user123` (no
linked employee, tier `none`). Server listens on port 3000 (`.env`).

## Architecture

- **Permission model**: a single number drives everything — `employees.app_pos_level`
  (1-5, imported straight from the Employee Info sheet's "App pos Level" column).
  1-2 = view, 3-4 = edit, 5 = approve. No per-module matrix. `users.employee_id`
  links a login to its employee record; `users.permission_override` (Settings)
  lets an admin override the derived tier for exceptions. See `middleware/permissions.js`.
- **Rank ladder** (`employees.level_name`, business seniority 1-9) is a *different*
  field from `app_pos_level` (system access tier) — don't conflate them. Voting
  eligibility uses `level_name`; app permissions use `app_pos_level`.
- **EmployeeID is always zero-padded to 5 digits** (`db/util.js: padId()`) at every
  input point — manual entry, search, Excel import. `employees.id` is `"00584"`,
  never `"584"`.
- **Import**: one gate, `db/importer.js: importWorkbook()`. Detects sheet names
  (case-insensitive) in an uploaded workbook and routes each to its table. Safe
  to re-run on the same file — log/history tables (work history, attendance,
  training, exposure, CCTV, relations) dedupe via UNIQUE indexes; master/reference
  tables (employees, disciplinary_matrix, disciplinary_violations) upsert.
- **Dates from Excel**: read raw numeric serials (NOT `cellDates:true` — SheetJS's
  Date-object conversion was verified to shift by the machine's local UTC offset,
  e.g. 7h off on this UTC+7 box). `db/importer.js: excelSerialToISO()` converts
  by hand instead.
- **Disciplinary Matrix sheet** is two side-by-side tables sharing rows: cols 0-3
  are level definitions (C1/C2/VW/WW/FWW/S/T), cols 4-10 are the violation
  catalogue (Category forward-filled, 1st-5th offense escalation). See the
  comment in `importDisciplinaryMatrix()` before touching that sheet.
- **Disciplinary case creation** (`/api/disciplinary/suggest`) counts a given
  employee's prior *Approved* cases for the same violation text to guess which
  escalation level (1st..5th offense) applies next, via `disciplinary_violations`.

## Modules (routes/ + matching views/<module>/ + public/js/<module>.js)

employees, disciplinary, cctv, attendance, training, exposure, performance,
voting, settings (admin-only: users + import center). CCTV incidents and
Attendance repeat-violations both feed into `disciplinary_cases` (source
column tracks origin) rather than having their own approval workflow.

## Known gaps / next steps

- `import_log.rows_added` counts *processed* rows for upsert-style sheets
  (Employee Info, Disciplinary Matrix, CCTV), not strictly "new" rows — cosmetic
  only, no duplicate data is created.
- No automated test suite — verify changes by starting the server and hitting
  the relevant `/api/*` routes (see conversation history / ask the user for the
  QA account pattern used during initial build).
