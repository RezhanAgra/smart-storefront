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
        },
      },
    },
  });

  if (!store) {
    res.status(404).json({ message: "Toko tidak ditemukan." });
    return;
  }

  // Client key Midtrans memang publik (dipakai snap.js di browser). Server key tidak pernah dikirim.
  const payments = paymentsEnabled()
    ? { enabled: true as const, clientKey: env.midtrans.clientKey, snapJsUrl: env.midtrans.snapJs }
    : { enabled: false as const };

  res.json({ ...store, payments });
}
