const Election = require('../db/models/Election');

// How often to check for elections whose window has elapsed/begun. Kept
// short (default 30s) since these are lightweight queries — plain
// updateMany calls against a tiny collection — not something that needs to
// be sparing about.
const CHECK_INTERVAL_MS = Number(process.env.ELECTION_CLOSE_CHECK_MS) || 30 * 1000;

// Auto-closes any election that is still marked 'Open' but whose closesAt
// time has already passed. This is what makes "the election closes itself
// once the window elapses" actually true — without this, status only ever
// changed when an admin manually flipped the toggle in Settings.
//
// opensAt/closesAt are stored as ISO strings (see db/models/Election.js),
// and every write path in this app produces them via `.toISOString()`, so
// they're always the same fixed-width UTC format — which means a plain
// string comparison sorts identically to a chronological comparison. That's
// what lets us compare directly against `nowIso` here without any date
// parsing on the database side.
async function closeExpiredElections() {
  const nowIso = new Date().toISOString();
  try {
    const result = await Election.updateMany(
      { status: 'Open', closesAt: { $lte: nowIso } },
      { $set: { status: 'Closed' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Auto-closed ${result.modifiedCount} election(s) whose voting window has elapsed.`);
    }
  } catch (err) {
    // Don't let a transient DB hiccup crash the interval — just log and
    // try again on the next tick.
    console.error('Election auto-close check failed:', err.message);
  }
}

// Auto-opens any election that is still marked 'Closed' but whose opensAt
// time has already arrived (and whose closesAt hasn't passed yet). This is
// the mirror of closeExpiredElections above: it's what makes "the election
// opens itself at the scheduled start time" actually true for an election
// an admin has scheduled ahead of time — without this, an election created
// with a future opensAt but left 'Closed' would never start on its own.
//
// certifiedAt is checked so a certified (finalized) election can never be
// reopened by this — certification is a one-way, admin-only action.
async function openScheduledElections() {
  const nowIso = new Date().toISOString();
  try {
    const result = await Election.updateMany(
      {
        status: 'Closed',
        certifiedAt: null,
        opensAt: { $lte: nowIso },
        closesAt: { $gt: nowIso },
      },
      { $set: { status: 'Open' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Auto-opened ${result.modifiedCount} election(s) whose voting window has begun.`);
    }
  } catch (err) {
    console.error('Election auto-open check failed:', err.message);
  }
}

// Runs both transitions together. Order matters only in the (impossible in
// practice, since opensAt < closesAt is enforced on save) edge case where
// both windows have elapsed — closing first means an election never gets
// briefly flipped back to 'Open' only to be closed again a moment later.
async function runElectionAutomation() {
  await closeExpiredElections();
  await openScheduledElections();
}

function startElectionScheduler() {
  runElectionAutomation(); // run once immediately on boot, don't wait a full interval
  setInterval(runElectionAutomation, CHECK_INTERVAL_MS);
}

module.exports = {
  startElectionScheduler,
  closeExpiredElections: runElectionAutomation, // back-compat name used by opportunistic checks elsewhere
  openScheduledElections,
  runElectionAutomation,
};
