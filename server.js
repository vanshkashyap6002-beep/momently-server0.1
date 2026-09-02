require("./lib/env");

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth.routes");
const templatesRoutes = require("./routes/templates.routes");
const ordersRoutes = require("./routes/orders.routes");
const mediaRoutes = require("./routes/media.routes");
const paymentRoutes = require("./routes/payment.routes");
const memoryRoutes = require("./routes/memory.routes");
const adminRoutes = require("./routes/admin.routes");

const app = express();
const FRONTEND_ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(cookieParser());

// The Razorpay webhook needs the raw request body to verify its signature,
// so it's parsed BEFORE the general express.json() below and only for this
// one path — every other route gets normal parsed JSON.
app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// API routes. Customer and admin surfaces are mounted separately, on
// separate paths, backed by separate middleware (see routes/*.routes.js) —
// they never share a session cookie or a code path.
// ---------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------------------------------------------------------------------------
// Frontend — plain static HTML/CSS/JS served from the project root.
// ---------------------------------------------------------------------------

// /memory/:slug isn't a real file on disk (the slug is dynamic) — it always
// serves the same template shell, which then fetches /api/memory/:slug and
// fills itself in client-side. This is the "one master template, reused for
// every customer" behavior from the spec, implemented without a framework.
app.get("/memory/:slug", (_req, res) => {
  res.sendFile(path.join(FRONTEND_ROOT, "memory", "memory.html"));
});

app.use(express.static(FRONTEND_ROOT, { extensions: ["html"] }));

app.use((_req, res) => res.status(404).send("Not found."));

app.listen(PORT, () => {
  console.log(`Momently Stage 1 running at http://localhost:${PORT}`);
});
const profileRoutes = require('./routes/profile.routes');
// Mount under /api/profile
app.use('/api/profile', profileRoutes);