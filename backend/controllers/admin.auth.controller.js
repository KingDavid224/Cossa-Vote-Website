const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../db/models/Admin');
const generateCode = require('../utils/generateCode');
const { sendAdminOtpEmail } = require('../utils/mailer');

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

// POST /api/admin/login/request-otp  { adminId, password }
async function requestOtp(req, res) {
  const adminId = (req.body.adminId || '').trim();
  const { password } = req.body;

  const admin = await Admin.findOne({ adminId });
  if (!admin) return res.status(401).json({ error: 'Invalid admin ID or password.' });

  const match = await bcrypt.compare(password || '', admin.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid admin ID or password.' });

  const now = Date.now();
  if (admin.otpLastSentAt && now - admin.otpLastSentAt < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
  }

  const code = generateCode();
  admin.otpCode = code;
  admin.otpExpiresAt = now + OTP_TTL_MS;
  admin.otpLastSentAt = now;
  await admin.save();

  try {
    await sendAdminOtpEmail(admin.email, admin.name, code);
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.status(502).json({ error: 'Could not send the verification email. Please try again shortly.' });
  }

  res.json({ message: 'A sign-in code has been sent to your registered email.' });
}

// POST /api/admin/login/verify-otp  { adminId, otp }
async function verifyOtp(req, res) {
  const adminId = (req.body.adminId || '').trim();
  const otp = (req.body.otp || '').trim();

  const admin = await Admin.findOne({ adminId });
  if (!admin) return res.status(401).json({ error: 'Invalid admin ID.' });
  if (!admin.otpCode || admin.otpExpiresAt < Date.now()) {
    return res.status(400).json({ error: 'This code has expired. Request a new one.' });
  }
  if (admin.otpCode !== otp) {
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  admin.otpCode = null;
  admin.otpExpiresAt = null;
  await admin.save();

  const token = jwt.sign(
    { adminId: admin.adminId, name: admin.name, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '4h' }
  );

  res.json({ token, name: admin.name, adminId: admin.adminId });
}

module.exports = { requestOtp, verifyOtp };
