// Sends transactional email via Resend's HTTP API (https://resend.com).
//
// We use plain HTTPS instead of SMTP/nodemailer because most cloud hosts
// (Render's free tier included) block outbound SMTP ports 25/465/587,
// which silently breaks OTP delivery. Resend's REST API only needs port
// 443, so it works everywhere — including Render's free plan.
//
// Setup:
//   1. Sign up free at https://resend.com
//   2. Create an API key: https://resend.com/api-keys
//   3. Verify a sender:
//        - Fastest (no domain needed): use 'onboarding@resend.dev' as
//          EMAIL_FROM. This only works for sending to the email address
//          you signed up to Resend with, so it's ONLY good for your own
//          testing — not for real students.
//        - For real use: add + verify your own domain under
//          https://resend.com/domains (a few DNS records, takes minutes to
//          a few hours to verify), then set EMAIL_FROM to something like
//          'noreply@yourdomain.com'.
//
// Env vars needed:
//   RESEND_API_KEY  - from https://resend.com/api-keys
//   EMAIL_FROM      - a verified sender/domain address in Resend
//   EMAIL_FROM_NAME - display name, e.g. 'COSSA Vote'

const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, text, html }) {
  const fromName = process.env.EMAIL_FROM_NAME || 'COSSA Vote';
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${process.env.EMAIL_FROM}>`,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }

  return res.json();
}

async function sendVerificationEmail(to, name, code) {
  await sendEmail({
    to,
    subject: 'Your COSSA Vote verification code',
    text: `Hi ${name},\n\nYour verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.\n\n— COSSA Electoral Committee`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;">
        <p>Hi ${name},</p>
        <p>Your verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#2B1B12;">${code}</p>
        <p style="color:#666;font-size:13px;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
        <p style="color:#666;font-size:13px;">— COSSA Electoral Committee</p>
      </div>
    `,
  });
}

async function sendAdminOtpEmail(to, name, code) {
  await sendEmail({
    to,
    subject: 'COSSA Vote admin sign-in code',
    text: `Hi ${name},\n\nYour admin sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, secure your account immediately.\n\n— COSSA Electoral Committee`,
  });
}

async function sendPasswordResetEmail(to, name, code) {
  await sendEmail({
    to,
    subject: 'Reset your COSSA Vote password',
    text: `Hi ${name},\n\nYour password reset code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, you can safely ignore this email — your password will not be changed.\n\n— COSSA Electoral Committee`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;">
        <p>Hi ${name},</p>
        <p>Your password reset code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#2B1B12;">${code}</p>
        <p style="color:#666;font-size:13px;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email — your password will not be changed.</p>
        <p style="color:#666;font-size:13px;">— COSSA Electoral Committee</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendAdminOtpEmail, sendPasswordResetEmail };
