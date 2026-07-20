const mongoose = require('../database');

const positionSchema = new mongoose.Schema({
  electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
  name: { type: String, required: true },
});

module.exports = mongoose.model('Position', positionSchema);
