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
  apiPublicUrl: (process.env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
  isProduction: process.env.NODE_ENV === "production",
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

export const paymentsEnabled = (): boolean => Boolean(env.midtrans.serverKey && env.midtrans.clientKey);
