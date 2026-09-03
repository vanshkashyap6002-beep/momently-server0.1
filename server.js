require("./lib/env");
require("./scripts/seed-templates");

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
const profileRoutes = require("./routes/profile.routes");

const app = express();

const FRONTEND_ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Basic app setup
// ---------------------------------------------------------------------------

app.disable("x-powered-by");

app.use(cookieParser());

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

// Allow the deployed Vercel frontend to communicate with the Render backend.
//
// We also allow localhost so development continues to work.
const allowedOrigins = [
  "https://momently-frontend-stage-1.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
  }

  // Browser sends this before some cross-origin requests.
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

// Razorpay webhook needs the raw request body to verify its signature.
// It must be parsed before the normal JSON parser.
app.use(
  "/api/payment/webhook",
  express.raw({ type: "application/json" })
);

app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// Memory page
// ---------------------------------------------------------------------------

// /memory/:slug is dynamic, so serve the same memory shell.
// The frontend JavaScript then loads the actual memory data.
app.get("/memory/:slug", (_req, res) => {
  res.sendFile(
    path.join(FRONTEND_ROOT, "memory", "memory.html")
  );
});

// ---------------------------------------------------------------------------
// Frontend static files
// ---------------------------------------------------------------------------

app.use(
  express.static(FRONTEND_ROOT, {
    extensions: ["html"]
  })
);

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).send("Not found.");
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Momently Stage 1 running on port ${PORT}`
  );
});
