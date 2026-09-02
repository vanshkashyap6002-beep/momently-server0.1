// One function to call from anywhere in the app; the transport is the only
// thing that changes if you switch providers. Works with any SMTP
// provider (Gmail app password, SendGrid, Resend, Mailtrap, Postmark, AWS
// SES SMTP, etc.) — set SMTP_HOST/PORT/USER/PASS and it works. If those
// aren't set, emails are logged to the console instead of failing the
// request, so the rest of the app (and local testing) still works before
// a provider is chosen.

const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const from = process.env.EMAIL_FROM || "Momently <noreply@momently.app>";
  const t = getTransporter();

  if (!t) {
    console.log("─── Email NOT sent — SMTP_* not configured in .env, logging instead ───");
    console.log(`To: ${to}\nSubject: ${subject}\n${text || html}`);
    console.log("─────────────────────────────────────────────────────────────────────");
    return { delivered: false };
  }

  await t.sendMail({ from, to, subject, html, text });
  return { delivered: true };
}

/** The one transactional email Stage 1 sends: "your memory is ready." */
async function sendMemoryPublishedEmail({ to, recipientName, memoryTitle, memoryUrl }) {
  const subject = "Your Momently is ready \u2764\ufe0f";
  const text = `Hi ${recipientName || "there"},\n\n"${memoryTitle || "Your memory"}" has just been published.\n\nView it here: ${memoryUrl}\n\n— Momently`;
  const html = `
    <div style="font-family: Georgia, 'Playfair Display', serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FDFBF9; color: #12100F;">
      <p style="font-family: Georgia, serif; font-size: 22px; color: #7A1E2B; margin: 0 0 24px;">Momently</p>
      <h1 style="font-size: 20px; font-weight: normal; margin: 0 0 12px;">Your Momently is ready \u2764\ufe0f</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #12100F99; margin: 0 0 28px;">
        "${escapeHtml(memoryTitle || "Your memory")}" has just been published. It's ready whenever you'd like to see it.
      </p>
      <a href="${memoryUrl}" style="display: inline-block; background: #7A1E2B; color: #FDFBF9; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 14px;">View Your Memory</a>
      <p style="margin-top: 32px; font-size: 12px; color: #12100F66;">${memoryUrl}</p>
    </div>`;
  return sendEmail({ to, subject, html, text });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

module.exports = { sendEmail, sendMemoryPublishedEmail };
