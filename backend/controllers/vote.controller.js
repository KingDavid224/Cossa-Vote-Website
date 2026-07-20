const mongoose = require('../db/database');
const Election = require('../db/models/Election');
const Position = require('../db/models/Position');
const Candidate = require('../db/models/Candidate');
const Vote = require('../db/models/Vote');
const User = require('../db/models/User');
const { closeExpiredElections } = require('../utils/electionScheduler');

// GET /api/elections/current  (requires voter auth)
// Returns the most recently created election regardless of status, so the
// timeline and a voter's own receipt keep working even after the admin
// closes or certifies the election. Voting itself is still separately
// gated to only work while status is 'Open' (see castVote below).
async function getCurrentElection(req, res) {
  // Opportunistically catch an election whose window elapsed since the
  // scheduler's last tick, so status is never more than a moment stale.
  await closeExpiredElections();

  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election has been set up yet.' });

  const positions = await Position.find({ electionId: election._id }).select('name');
  const positionIds = positions.map((p) => p._id);
  const candidates = await Candidate.find({ positionId: { $in: positionIds }, status: 'Approved' });

  const ballot = positions.map((p) => ({
    id: p._id,
    name: p.name,
    candidates: candidates
      .filter((c) => String(c.positionId) === String(p._id))
      .map((c) => ({ id: c._id, name: c.name })),
  }));

  const user = await User.findOne({ matric: req.voter.matric }).select('hasVoted');

  res.json({
    election: {
      id: election._id,
      title: election.title,
      status: election.status,
      opensAt: election.opensAt,
      closesAt: election.closesAt,
      certifiedAt: election.certifiedAt,
    },
    positions: ballot,
    hasVoted: !!(user && user.hasVoted),
  });
}

// POST /api/vote  { selections: { [positionId]: candidateId } }  (requires voter auth)
async function castVote(req, res) {
  const matric = req.voter.matric;
  const selections = req.body.selections || {};

  const user = await User.findOne({ matric }).select('hasVoted');
  if (!user) return res.status(404).json({ error: 'Voter account not found.' });
  if (user.hasVoted) return res.status(409).json({ error: 'You have already voted. Each student may vote once.' });

  // Opportunistically catch an election whose window elapsed since the
  // scheduler's last tick — this is what actually closes the small gap
  // between the deadline passing and the periodic background check, so a
  // vote can never be recorded after the window has elapsed.
  await closeExpiredElections();

  const election = await Election.findOne({ status: 'Open' }).sort({ _id: -1 });
  if (!election) return res.status(404).json({ error: 'No election is currently open.' });

  const positions = await Position.find({ electionId: election._id });
  const missing = positions.filter((p) => !selections[String(p._id)]);
  if (missing.length > 0) {
    return res.status(400).json({ error: 'You must select a candidate for every position before submitting.' });
  }

  // Generated once, saved to the voter's own record inside the same
  // transaction that records their votes — this is what makes the receipt
  // retrievable later (e.g. after the voter logs out and back in), instead
  // of only existing in the browser's memory for the current session.
  const voteId = `${matric.slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
  const votedAt = new Date();

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      for (const position of positions) {
        const candidateId = selections[String(position._id)];
        const candidate = await Candidate.findOne({
          _id: candidateId,
          positionId: position._id,
          status: 'Approved',
        }).session(session);

        if (!candidate) {
          throw new Error(`Invalid candidate selected for position ${position.name}.`);
        }

        // The unique index on { positionId, voterMatric } is what actually
        // blocks a double vote at the database level — if two requests race,
        // one of these inserts throws a duplicate-key error (code 11000).
        await Vote.create([{ positionId: position._id, candidateId, voterMatric: matric }], { session });
      }

      await User.updateOne({ matric }, { hasVoted: true, voteReceiptId: voteId, votedAt }).session(session);
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You have already voted for one of these positions.' });
    }
    return res.status(400).json({ error: err.message });
  } finally {
    await session.endSession();
  }

  res.json({
    message: 'Your ballot has been recorded.',
    voteId,
  });
}

// GET /api/vote/receipt  (requires voter auth)
// Reconstructs a voter's receipt from what's actually stored in the
// database, rather than relying on anything the browser remembered — so it
// still works after a logout/login, a page refresh, or a different device.
async function getReceipt(req, res) {
  const matric = req.voter.matric;

  const user = await User.findOne({ matric }).select('hasVoted voteReceiptId votedAt');
  if (!user || !user.hasVoted) {
    return res.status(404).json({ error: 'No vote on record for this account yet.' });
  }

  const votes = await Vote.find({ voterMatric: matric });
  const positionIds = votes.map((v) => v.positionId);
  const candidateIds = votes.map((v) => v.candidateId);

  const [positionDocs, candidateDocs] = await Promise.all([
    Position.find({ _id: { $in: positionIds } }).select('name'),
    Candidate.find({ _id: { $in: candidateIds } }).select('name'),
  ]);
  const positionNameById = new Map(positionDocs.map((p) => [String(p._id), p.name]));
  const candidateNameById = new Map(candidateDocs.map((c) => [String(c._id), c.name]));

  const selections = votes.map((v) => ({
    position: positionNameById.get(String(v.positionId)) || 'Unknown position',
    candidate: candidateNameById.get(String(v.candidateId)) || 'Unknown candidate',
  }));

  res.json({
    voteId: user.voteReceiptId,
    votedAt: user.votedAt,
    selections,
  });
}

// GET /api/results/public  (no auth — anyone can view live results)
// Shows live vote counts for every position, plus a winner announcement per
// position once the election is Closed. This intentionally exposes only
// aggregate counts (candidate name + vote total), never anything that could
// identify how an individual student voted.
async function getPublicResults(req, res) {
  await closeExpiredElections();

  const election = await Election.findOne().sort({ _id: -1 });
  if (!election) return res.json({ election: null, positions: [], totalVotesCast: 0 });

  const isClosed = election.status === 'Closed';

  const positions = await Position.find({ electionId: election._id }).select('name');
  const results = [];
  let totalVotesCast = 0;

  for (const p of positions) {
    const candidates = await Candidate.find({ positionId: p._id, status: 'Approved' });
    const withCounts = await Promise.all(
      candidates.map(async (c) => ({
        id: c._id,
        name: c.name,
        votes: await Vote.countDocuments({ candidateId: c._id }),
      }))
    );
    withCounts.sort((a, b) => b.votes - a.votes);

    const positionTotal = withCounts.reduce((sum, c) => sum + c.votes, 0);
    totalVotesCast += positionTotal;

    // A winner is only announced once the election has closed, and only when
    // there's a single candidate with the highest vote count (no silent
    // "winner" during a tie).
    let winner = null;
    let tie = false;
    if (isClosed && withCounts.length > 0 && positionTotal > 0) {
      const topVotes = withCounts[0].votes;
      const topCandidates = withCounts.filter((c) => c.votes === topVotes);
      if (topCandidates.length === 1) {
        winner = { id: topCandidates[0].id, name: topCandidates[0].name, votes: topVotes };
      } else {
        tie = true;
      }
    }

    results.push({ position: p.name, candidates: withCounts, totalVotes: positionTotal, winner, tie });
  }

  res.json({
    election: {
      title: election.title,
      department: election.department,
      status: election.status,
      opensAt: election.opensAt,
      closesAt: election.closesAt,
      certifiedAt: election.certifiedAt,
    },
    positions: results,
    totalVotesCast,
  });
}

module.exports = { getCurrentElection, castVote, getReceipt, getPublicResults };
