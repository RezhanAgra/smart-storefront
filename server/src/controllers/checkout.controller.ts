import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { env, paymentsEnabled } from "../lib/env.js";
import { asBody, isObjectId, optionalString, ValidationError } from "../lib/validation.js";
import {
  createSnapTransaction,
  fetchTransactionStatus,
  isValidSignature,
  mapStatus,
  MidtransError,
  type MidtransStatus,
} from "../lib/midtrans.js";
import { applyOrderStatus } from "../lib/orders.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_CODE = /^SS-[A-Z0-9-]{6,40}$/;

const newOrderCode = () =>
  `SS-${Date.now().toString(36).toUpperCase()}-${randomBytes(6).toString("hex").toUpperCase()}`;

/** POST /api/checkout: publik. Membuat pesanan PENDING dan token Snap. */
export async function createCheckout(req: Request, res: Response): Promise<void> {
  if (!paymentsEnabled()) {
    res.status(503).json({ message: "Pembayaran online belum diaktifkan oleh pengelola situs." });
    return;
  }

  const body = asBody(req.body);
  const itemId = body.itemId;
  const quantity = Number(body.quantity);
  const buyerName = optionalString(body, "buyerName");
  const buyerEmail = optionalString(body, "buyerEmail")?.toLowerCase();
  const note = optionalString(body, "note") ?? null;

  if (!isObjectId(itemId)) throw new ValidationError("Produk tidak valid.");
  if (!buyerName) throw new ValidationError("Nama wajib diisi.");
  if (!buyerEmail || !EMAIL.test(buyerEmail)) throw new ValidationError("Email tidak valid.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new ValidationError("Jumlah harus 1 sampai 99.");
  }
  if (note && note.length > 300) throw new ValidationError("Catatan maksimal 300 karakter.");

  const item = await prisma.item.findFirst({ where: { id: itemId, isActive: true, type: "product" } });
  if (!item) {
    res.status(404).json({ message: "Produk tidak ditemukan atau sudah tidak dijual." });
    return;
  }
  if (!item.price || item.price < 1) throw new ValidationError("Produk ini tidak bisa dibayar online.");
  if (item.stock !== null && item.stock < quantity) {
    throw new ValidationError(item.stock === 0 ? "Stok habis." : `Stok tersisa ${item.stock}.`);
  }

  const orderCode = newOrderCode();
  const grossAmount = item.price * quantity;

  try {
    const snap = await createSnapTransaction({
      orderCode,
      grossAmount,
      item: { id: item.id, name: item.title, price: item.price, quantity },
      customer: { name: buyerName, email: buyerEmail },
    });

    await prisma.order.create({
      data: {
        orderCode,
        userId: item.userId,
        itemId: item.id,
        itemTitle: item.title,
        unitPrice: item.price,
        quantity,
        grossAmount,
        buyerName,
        buyerEmail,
        note,
        snapToken: snap.token,
      },
    });

    res.status(201).json({ orderCode, token: snap.token, redirectUrl: snap.redirectUrl, grossAmount });
  } catch (err) {
    if (err instanceof MidtransError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    throw err;
  }
}

/**
 * POST /api/checkout/:orderCode/sync: publik. Menanyakan status langsung ke Midtrans.
 * Dipakai setelah popup Snap selesai, karena webhook Midtrans tidak bisa menjangkau localhost.
 */
export async function syncCheckout(req: Request, res: Response): Promise<void> {
  const orderCode = String(req.params.orderCode ?? "");
  if (!ORDER_CODE.test(orderCode)) {
    res.status(404).json({ message: "Pesanan tidak ditemukan." });
    return;
  }
  const existing = await prisma.order.findUnique({ where: { orderCode }, select: { status: true } });
  if (!existing) {
    res.status(404).json({ message: "Pesanan tidak ditemukan." });
    return;
  }

  let status = existing.status;
  if (paymentsEnabled() && status !== "PAID") {
    const remote = await fetchTransactionStatus(orderCode);
    if (remote) status = (await applyOrderStatus(orderCode, mapStatus(remote), remote.payment_type))?.status ?? status;
  }
  // Hanya status yang dikirim balik: endpoint ini publik, data pembeli tidak boleh bocor.
  res.json({ orderCode, status });
}

/** POST /api/payments/midtrans/notification: webhook Midtrans (set di dashboard Midtrans). */
export async function midtransNotification(req: Request, res: Response): Promise<void> {
  const n = asBody(req.body) as Partial<MidtransStatus>;
  if (
    typeof n.order_id !== "string" ||
    typeof n.status_code !== "string" ||
    typeof n.gross_amount !== "string" ||
    typeof n.transaction_status !== "string"
  ) {
    res.status(400).json({ message: "Notifikasi tidak lengkap." });
    return;
  }
  if (!env.midtrans.serverKey || !isValidSignature(n as MidtransStatus)) {
    res.status(403).json({ message: "Signature tidak valid." });
    return;
  }

  const order = await applyOrderStatus(n.order_id, mapStatus(n as MidtransStatus), n.payment_type);
  // 200 juga untuk order yang tidak dikenal, supaya Midtrans tidak terus mengirim ulang.
  res.json({ received: true, status: order?.status ?? null });
}
