import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { env, paymentsEnabled } from "../lib/env.js";

export async function getStore(req: Request, res: Response): Promise<void> {
  const username = String(req.params.username ?? "").toLowerCase();

  const store = await prisma.user.findUnique({
    where: { username },
    select: {
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      themeColor: true,
      isVerified: true,
      isSuspended: true,
      suspendedReason: true,
      socialLinks: true,
      items: {
        where: { isActive: true },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          price: true,
          stock: true,
          url: true,
          imageUrl: true,
          orderIndex: true,
          isDigital: true,
          isPhysical: true,
        },
      },
    },
  });

  if (!store) {
    res.status(404).json({ message: "Toko tidak ditemukan." });
    return;
  }
  // Toko yang dinonaktifkan admin: isinya tidak dikirim sama sekali, hanya status dan alasannya.
  if (store.isSuspended) {
    res.status(403).json({ suspended: true, reason: store.suspendedReason ?? null });
    return;
  }
  const { isSuspended: _s, suspendedReason: _r, ...publicStore } = store;

  // Client key Midtrans memang publik (dipakai snap.js di browser). Server key tidak pernah dikirim.
  const payments = paymentsEnabled()
    ? { enabled: true as const, clientKey: env.midtrans.clientKey, snapJsUrl: env.midtrans.snapJs }
    : { enabled: false as const };

  res.json({ ...publicStore, payments });
}

/** GET /api/store: username toko yang punya minimal satu item aktif, untuk sitemap.xml. */
export async function listStores(_req: Request, res: Response): Promise<void> {
  const active = await prisma.item.findMany({ where: { isActive: true }, distinct: ["userId"], select: { userId: true } });
  const stores = await prisma.user.findMany({
    where: { id: { in: active.map((i) => i.userId) }, isSuspended: { not: true } },
    select: { username: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });
  res.json({ stores });
}
