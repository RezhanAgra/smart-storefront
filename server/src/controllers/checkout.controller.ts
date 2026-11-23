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
import { quoteCoupon } from "../lib/coupons.js";

/** Item produk aktif yang bisa dibayar online, atau melempar error untuk ditampilkan ke pembeli. */
async function findPayableItem(itemId: unknown, quantity: number) {
  if (!isObjectId(itemId)) throw new ValidationError("Produk tidak valid.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new ValidationError("Jumlah harus 1 sampai 99.");
  }
  const item = await prisma.item.findFirst({ where: { id: itemId, isActive: true, type: "product" } });
  if (!item) throw new NotFoundError("Produk tidak ditemukan atau sudah tidak dijual.");
  const seller = await prisma.user.findUnique({ where: { id: item.userId }, select: { username: true } });
  if (seller?.username === DEMO_USERNAME) throw new ValidationError("Ini toko demo, jadi pembelian dinonaktifkan.");
  if (!item.price || item.price < 1) throw new ValidationError("Produk ini tidak bisa dibayar online.");
  if (item.stock !== null && item.stock < quantity) {
    throw new ValidationError(item.stock === 0 ? "Stok habis." : `Stok tersisa ${item.stock}.`);
  }
  if (item.isDigital && !item.digitalFileKey) throw new ValidationError("File produk digital ini belum disiapkan penjual.");
  return item;
}

class NotFoundError extends ValidationError {
  override readonly status = 404;
}

/**
 * POST /api/checkout/coupon: publik. Cek kode promo sebelum membayar: { itemId, quantity, code }
 * -> { code, subtotal, discountAmount, total }. Tidak mengubah data apa pun.
 */
export async function previewCoupon(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const code = optionalString(body, "code");
  if (!code) throw new ValidationError("Masukkan kode promo.");
  const quantity = Number(body.quantity);
  const item = await findPayableItem(body.itemId, quantity);
  const subtotal = item.price! * quantity;
  const { coupon, discount } = await quoteCoupon(item.userId, code, subtotal);
  res.json({ code: coupon.code, subtotal, discountAmount: discount, total: subtotal - discount });
}

/** Akun toko contoh dari `npm run seed`. Dibuat agar pengunjung bisa melihat tampilan, bukan untuk berjualan. */
export const DEMO_USERNAME = "demo";

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
  const quantity = Number(body.quantity);
  const couponInput = optionalString(body, "couponCode");
  const buyerName = optionalString(body, "buyerName");
  const buyerEmail = optionalString(body, "buyerEmail")?.toLowerCase();
  const note = optionalString(body, "note") ?? null;

  if (!buyerName) throw new ValidationError("Nama wajib diisi.");
  if (!buyerEmail || !EMAIL.test(buyerEmail)) throw new ValidationError("Email tidak valid.");
  if (note && note.length > 300) throw new ValidationError("Catatan maksimal 300 karakter.");

  const item = await findPayableItem(body.itemId, quantity);
  const unitPrice = item.price!;
  const subtotal = unitPrice * quantity;
  const quote = couponInput ? await quoteCoupon(item.userId, couponInput, subtotal) : null;
  const discountAmount = quote?.discount ?? 0;
  const grossAmount = subtotal - discountAmount;
  const orderCode = newOrderCode();

  try {
    const snap = await createSnapTransaction({
      orderCode,
      grossAmount,
      item: { id: item.id, name: item.title, price: unitPrice, quantity },
      ...(quote && { discount: { code: quote.coupon.code, amount: discountAmount } }),
      customer: { name: buyerName, email: buyerEmail },
    });

    await prisma.order.create({
      data: {
        orderCode,
        userId: item.userId,
        itemId: item.id,
        itemTitle: item.title,
        unitPrice,
        quantity,
        subtotal,
        couponCode: quote?.coupon.code ?? null,
        discountAmount,
        grossAmount,
        digitalFileKey: item.isDigital ? item.digitalFileKey : null,
        digitalFileName: item.isDigital ? item.digitalFileName : null,
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
