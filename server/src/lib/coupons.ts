import type { Coupon } from "@prisma/client";
import { prisma } from "./prisma.js";
import { ValidationError } from "./validation.js";

export interface CouponQuote {
  coupon: Coupon;
  discount: number;
}

/** Hitung diskon kupon milik penjual `userId` untuk `subtotal`. Melempar ValidationError jika tidak berlaku. */
export async function quoteCoupon(userId: string, rawCode: string, subtotal: number): Promise<CouponQuote> {
  const code = rawCode.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { userId_code: { userId, code } } });

  if (!coupon || !coupon.isActive) throw new ValidationError("Kode promo tidak ditemukan atau tidak aktif.");
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) throw new ValidationError("Kode promo sudah kedaluwarsa.");
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new ValidationError("Kuota kode promo sudah habis.");

  const discount = coupon.type === "PERCENT" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  // Midtrans menolak total 0, jadi diskon tidak boleh menghabiskan seluruh harga.
  if (discount >= subtotal) throw new ValidationError("Kode promo ini tidak berlaku untuk total sekecil ini.");

  return { coupon, discount };
}
