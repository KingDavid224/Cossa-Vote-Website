const mongoose = require('../database');

const voteSchema = new mongoose.Schema({
  positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
  voterMatric: { type: String, required: true },
  castAt: { type: Date, default: Date.now },
});

// This compound unique index is what actually enforces "one vote per
// position per student" at the database level — the equivalent of the
// old SQLite UNIQUE(position_id, voter_matric) constraint. A duplicate
// insert throws a MongoServerError with code 11000, which vote.controller.js
// catches specifically.
voteSchema.index({ positionId: 1, voterMatric: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
