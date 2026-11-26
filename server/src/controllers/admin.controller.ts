import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { isObjectId, ValidationError } from "../lib/validation.js";
import { firstIssue, payoutDecisionSchema, reportStatusSchema, suspendSchema } from "../lib/schemas.js";
import { getBalance } from "../lib/balance.js";

const notFound = (res: Response, what: string) => res.status(404).json({ message: `${what} tidak ditemukan.` });

/** GET /api/admin/overview: semua toko, laporan terbaru, dan pengajuan pencairan yang menunggu. */
export async function getOverview(_req: Request, res: Response): Promise<void> {
  const [users, reports, payouts] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        emailVerified: true,
        isSuspended: true,
        suspendedReason: true,
        createdAt: true,
        _count: { select: { items: true, orders: true, reports: true } },
      },
    }),
    prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { targetUser: { select: { id: true, username: true, displayName: true, isSuspended: true } } },
    }),
    prisma.payout.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { seller: { select: { id: true, username: true, displayName: true, email: true, isSuspended: true } } },
    }),
  ]);

  // Saldo penjual saat ini, supaya admin bisa memastikan pengajuan masih tertutup saldo sebelum transfer.
  const sellerIds = [...new Set(payouts.map((p) => p.sellerId))];
  const balances = Object.fromEntries(await Promise.all(sellerIds.map(async (id) => [id, await getBalance(id)] as const)));

  res.json({
    users: users.map((u) => ({ ...u, role: u.role ?? "SELLER", emailVerified: Boolean(u.emailVerified), isSuspended: Boolean(u.isSuspended) })),
    reports,
    payouts: payouts.map((p) => ({ ...p, sellerBalance: balances[p.sellerId] })),
  });
}

/** PATCH /api/admin/users/:id/suspend: { isSuspended, suspendedReason }. */
export async function setSuspended(req: Request, res: Response): Promise<void> {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { id } = req.params;
  const target = isObjectId(id) ? await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } }) : null;
  if (!target) return void notFound(res, "Toko");
  if (target.role === "ADMIN") throw new ValidationError("Akun admin tidak bisa dinonaktifkan dari sini.");

  const { isSuspended } = parsed.data;
  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      isSuspended,
      suspendedReason: isSuspended ? parsed.data.suspendedReason : null,
      suspendedAt: isSuspended ? new Date() : null,
    },
    select: { id: true, username: true, isSuspended: true, suspendedReason: true, suspendedAt: true },
  });
  res.json({ user });
}

/** PATCH /api/admin/reports/:id: { status: RESOLVED | DISMISSED }. */
export async function setReportStatus(req: Request, res: Response): Promise<void> {
  const parsed = reportStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { id } = req.params;
  const result = isObjectId(id) ? await prisma.report.updateMany({ where: { id }, data: { status: parsed.data.status } }) : { count: 0 };
  if (result.count === 0) return void notFound(res, "Laporan");
  res.json({ report: await prisma.report.findUnique({ where: { id: id as string } }) });
}

/**
 * PATCH /api/admin/payouts/:id: { status: APPROVED | REJECTED, adminNote }. Hanya pengajuan PENDING yang bisa
 * diputuskan, jadi klik ganda tidak memproses dua kali. APPROVED berarti admin sudah mentransfer dana.
 */
export async function decidePayout(req: Request, res: Response): Promise<void> {
  const parsed = payoutDecisionSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { id } = req.params;
  if (!isObjectId(id)) return void notFound(res, "Pengajuan");

  const result = await prisma.payout.updateMany({
    where: { id, status: "PENDING" },
    data: { status: parsed.data.status, adminNote: parsed.data.adminNote ?? null },
  });
  if (result.count === 0) {
    const exists = await prisma.payout.findUnique({ where: { id }, select: { status: true } });
    if (!exists) return void notFound(res, "Pengajuan");
    res.status(409).json({ message: `Pengajuan ini sudah ${exists.status === "APPROVED" ? "disetujui" : "ditolak"}.` });
    return;
  }
  res.json({ payout: await prisma.payout.findUnique({ where: { id } }) });
}
