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
