const mongoose = require('../database');

const candidateSchema = new mongoose.Schema({
  positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', required: true },
  name: { type: String, required: true },
  matric: { type: String, default: '' },
  status: { type: String, required: true, default: 'Pending' }, // 'Pending' | 'Approved'
});

module.exports = mongoose.model('Candidate', candidateSchema);
