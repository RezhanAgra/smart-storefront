import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../lib/env.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Request dari server Astro (SSR) membawa header x-internal-key. Tanpa pengecualian ini, semua
 * pengunjung halaman toko berbagi satu IP (IP server Astro) dan batas per IP habis dalam hitungan menit.
 */
function isInternal(req: Request): boolean {
  const key = req.get("x-internal-key");
  if (!env.internalApiKey || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(env.internalApiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

const message = (text: string) => ({ message: text });

/** 100 request per 15 menit per IP untuk seluruh /api. */
export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Webhook Midtrans dikirim dari IP Midtrans dan diverifikasi lewat signature, jadi tidak dibatasi.
  skip: (req) => isInternal(req) || req.path.startsWith("/payments/"),
  message: message("Terlalu banyak permintaan. Coba lagi dalam beberapa menit."),
});

/** 10 percobaan per 15 menit per IP untuk login dan register (mencegah tebak password). */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi."),
});

/** 5 laporan per jam per IP untuk POST /api/reports, supaya formulir laporan tidak dipakai untuk spam. */
export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Terlalu banyak laporan dari jaringanmu. Coba lagi dalam 1 jam."),
});
