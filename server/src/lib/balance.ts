import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient | typeof prisma;

export interface Balance {
  /** Total pembayaran lunas (setelah diskon). */
  totalRevenue: number;
  /** Pencairan yang sedang diproses atau sudah ditransfer. Pengajuan yang ditolak tidak dihitung. */
  totalWithdrawn: number;
  pendingWithdrawal: number;
  availableBalance: number;
}

export async function getBalance(sellerId: string, db: Db = prisma): Promise<Balance> {
  const [revenue, payouts] = await Promise.all([
    db.order.aggregate({ where: { userId: sellerId, status: "PAID" }, _sum: { grossAmount: true } }),
    db.payout.groupBy({ by: ["status"], where: { sellerId, status: { in: ["PENDING", "APPROVED"] } }, _sum: { amount: true } }),
  ]);
  const sumOf = (status: string) => payouts.find((p) => p.status === status)?._sum.amount ?? 0;
  const totalRevenue = revenue._sum.grossAmount ?? 0;
  const pendingWithdrawal = sumOf("PENDING");
  const totalWithdrawn = pendingWithdrawal + sumOf("APPROVED");
  return { totalRevenue, totalWithdrawn, pendingWithdrawal, availableBalance: totalRevenue - totalWithdrawn };
}
