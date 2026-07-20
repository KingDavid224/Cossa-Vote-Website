const mongoose = require('../database');

// Accounts created through the registration flow.
// A document only becomes a usable login once verified = true AND passwordHash is set.
//
// NOTE: unlike the old SQLite schema, MongoDB has no foreign keys, so
// "matric must exist in AllowedStudent" is NOT enforced by the database —
// it's enforced entirely in auth.controller.js's register() function,
// which checks AllowedStudent before ever creating a User. Don't bypass
// that check anywhere else in the code.
const userSchema = new mongoose.Schema({
  matric: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, default: null },
  verified: { type: Boolean, default: false },
  verificationCode: { type: String, default: null },
  codeExpiresAt: { type: Number, default: null },   // epoch ms
  codeLastSentAt: { type: Number, default: null },  // epoch ms
  hasVoted: { type: Boolean, default: false },
  voteReceiptId: { type: String, default: null },  // set once, at cast time — lets the receipt be re-fetched after logout
  votedAt: { type: Date, default: null },
  // Kept separate from verificationCode/codeExpiresAt (registration) so an
  // in-progress password reset can never interfere with, or be confused
  // with, an in-progress email verification.
  resetCode: { type: String, default: null },
  resetCodeExpiresAt: { type: Number, default: null },  // epoch ms
  resetCodeLastSentAt: { type: Number, default: null }, // epoch ms
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

module.exports = mongoose.model('User', userSchema);
