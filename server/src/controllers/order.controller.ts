import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { digitalFileExists, digitalFilePath, MAX_DOWNLOADS } from "../lib/digital.js";

const STATUSES = new Set(["PENDING", "PAID", "FAILED"]);

/** GET /api/orders?status=PAID: pesanan milik penjual yang login, terbaru dulu. */
export async function listOrders(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === "string" && STATUSES.has(req.query.status) ? req.query.status : undefined;
  const orders = await prisma.order.findMany({
    where: { userId: req.userId, ...(status && { status }) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      orderCode: true,
      itemTitle: true,
      quantity: true,
      grossAmount: true,
      subtotal: true,
      couponCode: true,
      discountAmount: true,
      digitalFileName: true,
      downloadCount: true,
      buyerName: true,
      buyerEmail: true,
      note: true,
      status: true,
      paymentType: true,
      paidAt: true,
      createdAt: true,
    },
  });
  res.json({ orders });
}

const ORDER_CODE = /^SS-[A-Z0-9-]{6,40}$/;

/**
 * GET /api/orders/status/:orderCode: publik, untuk halaman struk pembeli. Siapa pun yang tahu kode
 * pesanan bisa membuka struk ini, jadi email, catatan, dan id internal tidak ikut dikirim.
 */
export async function getOrderStatus(req: Request, res: Response): Promise<void> {
  const orderCode = String(req.params.orderCode ?? "");
  const order = ORDER_CODE.test(orderCode)
    ? await prisma.order.findUnique({
        where: { orderCode },
        select: {
          orderCode: true,
          buyerName: true,
          itemTitle: true,
          unitPrice: true,
          quantity: true,
          grossAmount: true,
          subtotal: true,
          couponCode: true,
          discountAmount: true,
          digitalFileName: true,
          downloadCount: true,
          status: true,
          paymentType: true,
          paidAt: true,
          createdAt: true,
          user: { select: { displayName: true, username: true } },
        },
      })
    : null;

  if (!order) {
    res.status(404).json({ message: "Pesanan tidak ditemukan." });
    return;
  }

  const { user, grossAmount, digitalFileName, downloadCount, subtotal, discountAmount, ...rest } = order;
  res.json({
    ...rest,
    subtotal: subtotal ?? order.unitPrice * order.quantity,
    discountAmount: discountAmount ?? 0,
    totalAmount: grossAmount,
    store: user,
    // Info file digital saja; tautan unduh hanya aktif jika lunas.
    digital: digitalFileName
      ? { fileName: digitalFileName, downloadsLeft: Math.max(0, MAX_DOWNLOADS - (downloadCount ?? 0)) }
      : null,
  });
}

/**
 * GET /api/orders/download/:orderCode: publik, untuk pembeli. Hanya untuk pesanan PAID yang berisi
 * produk digital, maksimal MAX_DOWNLOADS kali. Kode pesanan (48 bit acak) berfungsi sebagai kunci.
 */
export async function downloadDigital(req: Request, res: Response): Promise<void> {
  const orderCode = String(req.params.orderCode ?? "");
  const order = ORDER_CODE.test(orderCode)
    ? await prisma.order.findUnique({
        where: { orderCode },
        select: { id: true, status: true, digitalFileKey: true, digitalFileName: true, downloadCount: true },
      })
    : null;

  if (!order || !order.digitalFileKey) {
    res.status(404).json({ message: "File tidak ditemukan untuk pesanan ini." });
    return;
  }
  if (order.status !== "PAID") {
    res.status(403).json({ message: "File bisa diunduh setelah pembayaran lunas." });
    return;
  }
  if ((order.downloadCount ?? 0) >= MAX_DOWNLOADS) {
    res.status(429).json({ message: `Batas ${MAX_DOWNLOADS} kali unduhan sudah tercapai. Hubungi penjual.` });
    return;
  }
  if (!digitalFileExists(order.digitalFileKey)) {
    res.status(410).json({ message: "File sudah tidak tersedia di server. Hubungi penjual." });
    return;
  }

  await prisma.order.update({ where: { id: order.id }, data: { downloadCount: { increment: 1 } } });
  res.download(digitalFilePath(order.digitalFileKey), order.digitalFileName ?? order.digitalFileKey);
}
