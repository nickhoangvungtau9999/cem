// db/util.js — shared helpers. EmployeeID is always zero-padded to 5 digits
// everywhere it's received (manual entry, search filters, Excel import) —
// employees.id is stored as "00584", never "584".
function padId(id) {
  if (id === null || id === undefined || id === '') return '';
  return String(id).trim().replace(/\.0$/, '').padStart(5, '0');
}

module.exports = { padId };
