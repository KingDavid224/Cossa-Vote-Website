const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AllowedStudent = require('../db/models/AllowedStudent');
const User = require('../db/models/User');
const generateCode = require('../utils/generateCode');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

const CODE_TTL_MS = 10 * 60 * 1000;       // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;     // 1 minute between resends

function normalizeMatric(matric = '') {
  return matric.trim().toUpperCase();
}
function normalizeName(name = '') {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// POST /api/auth/register  { matric, name, email }
async function register(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const email = (req.body.email || '').trim().toLowerCase();
  const name = (req.body.name || '').trim();

  if (!matric || !name || !email) {
    return res.status(400).json({ error: 'Matric number, name, and email are all required.' });
  }

  // 1. Must be on the official approved list, and the name must match.
  const approved = await AllowedStudent.findOne({ matric });
  if (!approved) {
    return res.status(403).json({
      error: 'This matric number is not on the approved voters list. Contact the Electoral Committee if you believe this is an error.',
    });
  }
  if (normalizeName(approved.name) !== normalizeName(name)) {
    return res.status(403).json({
      error: 'The name provided does not match our records for this matric number.',
    });
  }

  // 2. Block re-registering an already-verified account.
  const existing = await User.findOne({ matric });
  if (existing && existing.verified && existing.passwordHash) {
    return res.status(409).json({ error: 'An account already exists for this matric number. Please log in instead.' });
  }

  // 3. Prevent one email being reused across two different matric numbers.
  const emailInUse = await User.findOne({ email, matric: { $ne: matric } });
  if (emailInUse) {
    return res.status(409).json({ error: 'This email address is already linked to another account.' });
  }

  const code = generateCode();
  const now = Date.now();

  if (existing && existing.codeLastSentAt && now - existing.codeLastSentAt < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
  }

  await User.findOneAndUpdate(
    { matric },
    {
      matric,
      name: approved.name,
      email,
      verified: false,
      verificationCode: code,
      codeExpiresAt: now + CODE_TTL_MS,
      codeLastSentAt: now,
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  try {
    await sendVerificationEmail(email, approved.name, code);
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.status(502).json({ error: 'Could not send the verification email. Please try again shortly.' });
  }

  res.json({ message: 'Verification code sent to your email.' });
}

// POST /api/auth/resend-code  { matric }
async function resendCode(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const user = await User.findOne({ matric });
  if (!user) return res.status(404).json({ error: 'No pending registration found for this matric number.' });
  if (user.verified && user.passwordHash) return res.status(409).json({ error: 'This account is already active — please log in.' });

  const now = Date.now();
  if (user.codeLastSentAt && now - user.codeLastSentAt < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
  }

  const code = generateCode();
  user.verificationCode = code;
  user.codeExpiresAt = now + CODE_TTL_MS;
  user.codeLastSentAt = now;
  await user.save();

  try {
    await sendVerificationEmail(user.email, user.name, code);
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.status(502).json({ error: 'Could not send the verification email. Please try again shortly.' });
  }

  res.json({ message: 'A new verification code has been sent.' });
}

// POST /api/auth/verify-code  { matric, code }
async function verifyCode(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const code = (req.body.code || '').trim();

  const user = await User.findOne({ matric });
  if (!user) return res.status(404).json({ error: 'No pending registration found for this matric number.' });
  if (user.verified) return res.status(409).json({ error: 'This account is already verified.' });
  if (!user.verificationCode || user.codeExpiresAt < Date.now()) {
    return res.status(400).json({ error: 'This code has expired. Request a new one.' });
  }
  if (user.verificationCode !== code) {
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  user.verified = true;
  user.verificationCode = null;
  user.codeExpiresAt = null;
  await user.save();

  res.json({ message: 'Email verified. Now set your password.' });
}

// POST /api/auth/set-password  { matric, password }
async function setPassword(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const { password } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const user = await User.findOne({ matric });
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (!user.verified) return res.status(403).json({ error: 'Verify your email before setting a password.' });

  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();

  res.json({ message: 'Account ready. You can now log in.' });
}

// POST /api/auth/login  { matric, password }
async function login(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const { password } = req.body;

  const user = await User.findOne({ matric });
  if (!user || !user.verified || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid matric number or password.' });
  }

  const match = await bcrypt.compare(password || '', user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid matric number or password.' });

  const token = jwt.sign(
    { matric: user.matric, name: user.name, role: 'voter' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '6h' }
  );

  res.json({ token, name: user.name, matric: user.matric, hasVoted: !!user.hasVoted });
}

// GET /api/auth/me  (requires voter auth)
async function me(req, res) {
  const user = await User.findOne({ matric: req.voter.matric });
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const approved = await AllowedStudent.findOne({ matric: user.matric });

  res.json({
    matric: user.matric,
    name: user.name,
    email: user.email,
    level: approved ? approved.level : null,
    hasVoted: !!user.hasVoted,
  });
}

// POST /api/auth/forgot-password  { matric }
async function forgotPassword(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const user = await User.findOne({ matric });

  // Deliberately generic: don't reveal whether this matric has an account,
  // so this endpoint can't be used to enumerate registered students.
  const genericResponse = { message: 'If an account exists for this matric number, a reset code has been sent to its registered email.' };

  if (!user || !user.verified || !user.passwordHash) {
    return res.json(genericResponse);
  }

  const now = Date.now();
  if (user.resetCodeLastSentAt && now - user.resetCodeLastSentAt < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
  }

  const code = generateCode();
  user.resetCode = code;
  user.resetCodeExpiresAt = now + CODE_TTL_MS;
  user.resetCodeLastSentAt = now;
  await user.save();

  try {
    await sendPasswordResetEmail(user.email, user.name, code);
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.status(502).json({ error: 'Could not send the reset email. Please try again shortly.' });
  }

  res.json(genericResponse);
}

// POST /api/auth/forgot-password/resend  { matric }
async function resendResetCode(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const user = await User.findOne({ matric });
  const genericResponse = { message: 'If an account exists for this matric number, a new reset code has been sent.' };

  if (!user || !user.verified || !user.passwordHash || !user.resetCode) {
    return res.json(genericResponse);
  }

  const now = Date.now();
  if (user.resetCodeLastSentAt && now - user.resetCodeLastSentAt < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
  }

  const code = generateCode();
  user.resetCode = code;
  user.resetCodeExpiresAt = now + CODE_TTL_MS;
  user.resetCodeLastSentAt = now;
  await user.save();

  try {
    await sendPasswordResetEmail(user.email, user.name, code);
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.status(502).json({ error: 'Could not send the reset email. Please try again shortly.' });
  }

  res.json(genericResponse);
}

// POST /api/auth/reset-password  { matric, code, newPassword }
async function resetPassword(req, res) {
  const matric = normalizeMatric(req.body.matric);
  const code = (req.body.code || '').trim();
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const user = await User.findOne({ matric });
  if (!user || !user.resetCode) {
    return res.status(400).json({ error: 'No password reset was requested for this matric number.' });
  }
  if (!user.resetCodeExpiresAt || user.resetCodeExpiresAt < Date.now()) {
    return res.status(400).json({ error: 'This code has expired. Request a new one.' });
  }
  if (user.resetCode !== code) {
    return res.status(400).json({ error: 'Incorrect reset code.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetCode = null;
  user.resetCodeExpiresAt = null;
  await user.save();

  res.json({ message: 'Password updated. You can now log in with your new password.' });
}

module.exports = {
  register, resendCode, verifyCode, setPassword, login, me,
  forgotPassword, resendResetCode, resetPassword,
};
