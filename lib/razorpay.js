const crypto = require("crypto");
const Razorpay = require("razorpay");

const keyId = String(
  process.env.RAZORPAY_KEY_ID || ""
).trim();

const keySecret = String(
  process.env.RAZORPAY_KEY_SECRET || ""
).trim();

const webhookSecret = String(
  process.env.RAZORPAY_WEBHOOK_SECRET || ""
).trim();

if (!keyId || !keySecret) {
  throw new Error(
    "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required."
  );
}

const razorpayClient = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

function getPublicKeyId() {
  return keyId;
}

function createOrder({
  amountInPaise,
  currency,
  receipt,
}) {
  if (
    !Number.isSafeInteger(amountInPaise) ||
    amountInPaise <= 0
  ) {
    throw new Error(
      "Invalid Razorpay order amount."
    );
  }

  if (
    typeof currency !== "string" ||
    currency.trim() !== "INR"
  ) {
    throw new Error(
      "Invalid Razorpay currency."
    );
  }

  if (
    typeof receipt !== "string" ||
    !receipt.trim() ||
    receipt.length > 40
  ) {
    throw new Error(
      "Invalid Razorpay receipt."
    );
  }

  return razorpayClient.orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt: receipt.trim(),
  });
}

function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
}) {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string"
  ) {
    return false;
  }

  if (
    !orderId.trim() ||
    !paymentId.trim() ||
    !signature.trim()
  ) {
    return false;
  }

  const generatedSignature =
    crypto
      .createHmac(
        "sha256",
        keySecret
      )
      .update(
        `${orderId.trim()}|${paymentId.trim()}`,
        "utf8"
      )
      .digest("hex");

  return safeCompareHex(
    generatedSignature,
    signature.trim()
  );
}

function verifyWebhookSignature(
  rawBody,
  signature
) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !signature.trim() ||
    !webhookSecret
  ) {
    return false;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        webhookSecret
      )
      .update(rawBody)
      .digest("hex");

  return safeCompareHex(
    expectedSignature,
    signature.trim()
  );
}

function safeCompareHex(
  expected,
  received
) {
  if (
    typeof expected !== "string" ||
    typeof received !== "string"
  ) {
    return false;
  }

  if (
    !/^[a-fA-F0-9]+$/.test(expected) ||
    !/^[a-fA-F0-9]+$/.test(received)
  ) {
    return false;
  }

  const expectedBuffer =
    Buffer.from(expected, "hex");

  const receivedBuffer =
    Buffer.from(received, "hex");

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
}

async function fetchOrder(
  razorpayOrderId
) {
  if (
    typeof razorpayOrderId !== "string" ||
    !razorpayOrderId.trim()
  ) {
    throw new Error(
      "Invalid Razorpay order ID."
    );
  }

  return razorpayClient.orders.fetch(
    razorpayOrderId.trim()
  );
}

async function fetchPayment(
  razorpayPaymentId
) {
  if (
    typeof razorpayPaymentId !== "string" ||
    !razorpayPaymentId.trim()
  ) {
    throw new Error(
      "Invalid Razorpay payment ID."
    );
  }

  return razorpayClient.payments.fetch(
    razorpayPaymentId.trim()
  );
}

module.exports = {
  getPublicKeyId,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchOrder,
  fetchPayment,
};