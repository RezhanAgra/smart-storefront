import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { isObjectId, ValidationError } from "../lib/validation.js";
import { couponCreateSchema, couponUpdateSchema, firstIssue } from "../lib/schemas.js";

/** GET /api/coupons */
export async function listCoupons(req: Request, res: Response): Promise<void> {
  const coupons = await prisma.coupon.findMany({ where: { userId: req.userId }, orderBy: { createdAt: "desc" } });
  res.json({ coupons });
}

/** POST /api/coupons */
export async function createCoupon(req: Request, res: Response): Promise<void> {
  const parsed = couponCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  try {
    const coupon = await prisma.coupon.create({ data: { ...parsed.data, userId: req.userId! } });
    res.status(201).json({ coupon });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ message: `Kode ${parsed.data.code} sudah kamu pakai.` });
      return;
    }
    throw err;
  }
}

/** PUT /api/coupons/:id (aktif/nonaktif) */
export async function updateCoupon(req: Request, res: Response): Promise<void> {
  const parsed = couponUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { id } = req.params;
  const result = isObjectId(id)
    ? await prisma.coupon.updateMany({ where: { id, userId: req.userId }, data: parsed.data })
    : { count: 0 };
  if (result.count === 0) {
    res.status(404).json({ message: "Kode promo tidak ditemukan." });
    return;
  }
  res.json({ coupon: await prisma.coupon.findUnique({ where: { id: id as string } }) });
}

/** DELETE /api/coupons/:id */
export async function deleteCoupon(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const result = isObjectId(id) ? await prisma.coupon.deleteMany({ where: { id, userId: req.userId } }) : { count: 0 };
  if (result.count === 0) {
    res.status(404).json({ message: "Kode promo tidak ditemukan." });
    return;
  }
  res.status(204).end();
}
