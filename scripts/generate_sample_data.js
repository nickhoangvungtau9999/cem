// Generates a synthetic multi-sheet workbook matching the real data schema,
// with fully fictional employees — safe to commit to git and use for testing
// in any environment (no real PII). Run: node scripts/generate_sample_data.js
const XLSX = require('xlsx');
const path = require('path');

const FIRST = ['Minh', 'Anh', 'Hoa', 'Linh', 'Tuan', 'Trang', 'Nam', 'Huong', 'Duc', 'Thao', 'Long', 'Hanh', 'Phong', 'Mai', 'Son'];
const LAST = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Vo', 'Dang', 'Bui', 'Do'];
const POSITIONS = [
  { title: 'Dealer', level: 1, weight: 12 },
  { title: 'Dealer Inspector', level: 2, weight: 5 },
  { title: 'Floor Supervisor', level: 3, weight: 4 },
  { title: 'PIT Manager', level: 4, weight: 3 },
  { title: 'Casino Shift Manager', level: 5, weight: 2 },
  { title: 'Casino Senior Shift Manager', level: 6, weight: 1 },
];
const GAMES = ['BA', 'BL', 'CH', 'CP', 'RL'];
const PICKUP_POINTS = ['Sample Point 1', 'Sample Point 2', 'Sample Point 3'];

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }
function pad(n) { return String(n).padStart(5, '0'); }
function fullName() { return `${pick(LAST)} ${pick(FIRST)} ${pick(FIRST)}`.toUpperCase(); }
function isoDate(daysAgo) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); }

const positionPool = [];
POSITIONS.forEach((p) => { for (let i = 0; i < p.weight; i++) positionPool.push(p); });

const N = 30;
const employees = [];
for (let i = 0; i < N; i++) {
  const id = 90001 + i;
  const pos = pick(positionPool);
  employees.push({
    EmployeeID: id,
    'Full Name': fullName(),
    Position: pos.title,
    'Level Name': pos.level,
    'Mentor id': null,
    Mentor: null,
    Email: `sample.user${i + 1}@example.com`,
    'Mobile Phone': `09${String(10000000 + rand(89999999))}`,
    'Hire Date': isoDate(365 * (1 + rand(8))),
    'Last Working Date': '--',
    'Promotion Date': null,
    Reward: null,
    'Pickup Point': pick(PICKUP_POINTS),
    ADUser: null,
    // Only a handful get app access, at each permission tier (1-5), matching the real data shape.
    'App pos Level': i < 6 ? (i % 5) + 1 : null,
  });
}

const workHistory = [];
employees.forEach((e) => {
  workHistory.push({ ID: e.EmployeeID, 'Action Change': 'Begin', 'Effective Date': e['Hire Date'], Position: e.Position, Department: 'Table Games - Sample' });
  if (Math.random() > 0.6) {
    workHistory.push({ ID: e.EmployeeID, 'Action Change': 'Promotion', 'Effective Date': isoDate(rand(300)), Position: e.Position, Department: 'Table Games - Sample' });
  }
});

const coupleList = [];
for (let i = 0; i < 4; i++) {
  const a = employees[i * 2];
  const b = employees[i * 2 + 1];
  coupleList.push({ ID: a.EmployeeID, Name: a['Full Name'], Position: a.Position, Relation: 'Sibling', RelationID: b.EmployeeID, 'Relation Name': b['Full Name'], 'Relation Pos': b.Position });
  coupleList.push({ ID: b.EmployeeID, Name: b['Full Name'], Position: b.Position, Relation: 'Sibling', RelationID: a.EmployeeID, 'Relation Name': a['Full Name'], 'Relation Pos': a.Position });
}

// Disciplinary Matrix: generic HR policy structure (not employee data), same
// shape as the real sheet — title row, header row, then level defs (cols 0-3)
// alongside the violation catalogue (cols 4-10), Category forward-filled.
const disciplinaryMatrixRows = [
  [null, null, null, null, null, null, 'Offense', null, null, null, null],
  ['Level', 'Action', 'Expiration', null, 'Category', 'Violations', '1st', '2nd', '3rd', '4th', '5th'],
  ['C1', '1st Counseling', 1, 'internal', 'Attendance', 'Late arrival (<15 min)', 'C1', 'C2', 'VW', 'WW', 'FWW'],
  ['C2', '2nd Counseling', 3, 'internal', null, 'Late arrival (>15 min)', 'C2', 'VW', 'WW', 'FWW', 'S'],
  ['VW', 'Verbal Warning', 6, 'HR', null, 'Early departure without approval', 'VW', 'WW', 'FWW', 'S', 'T'],
  ['WW', 'Written Warning', 12, 'HR', null, 'Failure to clock in/out', 'C1', 'C2', 'VW', 'WW', 'FWW'],
  ['FWW', 'Final Written Warning', 18, 'HR', null, 'Unauthorized absence (1 day)', 'VW', 'WW', 'FWW', 'S', 'T'],
  ['S', 'Suspension (1-7 days)', 24, 'HR', null, 'No Call No Show', 'VW', 'WW', 'FWW', 'S', 'T'],
  ['T', 'Termination', 'permanent', 'HR', null, 'Excessive absenteeism', 'C2', 'VW', 'WW', 'FWW', 'S'],
];

const cctv = [];
for (let i = 0; i < 8; i++) {
  const e = pick(employees);
  cctv.push({
    'Gaming Date': isoDate(rand(20)),
    'Incident File Number': `SAMPLE${1000 + i}`,
    Specific: pick(['PROCEDURE DEVIATION', 'BET TIMING ISSUE', 'PAYOUT DISCREPANCY']),
    POS: pick(['DLR', 'DI', 'FS']),
    EmployeeID: e.EmployeeID,
    'Nick Name': pick(FIRST),
    Narrative: 'Sample synthetic narrative describing a minor table procedure deviation, for testing only.',
    Location: `PIT0${1 + rand(9)}`,
    Sublocation: `SB0${100 + rand(20)}`,
    'Incident Type': 'GAMING',
    'Action Taken': null,
    'By (ID)': null,
    'MGR Remark': null,
  });
}

const attendance = [];
// A couple of employees get repeat NS/Late patterns so the repeat-violation flag logic has something to show.
[employees[10], employees[11]].forEach((e, idx) => {
  const type = idx === 0 ? 'NS' : 'Late';
  const count = idx === 0 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    attendance.push({
      'Notice Date': isoDate(rand(60)), Position: e.Position, Name: e['Full Name'], ID: e.EmployeeID,
      Shift: pick(['D', 'M', 'N']), 'Att. Type': type, 'Start Date': isoDate(rand(60)), 'End Date': isoDate(rand(60)),
      Days: 1, Reason: 'Sample reason', 'Document Type': 'Approved', 'Mgr Acknowledge': 'Sample Mgr',
      'Doc Submission Date': isoDate(rand(60)), 'Mgr Action': null,
    });
  }
});
for (let i = 0; i < 10; i++) {
  const e = pick(employees);
  attendance.push({
    'Notice Date': isoDate(rand(60)), Position: e.Position, Name: e['Full Name'], ID: e.EmployeeID,
    Shift: pick(['D', 'M', 'N']), 'Att. Type': pick(['SL', 'EO', 'PT']), 'Start Date': isoDate(rand(60)), 'End Date': isoDate(rand(60)),
    Days: 1, Reason: 'Sample reason', 'Document Type': 'Approved', 'Mgr Acknowledge': 'Sample Mgr',
    'Doc Submission Date': isoDate(rand(60)), 'Mgr Action': null,
  });
}

const training = [];
for (let i = 0; i < 15; i++) {
  const e = pick(employees);
  const d = isoDate(rand(120));
  training.push({ Date: d, Month: new Date(d).toLocaleString('en-US', { month: 'short' }), Game: pick(GAMES), ID: e.EmployeeID, Name: e['Full Name'] });
}

const exposure = [];
for (let i = 0; i < 20; i++) {
  const e = pick(employees);
  exposure.push({ EmployeeID: e.EmployeeID, Function: pick(['DLR', 'SUP']), GameX: pick(GAMES), Game_Date: isoDate(rand(10)) });
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employees), 'Employee Info');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workHistory), 'TG Transactions');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coupleList), 'Couple List');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(disciplinaryMatrixRows), 'Disciplinary Matrix');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cctv), 'CCTV Daily Record');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendance), 'attendance log');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(training), 'Training Record');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exposure), 'Exposure');

const outPath = path.join(__dirname, '..', 'seed-files', 'sample_data.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
