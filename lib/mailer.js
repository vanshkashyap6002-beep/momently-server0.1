const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    forceAuth: Boolean(process.env.SMTP_USER),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

// Only these protocol fields may leave the mailer. Provider messages can include
// recipient addresses, server replies or fragments of an authentication exchange.
function smtpFailure(error = {}) {
  const codes = ["EAUTH", "ENOAUTH", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "EDNS",
    "ENOTFOUND", "EAI_AGAIN", "ESOCKET", "ECONNECTION", "ETLS", "EENVELOPE", "EMESSAGE"];
  // smtp-connection wraps Node connect errors as ESOCKET; retain only
  // the known refusal token, never the host/address from the message.
  const refused = error.syscall === "connect" && /\bECONNREFUSED\b/.test(error.message || "");
  const code = refused ? "ECONNREFUSED" : codes.includes(error.code) ? error.code : "UNKNOWN";
  const commands = ["CONN", "EHLO", "HELO", "STARTTLS", "MAIL FROM", "RCPT TO", "DATA"];
  const command = /^AUTH(?: |$)/.test(error.command || "") ? "AUTH"
    : commands.includes(error.command) ? error.command : null;
  const responseCode = Number.isInteger(error.responseCode) && error.responseCode >= 100 &&
    error.responseCode <= 599 ? error.responseCode : null;

  let stage = "undetermined";
  if (command === "AUTH" || ["EAUTH", "ENOAUTH"].includes(code)) stage = "authentication";
  else if (command === "STARTTLS" || code === "ETLS") stage = "tls";
  else if (code === "ETIMEDOUT" && error.message === "Greeting never received") stage = "greeting";
  else if (["EHLO", "HELO"].includes(command)) stage = "greeting";
  else if (["EDNS", "ENOTFOUND", "EAI_AGAIN"].includes(code)) stage = "dns";
  else if (code === "ECONNREFUSED" || error.syscall === "connect" ||
    (code === "ETIMEDOUT" && error.message === "Connection timeout")) stage = "connection";
  else if (["MAIL FROM", "RCPT TO"].includes(command)) stage = "envelope";
  else if (command === "DATA") stage = "message";
  // Nodemailer also uses CONN for a socket loss while awaiting final acceptance.
  const authenticationSucceeded = stage === "authentication" ? false :
    ["envelope", "message"].includes(stage) && process.env.SMTP_USER ? true : null;
  return { code, command, responseCode, stage, authenticationSucceeded };
}

const configurationFailure = {
  code: "SMTP_CONFIG", command: null, responseCode: null,
  stage: "configuration", authenticationSucceeded: null
};

async function verifySmtp() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("SMTP verification failed", configurationFailure);
    return { ok: false, ...configurationFailure };
  }
  try {
    await getTransporter().verify();
    return { ok: true, stage: "verified", authenticationSucceeded: true };
  } catch (error) {
    const details = smtpFailure(error);
    console.warn("SMTP verification failed", details);
    return { ok: false, ...details };
  }
}

async function sendEmail({ to, subject, html, text }) {
  const from = process.env.EMAIL_FROM || "Momently <noreply@momently.app>";
  if (!process.env.SMTP_HOST || (process.env.SMTP_USER && !process.env.SMTP_PASS) ||
    (process.env.SMTP_HOST === "smtp-relay.brevo.com" && !process.env.SMTP_USER)) {
    console.warn("SMTP send skipped", configurationFailure);
    return { delivered: false, status: "not_sent" };
  }
  try {
    const result = await getTransporter().sendMail({ from, to, subject, html, text });
    if (result.accepted?.length) return { delivered: true, status: "accepted_by_smtp" };
    return { delivered: false, status: result.rejected?.length ? "not_sent" : "unknown" };
  } catch (error) {
    const details = smtpFailure(error);
    console.warn("SMTP send failed", details);
    const beforeMessage = ["authentication", "tls", "dns", "connection", "greeting", "envelope"].includes(details.stage);
    const explicitlyRejected = details.stage === "message" && details.responseCode >= 400;
    return { delivered: false, status: beforeMessage || explicitlyRejected ? "not_sent" : "unknown" };
  }
}

/** The one transactional email Stage 1 sends: "your memory is ready." */
async function sendMemoryPublishedEmail({ to, recipientName, memoryTitle, memoryUrl }) {
  const subject = "Your CHERMO memory is ready \u2764\ufe0f";
  const text = `Hi ${recipientName || "there"},\n\n"${memoryTitle || "Your memory"}" has just been published.\n\nView it here: ${memoryUrl}\n\n— CHERMO`;
  const html = `
    <div style="font-family: Georgia, 'Playfair Display', serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FDFBF9; color: #12100F;">
      <p style="font-family: Georgia, serif; font-size: 22px; color: #7A1E2B; margin: 0 0 24px;">CHERMO</p>
      <h1 style="font-size: 20px; font-weight: normal; margin: 0 0 12px;">Your CHERMO memory is ready \u2764\ufe0f</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #12100F99; margin: 0 0 28px;">
        "${escapeHtml(memoryTitle || "Your memory")}" has just been published. It's ready whenever you'd like to see it.
      </p>
      <a href="${escapeHtml(memoryUrl)}" style="display: inline-block; background: #7A1E2B; color: #FDFBF9; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-size: 14px;">View Your Memory</a>
      <p style="margin-top: 32px; font-size: 12px; color: #12100F66;">${escapeHtml(memoryUrl)}</p>
    </div>`;
  return sendEmail({ to, subject, html, text });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

module.exports = { sendEmail, sendMemoryPublishedEmail, verifySmtp };
