import { createHash } from "node:crypto";
import { env } from "./env.js";

/** Status internal pesanan. */
export type OrderStatus = "PENDING" | "PAID" | "FAILED";

const authHeader = () => `Basic ${Buffer.from(`${env.midtrans.serverKey}:`).toString("base64")}`;

export class MidtransError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

interface SnapRequest {
  orderCode: string;
  grossAmount: number;
  item: { id: string; name: string; price: number; quantity: number };
  /** Diskon kupon (Rupiah). Dikirim sebagai item harga negatif agar total item = gross_amount. */
  discount?: { code: string; amount: number };
  customer: { name: string; email: string };
}

export async function createSnapTransaction(req: SnapRequest): Promise<{ token: string; redirectUrl: string }> {
  const res = await fetch(env.midtrans.snapApi, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      transaction_details: { order_id: req.orderCode, gross_amount: req.grossAmount },
      // Midtrans membatasi nama item 50 karakter.
      item_details: [
        { ...req.item, name: req.item.name.slice(0, 50) },
        ...(req.discount
          ? [{ id: "DISCOUNT", name: `Diskon ${req.discount.code}`.slice(0, 50), price: -req.discount.amount, quantity: 1 }]
          : []),
      ],
      customer_details: { first_name: req.customer.name.slice(0, 50), email: req.customer.email },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };
  if (!res.ok || !body.token || !body.redirect_url) {
    console.error("Midtrans Snap error", res.status, body);
    throw new MidtransError(
      res.status === 401
        ? "Server key Midtrans tidak valid. Periksa MIDTRANS_SERVER_KEY."
        : "Gagal membuat transaksi pembayaran. Coba lagi.",
    );
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

/** Notifikasi dan status API Midtrans memakai bentuk yang sama untuk field ini. */
export interface MidtransStatus {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key?: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
}

export async function fetchTransactionStatus(orderCode: string): Promise<MidtransStatus | null> {
  const res = await fetch(`${env.midtrans.coreApi}/${encodeURIComponent(orderCode)}/status`, {
    headers: { Accept: "application/json", Authorization: authHeader() },
  });
  const body = (await res.json().catch(() => null)) as MidtransStatus | null;
  // Midtrans mengembalikan status_code "404" di body jika transaksi belum dibuat pembeli.
  if (!res.ok || !body || body.status_code === "404") return null;
  return body;
}

/** signature_key = SHA512(order_id + status_code + gross_amount + server_key) */
export function isValidSignature(n: MidtransStatus): boolean {
  if (!n.signature_key) return false;
  const expected = createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + env.midtrans.serverKey)
    .digest("hex");
  return expected === n.signature_key;
}

export function mapStatus(n: Pick<MidtransStatus, "transaction_status" | "fraud_status">): OrderStatus {
  switch (n.transaction_status) {
    case "settlement":
      return "PAID";
    case "capture":
      return n.fraud_status === "accept" || !n.fraud_status ? "PAID" : "PENDING";
    case "deny":
    case "cancel":
    case "expire":
    case "failure":
      return "FAILED";
    default:
      return "PENDING";
  }
}
