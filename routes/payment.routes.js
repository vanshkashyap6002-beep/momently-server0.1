const express = require("express");
const db = require("../lib/db");
const razorpay = require("../lib/razorpay");
const { checkRateLimit } = require("../lib/rateLimit");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

// POST /api/payment/create-order  { orderId }
router.post("/create-order", requireCustomer, async (req, res) => {
  const { orderId } = req.body || {};

  try {
    const result = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.status !== "PENDING") {
      return res.status(409).json({
        error: "This order has already been paid for.",
      });
    }

    if (!checkRateLimit(`pay:${req.user.id}`, 5, 10 * 60 * 1000)) {
      return res.status(429).json({
        error: "Too many payment attempts. Please wait a few minutes.",
      });
    }

    const rpOrder = await razorpay.createOrder({
      amountInPaise: order.amount * 100,
      currency: "INR",
      receipt: order.id,
    });

    await db.query(
      `UPDATE orders
       SET razorpay_order_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [rpOrder.id, order.id]
    );

    res.json({
      keyId: razorpay.getPublicKeyId(),
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
    });
  } catch (err) {
    console.error(
      "Razorpay create-order failed:",
      err.message || err
    );

    res.status(502).json({
      error:
        "Couldn't start payment right now. Please try again in a moment.",
    });
  }
});

// POST /api/payment/verify
// { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
router.post("/verify", requireCustomer, async (req, res) => {
  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = req.body || {};

  try {
    const result = await db.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, req.user.id]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.razorpay_order_id !== razorpayOrderId) {
      return res.status(400).json({ error: "Order mismatch." });
    }

    let valid = false;

    try {
      valid = razorpay.verifyPaymentSignature({
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      });
    } catch (err) {
      console.error(
        "Signature verification error:",
        err.message
      );
    }

    if (!valid) {
      await db.query(
        `UPDATE orders
         SET payment_status = 'FAILED',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id]
      );

      return res.status(400).json({
        error: "Payment verification failed. Please try again.",
      });
    }

    await db.query(
      `UPDATE orders
       SET payment_status = 'PAID',
           status = 'PAID',
           razorpay_payment_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [razorpayPaymentId, order.id]
    );

    res.json({
      ok: true,
      order: {
        id: order.id,
        status: "PAID",
      },
    });
  } catch (err) {
    console.error(
      "Payment verification failed:",
      err.message || err
    );

    res.status(500).json({
      error: "Unable to verify payment right now.",
    });
  }
});

// POST /api/payment/webhook
//
// Razorpay's server-to-server source of truth.
//
// Mounted with express.raw() in server.js, so req.body here
// is a Buffer rather than parsed JSON.
router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.body;

  try {
    let valid = false;

    try {
      valid = razorpay.verifyWebhookSignature(
        rawBody.toString("utf8"),
        signature
      );
    } catch (err) {
      console.error(
        "Webhook signature check error:",
        err.message
      );
    }

    if (!valid) {
      return res.status(400).json({
        error: "Invalid signature.",
      });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;

      if (payment?.order_id) {
        // Idempotent: re-delivery of the same event is a safe no-op
        // because this WHERE clause only matches rows that aren't
        // already PAID.
        await db.query(
          `UPDATE orders
           SET payment_status = 'PAID',
               status = 'PAID',
               razorpay_payment_id = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE razorpay_order_id = $2
             AND payment_status != 'PAID'`,
          [payment.id, payment.order_id]
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error(
      "Webhook processing failed:",
      err.message || err
    );

    res.status(500).json({
      error: "Webhook processing failed.",
    });
  }
});

module.exports = router;