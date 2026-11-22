import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, paymentsEnabled } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { ValidationError } from "./lib/validation.js";
import authRoutes from "./routes/auth.routes.js";
import itemRoutes from "./routes/item.routes.js";
import storeRoutes from "./routes/store.routes.js";
import orderRoutes from "./routes/order.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import uploadRoutes, { UPLOAD_DIR } from "./routes/upload.routes.js";
import { checkoutRouter, paymentRouter } from "./routes/checkout.routes.js";

const app = express();

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

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", payments: paymentsEnabled() });
});

app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/checkout", checkoutRouter);
app.use("/api/payments", paymentRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Endpoint tidak ditemukan." });
});

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
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
