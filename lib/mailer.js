const API_ROOT = 'https://api.brevo.com/v3';

function request(path, options) {
  return fetch(API_ROOT + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      ...(options.body ? { 'content-type': 'application/json' } : {})
    }
  });
}

function networkStage(error) {
  return ['TimeoutError', 'AbortError'].includes(error?.name) ||
    ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT'].includes(error?.cause?.code)
    ? 'timeout' : 'network_error';
}

async function verifyBrevo() {
  if (!process.env.BREVO_API_KEY) return { ok: false, stage: 'configuration' };
  try {
    const response = await request('/account', { method: 'GET' });
    // Discard the account body, which can contain account details and credentials.
    await response.body?.cancel();
    if (response.status === 200) return { ok: true, stage: 'verified', responseCode: 200 };
    const stages = { 401: 'unauthorized', 403: 'forbidden', 429: 'rate_limited' };
    return { ok: false, stage: stages[response.status] || 'provider_error', responseCode: response.status };
  } catch (error) {
    return { ok: false, stage: networkStage(error) };
  }
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.BREVO_API_KEY) return { status: 'not_sent' };
  try {
    const response = await request('/smtp/email', {
      method: 'POST',
      body: JSON.stringify({
        sender: { name: 'CHERMO', email: 'hello@chermo.in' },
        to: [{ email: to }], subject, htmlContent: html, textContent: text
      })
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.warn('Brevo email request failed', { responseCode: response.status });
      // Only explicit client rejections rule out acceptance. Never retry here.
      const rejected = [400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(response.status);
      return { status: rejected ? 'not_sent' : 'unknown' };
    }
    const { messageId } = await response.json();
    if (typeof messageId === 'string' && messageId.trim()) return { status: 'accepted_by_brevo', messageId };
    return { status: 'unknown' };
  } catch (error) {
    console.warn('Brevo email outcome unavailable', { stage: networkStage(error) });
    const beforeConnection = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error?.cause?.code);
    return { status: beforeConnection ? 'not_sent' : 'unknown' };
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

module.exports = { sendEmail, sendMemoryPublishedEmail, verifyBrevo };
