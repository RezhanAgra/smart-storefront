import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example).`);
  }
  return value;
}

const port = Number(process.env.PORT ?? 5000);
const midtransIsProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

export const env = {
  port,
  jwtSecret: required("JWT_SECRET"),
  clientUrl: required("CLIENT_URL"),
  /** URL publik server ini, untuk menyusun URL gambar hasil upload (dev: localhost, prod: domain API). */
  serverPublicUrl: (process.env.SERVER_PUBLIC_URL || "http://localhost:5000").replace(/\/$/, ""),
  /** Rahasia bersama dengan server Astro (SSR) agar request SSR tidak terkena rate limit per IP. */
  internalApiKey: process.env.INTERNAL_API_KEY ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /** SMTP untuk email struk, notifikasi pesanan, dan reset password. Kosong = email nonaktif. */
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "",
  },
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    clientKey: process.env.MIDTRANS_CLIENT_KEY ?? "",
    isProduction: midtransIsProduction,
    snapApi: midtransIsProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions",
    coreApi: midtransIsProduction ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2",
    snapJs: midtransIsProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js",
  },
} as const;

export const mailEnabled = (): boolean => Boolean(env.smtp.host && env.smtp.from);

export const paymentsEnabled =(): boolean => Boolean(env.midtrans.serverKey && env.midtrans.clientKey);
