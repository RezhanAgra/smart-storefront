import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ValidationError } from "../lib/validation.js";
import { firstIssue, MIN_PAYOUT, payoutRequestSchema } from "../lib/schemas.js";
import { getBalance } from "../lib/balance.js";

const payoutSelect = {
  id: true,
  amount: true,
  bankName: true,
  accountNumber: true,
  accountHolder: true,
  status: true,
  adminNote: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PayoutSelect;

/** GET /api/payouts/summary: saldo penjual dan riwayat pengajuan pencairan. */
export async function getPayoutSummary(req: Request, res: Response): Promise<void> {
  const sellerId = req.userId!;
  const [balance, history, user] = await Promise.all([
    getBalance(sellerId),
    prisma.payout.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 100, select: payoutSelect }),
    prisma.user.findUnique({ where: { id: sellerId }, select: { emailVerified: true, isSuspended: true } }),
  ]);
  res.json({
    ...balance,
    minimumPayout: MIN_PAYOUT,
    canWithdraw: Boolean(user?.emailVerified) && !user?.isSuspended,
    emailVerified: Boolean(user?.emailVerified),
    isSuspended: Boolean(user?.isSuspended),
    history,
  });
}

/** POST /api/payouts: { amount, bankName, accountNumber, accountHolder } -> pengajuan PENDING. */
export async function requestPayout(req: Request, res: Response): Promise<void> {
  const sellerId = req.userId!;
  const parsed = payoutRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));

  const user = await prisma.user.findUnique({ where: { id: sellerId }, select: { emailVerified: true, isSuspended: true } });
  if (!user?.emailVerified) {
    res.status(403).json({ message: "Verifikasi email dulu sebelum mencairkan dana." });
    return;
  }
  if (user.isSuspended) {
    res.status(403).json({ message: "Toko sedang dinonaktifkan, jadi pencairan dana ditahan. Hubungi admin." });
    return;
  }

  try {
    const payout = await prisma.$transaction(async (tx) => {
      // Menulis dokumen user yang sama membuat dua pengajuan bersamaan saling bentrok (write conflict),
      // sehingga saldo tidak bisa ditarik dua kali.
      await tx.user.update({ where: { id: sellerId }, data: { payoutSeq: { increment: 1 } } });
      const { availableBalance } = await getBalance(sellerId, tx);
      if (parsed.data.amount > availableBalance) {
        throw new ValidationError(`Saldo tersedia hanya Rp ${availableBalance.toLocaleString("id-ID")}.`);
      }
      return tx.payout.create({ data: { ...parsed.data, sellerId }, select: payoutSelect });
    });
    res.status(201).json({ payout, ...(await getBalance(sellerId)) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      res.status(409).json({ message: "Ada pengajuan lain yang sedang diproses. Coba lagi." });
      return;
    }
    throw err;
  }
}
