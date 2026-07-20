const mongoose = require('../database');

// Electoral committee / admin accounts. Seeded via db/seed-admin.js,
// never self-registerable through the website.
const adminSchema = new mongoose.Schema({
  adminId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Number, default: null },
  otpLastSentAt: { type: Number, default: null },
});

module.exports = mongoose.model('Admin', adminSchema);
