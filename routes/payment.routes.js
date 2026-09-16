const express = require("express");
const db = require("../lib/db");
const razorpay = require("../lib/razorpay");
const { checkRateLimit } = require("../lib/rateLimit");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

const PAYMENT_CURRENCY = "INR";

function isNonEmptyString(value, maxLength = 256) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function publicPayment(order, razorpayOrder) {
  return {
    keyId: razorpay.getPublicKeyId(),
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
  };
}

// POST /api/payment/create-order
// Body: { orderId }
router.post("/create-order", requireCustomer, async (req, res) => {
  const { orderId } = req.body || {};

  if (!isNonEmptyString(orderId, 128)) {
    return res.status(400).json({
      error: "A valid order ID is required.",
    });
  }

  if (!checkRateLimit(`pay:${req.user.id}`, 5, 10 * 60 * 1000)) {
    return res.status(429).json({
      error: "Too many payment attempts. Please wait a few minutes.",
    });
  }

  let client;

  try {
    client = await db.pool.connect();

    await client.query("BEGIN");

    /*
     * Lock the order row while we decide/create the Razorpay order.
     *
     * This prevents two nearly simultaneous requests from creating two
     * different Razorpay orders for the same Momently order.
     */
    const result = await client.query(
      `SELECT *
       FROM orders
       WHERE id = $1
         AND user_id = $2
       FOR UPDATE`,
      [orderId.trim(), req.user.id]
    );

    const order = result.rows[0];

    if (!order) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Order not found.",
      });
    }

    /*
     * Only PENDING + UNPAID orders may start payment.
     */
    if (
      order.status !== "PENDING" ||
      order.payment_status === "PAID"
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "This order is not available for payment.",
      });
    }

    const amount = Number(order.amount);

    /*
     * Momently stores the amount in whole INR.
     * Razorpay receives paise.
     */
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "This order has an invalid payment amount.",
      });
    }

    /*
     * IMPORTANT:
     * If a Razorpay order already exists, reuse it.
     *
     * This makes retries and double-clicks idempotent for this Momently order.
     */
    if (order.razorpay_order_id) {
      await client.query("COMMIT");

      return res.json(
        publicPayment(order, {
          id: order.razorpay_order_id,
          amount: amount * 100,
          currency: PAYMENT_CURRENCY,
        })
      );
    }

    /*
     * The local order row is still locked here.
     * A concurrent request must wait until this transaction finishes.
     */
    const rpOrder = await razorpay.createOrder({
      amountInPaise: amount * 100,
      currency: PAYMENT_CURRENCY,
      receipt: order.id,
    });

    /*
     * Never trust an unexpected response from the gateway.
     */
    if (
      !rpOrder ||
      !isNonEmptyString(rpOrder.id, 128) ||
      Number(rpOrder.amount) !== amount * 100 ||
      rpOrder.currency !== PAYMENT_CURRENCY
    ) {
      throw new Error(
        "Razorpay returned an invalid order."
      );
    }

    const updateResult = await client.query(
      `UPDATE orders
       SET razorpay_order_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND user_id = $3
         AND status = 'PENDING'
         AND payment_status = 'UNPAID'`,
      [
        rpOrder.id,
        order.id,
        req.user.id,
      ]
    );

    if (updateResult.rowCount !== 1) {
      throw new Error(
        "Unable to link Razorpay order to Momently order."
      );
    }

    await client.query("COMMIT");

    return res.json(
      publicPayment(order, rpOrder)
    );
  } catch (err) {
    try {
      if (client) {
        await client.query("ROLLBACK");
      }
    } catch {
      // Ignore rollback failures.
    }

    console.error(
      "Razorpay create-order failed:",
      err.message || err
    );

    return res.status(502).json({
      error:
        "Couldn't start payment right now. Please try again in a moment.",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// POST /api/payment/verify
//
// Body:
// {
//   orderId,
//   razorpayOrderId,
//   razorpayPaymentId,
//   razorpaySignature
// }
router.post("/verify", requireCustomer, async (req, res) => {
  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = req.body || {};

  if (
    !isNonEmptyString(orderId, 128) ||
    !isNonEmptyString(razorpayOrderId, 128) ||
    !isNonEmptyString(razorpayPaymentId, 128) ||
    !isNonEmptyString(razorpaySignature, 128)
  ) {
    return res.status(400).json({
      error: "Incomplete payment verification data.",
    });
  }

  try {
    const result = await db.query(
      `SELECT *
       FROM orders
       WHERE id = $1
         AND user_id = $2`,
      [
        orderId.trim(),
        req.user.id,
      ]
    );

    const order = result.rows[0];

    if (!order) {
      return res.status(404).json({
        error: "Order not found.",
      });
    }

    /*
     * Idempotent success.
     *
     * A repeated browser callback after successful verification should not
     * cause another payment state transition.
     */
    if (
      order.payment_status === "PAID" &&
      order.status === "PAID"
    ) {
      return res.json({
        ok: true,
        order: {
          id: order.id,
          status: "PAID",
        },
      });
    }

    /*
     * Only a pending/unpaid order may be verified.
     */
    if (
      order.status !== "PENDING" ||
      order.payment_status === "PAID"
    ) {
      return res.status(409).json({
        error: "This order is not awaiting payment.",
      });
    }

    /*
     * The Razorpay order must be the exact order created for this Momently
     * order.
     */
    if (
      order.razorpay_order_id !==
      razorpayOrderId.trim()
    ) {
      return res.status(400).json({
        error: "Order mismatch.",
      });
    }

    const amount = Number(order.amount);

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return res.status(409).json({
        error: "This order has an invalid payment amount.",
      });
    }

    /*
     * First verify Razorpay's signature.
     */
    let validSignature = false;

    try {
      validSignature =
        razorpay.verifyPaymentSignature({
          orderId: razorpayOrderId.trim(),
          paymentId: razorpayPaymentId.trim(),
          signature: razorpaySignature.trim(),
        });
    } catch (err) {
      console.error(
        "Signature verification error:",
        err.message
      );
    }

    /*
     * IMPORTANT:
     * Do NOT mutate the order to FAILED on an invalid browser request.
     *
     * Otherwise, someone who knows an order ID could potentially disrupt
     * a legitimate pending payment.
     */
    if (!validSignature) {
      return res.status(400).json({
        error:
          "Payment verification failed. Please try again.",
      });
    }

    /*
     * Signature verification alone is not enough.
     *
     * Verify the actual server-side Razorpay order and payment:
     * - correct Razorpay order
     * - correct amount
     * - correct currency
     * - correct payment ID
     * - payment belongs to the same Razorpay order
     * - payment is captured
     */
    const [rpOrder, rpPayment] =
      await Promise.all([
        razorpay.fetchOrder(
          razorpayOrderId.trim()
        ),
        razorpay.fetchPayment(
          razorpayPaymentId.trim()
        ),
      ]);

    if (
      !rpOrder ||
      rpOrder.id !== order.razorpay_order_id ||
      Number(rpOrder.amount) !== amount * 100 ||
      rpOrder.currency !== PAYMENT_CURRENCY
    ) {
      return res.status(400).json({
        error:
          "Payment order details do not match this order.",
      });
    }

    if (
      !rpPayment ||
      rpPayment.id !== razorpayPaymentId.trim() ||
      rpPayment.order_id !==
        order.razorpay_order_id ||
      Number(rpPayment.amount) !== amount * 100 ||
      rpPayment.currency !== PAYMENT_CURRENCY ||
      rpPayment.status !== "captured"
    ) {
      return res.status(409).json({
        error:
          "Payment has not been captured yet. Please wait a moment and try again.",
      });
    }

    /*
     * Final conditional update.
     *
     * The payment can only be attached if:
     * - this is still the same user's order
     * - Razorpay order ID still matches
     * - order is still pending
     * - order is not already paid
     * - another payment ID has not already been stored
     */
    const updateResult = await db.query(
      `UPDATE orders
       SET payment_status = 'PAID',
           status = 'PAID',
           razorpay_payment_id = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND user_id = $3
         AND razorpay_order_id = $4
         AND status = 'PENDING'
         AND payment_status != 'PAID'
         AND razorpay_payment_id IS NULL`,
      [
        razorpayPaymentId.trim(),
        order.id,
        req.user.id,
        order.razorpay_order_id,
      ]
    );

    /*
     * Another request may have won the race.
     */
    if (updateResult.rowCount !== 1) {
      const latest = await db.query(
        `SELECT status, payment_status
         FROM orders
         WHERE id = $1
           AND user_id = $2`,
        [
          order.id,
          req.user.id,
        ]
      );

      const latestOrder =
        latest.rows[0];

      /*
       * If the other request successfully completed payment,
       * treat our request as an idempotent success.
       */
      if (
        latestOrder?.status === "PAID" &&
        latestOrder?.payment_status === "PAID"
      ) {
        return res.json({
          ok: true,
          order: {
            id: order.id,
            status: "PAID",
          },
        });
      }

      return res.status(409).json({
        error:
          "This payment could not be applied to the order. Please contact support.",
      });
    }

    return res.json({
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

    return res.status(500).json({
      error:
        "Unable to verify payment right now.",
    });
  }
});

// POST /api/payment/webhook
//
// Razorpay's server-to-server payment source.
//
// IMPORTANT:
// This route must be mounted using express.raw() in server.js,
// otherwise the signature cannot be verified against the exact raw body.
router.post("/webhook", async (req, res) => {
  const signature =
    req.headers["x-razorpay-signature"];

  const rawBody = req.body;

  try {
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({
        error: "Invalid webhook body.",
      });
    }

    /*
     * Verify Razorpay webhook signature against the raw request body.
     */
    let valid = false;

    try {
      valid =
        razorpay.verifyWebhookSignature(
          rawBody,
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

    let event;

    try {
      event = JSON.parse(
        rawBody.toString("utf8")
      );
    } catch {
      return res.status(400).json({
        error: "Invalid webhook JSON.",
      });
    }

    /*
     * We currently act on payment.captured.
     */
    if (
      event.event === "payment.captured"
    ) {
      const payment =
        event.payload?.payment?.entity;

      if (
        payment?.order_id &&
        payment?.id &&
        payment?.status === "captured"
      ) {
        const client =
          await db.pool.connect();

        try {
          await client.query("BEGIN");

          /*
           * Lock the matching Momently order.
           *
           * This prevents simultaneous webhook/browser verification updates
           * from corrupting the payment state.
           */
          const result =
            await client.query(
              `SELECT *
               FROM orders
               WHERE razorpay_order_id = $1
               FOR UPDATE`,
              [payment.order_id]
            );

          const order =
            result.rows[0];

          /*
           * Unknown Razorpay order:
           * acknowledge the webhook so Razorpay does not repeatedly retry an
           * event that Momently cannot map.
           */
          if (!order) {
            await client.query("COMMIT");

            return res.json({
              received: true,
            });
          }

          const storedAmount =
            Number(order.amount);

          const expectedAmount =
            storedAmount * 100;

          /*
           * Validate the Momently amount before touching payment state.
           */
          if (
            !Number.isSafeInteger(
              storedAmount
            ) ||
            storedAmount <= 0 ||
            !Number.isSafeInteger(
              Number(payment.amount)
            ) ||
            Number(payment.amount) !==
              expectedAmount ||
            payment.currency !==
              PAYMENT_CURRENCY
          ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
              error:
                "Webhook payment details do not match the order.",
            });
          }

          /*
           * If already paid:
           *
           * - same payment ID = safe duplicate webhook
           * - different payment ID = integrity conflict
           */
          if (
            order.payment_status === "PAID"
          ) {
            if (
              order.razorpay_payment_id !==
              payment.id
            ) {
              await client.query(
                "ROLLBACK"
              );

              return res.status(409).json({
                error:
                  "Order is already linked to another payment.",
              });
            }

            await client.query("COMMIT");

            return res.json({
              received: true,
            });
          }

          /*
           * Apply captured payment exactly once.
           */
          await client.query(
            `UPDATE orders
             SET payment_status = 'PAID',
                 status = 'PAID',
                 razorpay_payment_id = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
               AND payment_status != 'PAID'
               AND razorpay_payment_id IS NULL`,
            [
              payment.id,
              order.id,
            ]
          );

          await client.query("COMMIT");
        } catch (err) {
          try {
            await client.query(
              "ROLLBACK"
            );
          } catch {
            // Ignore rollback failures.
          }

          throw err;
        } finally {
          client.release();
        }
      }
    }

    return res.json({
      received: true,
    });
  } catch (err) {
    console.error(
      "Webhook processing failed:",
      err.message || err
    );

    return res.status(500).json({
      error:
        "Webhook processing failed.",
    });
  }
});

module.exports = router;