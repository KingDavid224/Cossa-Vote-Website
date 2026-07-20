const mongoose = require('../database');

const electionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  department: { type: String, required: true, default: 'Computer Science' },
  opensAt: { type: String, required: true },   // ISO string, same format the old SQLite column stored
  closesAt: { type: String, required: true },
  status: { type: String, required: true, default: 'Open' }, // 'Open' | 'Closed'
  certifiedAt: { type: Date, default: null },  // set once results are certified via /admin/election/certify
});

module.exports = mongoose.model('Election', electionSchema);
