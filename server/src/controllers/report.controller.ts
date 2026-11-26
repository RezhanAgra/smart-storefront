import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { ValidationError } from "../lib/validation.js";
import { firstIssue, reportSchema } from "../lib/schemas.js";

/** POST /api/reports: publik. Laporan phishing/penipuan terhadap sebuah toko. */
export async function createReport(req: Request, res: Response): Promise<void> {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { targetUsername, ...data } = parsed.data;

  const target = await prisma.user.findUnique({ where: { username: targetUsername }, select: { id: true } });
  if (!target) {
    res.status(404).json({ message: "Toko tidak ditemukan." });
    return;
  }

  await prisma.report.create({ data: { ...data, reporterEmail: data.reporterEmail ?? null, targetUserId: target.id } });
  res.status(201).json({ message: "Laporan terkirim. Tim kami akan meninjaunya." });
}
