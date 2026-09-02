// Same pattern as the reference Next.js project's lib/razorpay.ts: create
// the order server-side, and never trust checkout.js's client-side success
// callback by itself — always recompute the HMAC-SHA256 signature with the
// key secret (server-only) before marking anything PAID. The webhook uses
// a SEPARATE secret (RAZORPAY_WEBHOOK_SECRET) verified against the *raw*
// request body, so it stays trustworthy even if the customer closes the
// tab right after paying and the client-side verify call never fires.

const crypto = require("crypto");
const Razorpay = require("razorpay");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let client = null;
function getClient() {
  if (!client) {
    client = new Razorpay({
      key_id: requireEnv("RAZORPAY_KEY_ID"),
      key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
    });
  }
  return client;
}

function getPublicKeyId() {
  return requireEnv("RAZORPAY_KEY_ID");
}

/** amountInPaise: Razorpay amounts are always the smallest currency unit (paise for INR). */
async function createOrder({ amountInPaise, currency = "INR", receipt }) {
  const order = await getClient().orders.create({ amount: amountInPaise, currency, receipt });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = requireEnv("RAZORPAY_KEY_SECRET");
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected === signature;
}

/** rawBody MUST be the raw request bytes/string — never JSON.parse it first,
 * or the signature will never match. See server.js for the express.raw()
 * middleware applied specifically to the webhook route. */
function verifyWebhookSignature(rawBody, signature) {
  const secret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

module.exports = { getPublicKeyId, createOrder, verifyPaymentSignature, verifyWebhookSignature };
