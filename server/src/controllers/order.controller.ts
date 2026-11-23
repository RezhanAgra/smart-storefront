import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

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

  const { user, grossAmount, ...rest } = order;
  res.json({ ...rest, totalAmount: grossAmount, store: user });
}
