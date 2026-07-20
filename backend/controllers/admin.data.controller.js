const AllowedStudent = require('../db/models/AllowedStudent');
const User = require('../db/models/User');
const Election = require('../db/models/Election');
const Position = require('../db/models/Position');
const Candidate = require('../db/models/Candidate');
const Vote = require('../db/models/Vote');
const { closeExpiredElections } = require('../utils/electionScheduler');

// GET /api/admin/results
async function getResults(req, res) {
  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.json({ positions: [] });

  const positions = await Position.find({ electionId: election._id }).select('name');
  const results = [];

  for (const p of positions) {
    const candidates = await Candidate.find({ positionId: p._id });
    const withCounts = await Promise.all(
      candidates.map(async (c) => ({
        id: c._id,
        name: c.name,
        status: c.status,
        votes: await Vote.countDocuments({ candidateId: c._id }),
      }))
    );
    withCounts.sort((a, b) => b.votes - a.votes);
    results.push({ position: p.name, candidates: withCounts });
  }

  res.json({ election: election.title, positions: results });
}

// GET /api/admin/candidates
async function listCandidates(req, res) {
  const positions = await Position.find().select('name');
  const positionById = new Map(positions.map((p) => [String(p._id), p]));

  const candidates = await Candidate.find().sort({ positionId: 1, name: 1 });
  const rows = candidates.map((c) => ({
    id: c._id,
    name: c.name,
    matric: c.matric,
    status: c.status,
    position: positionById.get(String(c.positionId))?.name || null,
    position_id: c.positionId,
  }));

  res.json({ candidates: rows });
}

// POST /api/admin/candidates  { name, matric, positionId }
async function addCandidate(req, res) {
  const { name, matric, positionId } = req.body;
  if (!name || !positionId) return res.status(400).json({ error: 'Name and position are required.' });

  const candidate = await Candidate.create({
    name: name.trim(),
    matric: (matric || '').trim().toUpperCase(),
    positionId,
    status: 'Pending',
  });

  res.json({ id: candidate._id, message: 'Candidate added and awaiting approval.' });
}

// PATCH /api/admin/candidates/:id/approve
async function approveCandidate(req, res) {
  await Candidate.updateOne({ _id: req.params.id }, { status: 'Approved' });
  res.json({ message: 'Candidate approved.' });
}

// DELETE /api/admin/candidates/:id
async function deleteCandidate(req, res) {
  await Candidate.deleteOne({ _id: req.params.id });
  res.json({ message: 'Candidate removed.' });
}

// GET /api/admin/voters — approved list joined with registration/voting status
async function listVoters(req, res) {
  const students = await AllowedStudent.find().sort({ name: 1 });
  const users = await User.find().select('matric email verified hasVoted');
  const userByMatric = new Map(users.map((u) => [u.matric, u]));

  const rows = students.map((s) => {
    const u = userByMatric.get(s.matric);
    return {
      matric: s.matric,
      name: s.name,
      level: s.level,
      email: u ? u.email : null,
      registered: u ? (u.verified ? 1 : 0) : 0,
      voted: u ? (u.hasVoted ? 1 : 0) : 0,
    };
  });

  res.json({ voters: rows });
}

// GET /api/admin/positions
async function listPositions(req, res) {
  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.json({ positions: [] });
  const positions = await Position.find({ electionId: election._id }).select('name');
  res.json({ positions: positions.map((p) => ({ id: p._id, name: p.name })) });
}

// POST /api/admin/positions  { name }
async function addPosition(req, res) {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Position name is required.' });

  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election exists yet — run the election seed script first.' });

  const duplicate = await Position.findOne({ electionId: election._id, name });
  if (duplicate) return res.status(409).json({ error: 'A position with this name already exists.' });

  const position = await Position.create({ electionId: election._id, name });
  res.json({ id: position._id, message: 'Position added.' });
}

// DELETE /api/admin/positions/:id
// Refuses to delete a position that still has candidates attached, so a stray
// click can't silently orphan candidates or votes — remove the candidates first.
async function deletePosition(req, res) {
  const candidateCount = await Candidate.countDocuments({ positionId: req.params.id });
  if (candidateCount > 0) {
    return res.status(409).json({ error: 'Remove all candidates from this position before deleting it.' });
  }
  await Position.deleteOne({ _id: req.params.id });
  res.json({ message: 'Position removed.' });
}

// GET /api/admin/election — full election record, for the settings screen
async function getElection(req, res) {
  // Catch an election whose window elapsed since the scheduler's last tick,
  // so the admin never sees a stale 'Open' status.
  await closeExpiredElections();

  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election exists yet.' });
  res.json({
    id: election._id,
    title: election.title,
    department: election.department,
    opensAt: election.opensAt,
    closesAt: election.closesAt,
    status: election.status,
    certifiedAt: election.certifiedAt,
  });
}

// PATCH /api/admin/election  { opensAt, closesAt }  — both ISO strings
async function updateElectionWindow(req, res) {
  const { opensAt, closesAt } = req.body;
  if (!opensAt || !closesAt) return res.status(400).json({ error: 'Both opensAt and closesAt are required.' });
  if (new Date(closesAt) <= new Date(opensAt)) {
    return res.status(400).json({ error: 'Closing time must be after the opening time.' });
  }

  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election exists yet.' });

  election.opensAt = opensAt;
  election.closesAt = closesAt;
  await election.save();

  res.json({ message: 'Election window updated.' });
}

// PATCH /api/admin/election/status  { status: 'Open' | 'Closed' }
async function setElectionStatus(req, res) {
  const status = req.body.status;
  if (!['Open', 'Closed'].includes(status)) {
    return res.status(400).json({ error: "Status must be 'Open' or 'Closed'." });
  }

  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election exists yet.' });

  election.status = status;
  await election.save();

  res.json({ message: `Election marked ${status}.`, status: election.status });
}

// POST /api/admin/election/certify
// Closes voting (if not already closed) and stamps a certification time.
// Vote casting is already blocked for any election whose status isn't
// 'Open' (see vote.controller.js), so this is the "make it official" step.
async function certifyElection(req, res) {
  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election exists yet.' });

  election.status = 'Closed';
  election.certifiedAt = new Date();
  await election.save();

  res.json({ message: 'Election closed and results certified.', certifiedAt: election.certifiedAt });
}

// POST /api/admin/voters/reset
// Wipes all cast votes and clears every voter's "hasVoted" flag, so voting
// can start over from zero. It does NOT delete registered accounts or the
// approved-students list — this is a vote reset, not an account wipe.
async function resetVoterRoll(req, res) {
  await Vote.deleteMany({});
  await User.updateMany({}, { hasVoted: false });
  res.json({ message: 'All votes cleared. Every voter can cast a fresh ballot.' });
}

module.exports = {
  getResults, listCandidates, addCandidate, approveCandidate,
  deleteCandidate, listVoters, listPositions, addPosition, deletePosition,
  getElection, updateElectionWindow, setElectionStatus, certifyElection,
  resetVoterRoll,
};
