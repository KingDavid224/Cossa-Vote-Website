// Sends transactional email via Brevo's HTTP API (https://brevo.com).
//
// We use plain HTTPS instead of SMTP/nodemailer because most cloud hosts
// (Render's free tier included) block outbound SMTP ports 25/465/587,
// which silently breaks OTP delivery. Brevo's REST API only needs port
// 443, so it works everywhere — including Render's free plan.
//
// Unlike some providers, Brevo only requires you to verify a single
// sender email address (not a whole domain) before you can send to any
// recipient, which makes it a good fit if you don't have a custom domain.
//
// Env vars needed:
//   BREVO_API_KEY   - from https://app.brevo.com/settings/keys/api
//   EMAIL_FROM      - the address you verified as a sender in Brevo,
//                      e.g. 'youraddress@gmail.com'
//   EMAIL_FROM_NAME - display name, e.g. 'COSSA Vote'

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, subject, text, html }) {
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || 'COSSA Vote',
      },
      to: [{ email: to }],
      subject,
      textContent: text,
      ...(html ? { htmlContent: html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API error (${res.status}): ${body}`);
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
