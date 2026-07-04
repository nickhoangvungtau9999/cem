// db/constants.js — domain constants for Table Games staff app.

// Rank ladder by Position title (1 = lowest). Used for display/seniority and
// as a fallback when an employee's own level_name isn't set.
const POSITION_LEVELS = {
  'Dealer': 1,
  'Junior Dealer': 1,
  'Dealer Inspector': 2,
  'Table Games Admin': 2,
  'Gaming Technical Supervisor': 2,
  'Floor Supervisor': 2,
  'Executive Assistant to CCO': 2,
  'Floater': 3,
  'PIT Manager': 4,
  'Senior PIT Manager': 4,
  'Table Games Training Manager': 4,
  'Casino Shift Manager': 5,
  'Casino Senior Shift Manager': 6,
  'Director of Casino Operations': 7,
  'Vice President of Casino Operations': 8,
  'Vice President of Casino Operations - Table Games': 8,
  'Chief Casino Officer': 9,
};

// Prefer the real level_name imported from the Employee Info sheet — it's
// authoritative per-employee data. POSITION_LEVELS is only a fallback guess
// for employees missing that field (e.g. added by hand without it).
function resolveLevel(employee) {
  if (!employee) return 0;
  const n = parseInt(employee.level_name, 10);
  if (!Number.isNaN(n)) return n;
  if (employee.position && POSITION_LEVELS[employee.position] !== undefined) {
    return POSITION_LEVELS[employee.position];
  }
  return 0;
}

// Permission model: every employee carries an `app_pos_level` (1-5) imported
// straight from the Employee Info sheet ("App pos Level" column). That single
// number drives what the linked user account can do across every module —
// there is no separate per-module matrix to keep in sync.
//   1-2 -> view only
//   3-4 -> view + edit
//   5   -> view + edit + approve (disciplinary case approval, etc.)
// Admins (users.role === 'admin') always bypass this and get 'approve'.
const PERMISSION_LEVELS = ['none', 'view', 'edit', 'approve'];
const PERMISSION_RANK = PERMISSION_LEVELS.reduce((m, p, i) => { m[p] = i; return m; }, {});

function tierForAppPosLevel(level) {
  const n = parseInt(level, 10);
  if (Number.isNaN(n) || n <= 0) return 'none';
  if (n <= 2) return 'view';
  if (n <= 4) return 'edit';
  return 'approve';
}

// Minimum app_pos_level required to approve a disciplinary case.
const MIN_APPROVE_APP_POS_LEVEL = 5;

// Performance evaluation checklist — quick-pick criteria for the employee
// Performance tab. Qualitative coaching/feedback layer, distinct from the
// formal Disciplinary case system. Grouped by category, positive/negative.
const PERFORMANCE_CRITERIA = {
  positive: [
    { category: 'Game Operation & Technical Skills', items: [
      'Deals/spins accurately per game rules',
      'Strong knowledge of table game procedures (BJ, Baccarat, Roulette, Sic Bo)',
      'Maintains correct, consistent game pace',
      'Handles chips and payouts precisely',
      'Rarely makes dealing or calculation errors',
      'Clean, professional hand mechanics',
      'Follows opening/closing table procedures correctly',
      'Smooth shuffle/deal technique, minimal downtime',
      'Quickly spots irregular or late bets',
      'Stays accurate and composed during high-volume play',
    ]},
    { category: 'Game Protection & Risk Control', items: [
      'Detects suspicious player behavior early',
      'Helps prevent cheating and collusion attempts',
      'Protects cards/chips from manipulation',
      'Calls supervisor promptly when needed',
      'Maintains full awareness of table activity',
      'Handles disputes calmly and correctly',
      'Coordinates well with CCTV/surveillance',
      'Ensures all bets are placed before dealing',
      'Controls late bets effectively',
      'Follows AML and gaming compliance rules',
    ]},
    { category: 'Customer Service (Players)', items: [
      'Friendly, professional attitude with players',
      'Greets players proactively',
      'Keeps positive energy at the table',
      'Stays calm with difficult players',
      'Explains rules clearly to players',
      'Stays neutral, no favoritism',
      'Engages players appropriately',
      'Avoids arguments with players',
      'Maintains a polite tone at all times',
      'Enhances the overall player experience',
    ]},
    { category: 'Teamwork & Communication', items: [
      'Communicates clearly with inspectors/supervisors',
      'Responds quickly to instructions',
      'Supports teammates during busy hours',
      'Reports issues accurately and promptly',
      'Smooth handover between shifts',
      'Cooperates well within the pit team',
      'Keeps communication concise and professional',
      'Escalates issues through proper channels',
      'Follows the chain of command',
      'Gives clear, timely game-related updates',
    ]},
    { category: 'Discipline & Professionalism', items: [
      'Arrives on time, ready for shift',
      'Proper grooming and uniform standards',
      'Never leaves the table unattended',
      'Strictly follows SOP',
      'Stays focused throughout the shift',
      'Avoids unnecessary talking on the floor',
      'Keeps the table clean and organized',
      'Follows break schedule properly',
      'Maintains integrity at all times',
      'Consistently meets performance standards',
    ]},
  ],
  negative: [
    { category: 'Operational Errors', items: [
      'Incorrect dealing or payout',
      'Slow game pace, affects table revenue',
      'Frequent calculation mistakes',
      'Mismanages chip tray/float',
      'Skips or rushes dealing procedures',
      'Incorrect game opening/closing',
      'Poor card-handling technique',
      'Misses irregular or late bets',
      'Fails to control late betting',
      'Inconsistent, uneven game flow',
    ]},
    { category: 'Game Protection Risks', items: [
      'Fails to detect cheating attempts',
      'Allows unauthorized player actions at table',
      'Weak table control/awareness',
      "Doesn't call supervisor when required",
      'Poor surveillance/CCTV awareness',
      'Exposes cards/chips improperly',
      'Ignores suspicious player behavior',
      'Violates game protection procedures',
      'Mishandles player disputes',
      'Breaks AML/compliance procedures',
    ]},
    { category: 'Poor Customer Service', items: [
      'Rude or unfriendly toward players',
      'Argues with players',
      'Shows bias/favoritism toward players',
      'Fails to greet players',
      'Poor communication with guests',
      'Visibly frustrated or impatient',
      'Ignores reasonable player requests',
      'Uses inappropriate language',
      'Disengaged, low energy at the table',
      'Damages the player experience',
    ]},
    { category: 'Communication Issues', items: [
      'Fails to report incidents',
      'Gives incorrect information',
      'Poor coordination with the team',
      'Disrespectful toward supervisors',
      'Talks excessively during the game',
      'Miscommunicates table/game status',
      'Delays escalating issues',
      'Causes confusion at the table',
      "Doesn't follow instructions",
      'Breaks communication protocol',
    ]},
    { category: 'Discipline & Compliance Violations', items: [
      'Late arrival / absenteeism',
      'Leaves the table without permission',
      'Incorrect uniform or grooming',
      'Violates SOP',
      'Careless behavior during shift',
      'Accepts tips improperly',
      'Breaches confidentiality',
      'Collusion or dishonest behavior',
      'Causes financial loss to the casino',
      'Damages casino reputation',
    ]},
  ],
};

module.exports = {
  POSITION_LEVELS,
  resolveLevel,
  PERMISSION_LEVELS,
  PERMISSION_RANK,
  tierForAppPosLevel,
  MIN_APPROVE_APP_POS_LEVEL,
  PERFORMANCE_CRITERIA,
};
