// Harus paling awal: menginisialisasi Sentry sebelum modul lain dimuat.
import { Sentry, sentryEnabled } from "./lib/sentry.js";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env, mailEnabled, paymentsEnabled } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { ValidationError } from "./lib/validation.js";
import { apiLimiter, authLimiter } from "./middlewares/rate-limit.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import itemRoutes from "./routes/item.routes.js";
import storeRoutes from "./routes/store.routes.js";
import orderRoutes from "./routes/order.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import uploadRoutes, { UPLOAD_DIR } from "./routes/upload.routes.js";
import { checkoutRouter, paymentRouter } from "./routes/checkout.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import payoutRoutes from "./routes/payout.routes.js";
import reportRoutes from "./routes/report.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();

// Satu reverse proxy (Nginx/Caddy) di depan API: req.ip diambil dari X-Forwarded-For milik proxy itu.
app.set("trust proxy", 1);
// cross-origin: gambar /uploads dimuat oleh client Astro yang berbeda origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// Gambar hasil upload. nosniff mencegah browser menebak tipe file selain yang dideklarasikan.
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "30d",
    immutable: true,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);

app.use("/api", apiLimiter);
// Semua endpoint yang memeriksa password atau mengirim email.
app.use(
  ["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/password", "/api/auth/account"],
  authLimiter,
);

/** Dipakai monitoring/uptime check: 200 jika database bisa di-ping, 503 jika tidak. */
app.get("/api/health", async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    res.json({ status: "ok", timestamp, payments: paymentsEnabled(), email: mailEnabled() });
  } catch (err) {
    console.error("Health check: database tidak terjangkau", err);
    res.status(503).json({ status: "error", timestamp, message: "Database tidak terjangkau." });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/payouts", payoutRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/checkout", checkoutRouter);
app.use("/api/payments", paymentRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Endpoint tidak ditemukan." });
});

// Sentry mencatat error tak tertangani (status 5xx) sebelum diubah jadi respons JSON di bawah.
// Error validasi (4xx) tidak dikirim ke Sentry.
if (sentryEnabled) Sentry.setupExpressErrorHandler(app);

// Express 5 meneruskan error dari handler async ke sini secara otomatis.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ValidationError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ message: "Body JSON tidak valid." });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan di server." });
});

const server = app.listen(env.port, () => {
  console.log(`API berjalan di http://localhost:${env.port}`);
  if (!paymentsEnabled()) console.log("Midtrans belum dikonfigurasi: checkout online nonaktif.");
  if (!mailEnabled()) console.log("SMTP belum dikonfigurasi: email struk dan reset password nonaktif.");
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  // Kirim sisa event Sentry yang masih antre sebelum proses berhenti.
  if (sentryEnabled) await Sentry.close(2000);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
