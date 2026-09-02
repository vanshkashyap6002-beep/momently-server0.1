// Plain OAuth 2.0 Authorization Code flow against Google's endpoints — no
// Passport dependency, just three well-documented HTTP calls. Real OAuth,
// not a fake button: nothing here works without a genuine
// GOOGLE_CLIENT_ID/SECRET from https://console.cloud.google.com/apis/credentials,
// with this app's callback URL added to "Authorized redirect URIs".

const crypto = require("crypto");

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri() {
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  return `${base}/api/auth/google/callback`;
}

/** Step 1: where to send the browser. `state` is a random value the
 * caller stores in a short-lived cookie and re-checks in the callback, to
 * block CSRF on the OAuth handshake. */
function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

/** Step 2: exchange the ?code= for tokens, then Step 3: fetch the profile.
 * Returns { googleId, email, name, avatarUrl }. */
async function exchangeCodeForProfile(code) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${body}`);
  }
  const tokens = await tokenRes.json();

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error(`Google profile fetch failed: ${profileRes.status}`);
  const profile = await profileRes.json();

  return {
    googleId: profile.sub,
    email: profile.email,
    name: profile.name || profile.email,
    avatarUrl: profile.picture || null,
  };
}

module.exports = { isConfigured, buildAuthUrl, generateState, exchangeCodeForProfile };
