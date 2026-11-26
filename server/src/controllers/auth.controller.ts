import type { CookieOptions, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env, mailEnabled } from "../lib/env.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/mailer.js";
import { digitalFilePath, isDigitalFileKey } from "../lib/digital.js";
import { DEMO_USERNAME } from "./checkout.controller.js";
import { TOKEN_COOKIE, TOKEN_TTL_SECONDS, signToken } from "../middlewares/auth.middleware.js";
import { asBody, ValidationError } from "../lib/validation.js";
import { firstIssue, updateProfileSchema } from "../lib/schemas.js";

const USERNAME = /^[a-z0-9]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Nama yang bentrok dengan route statis di client Astro (/login, /dashboard, /404, dst).
const RESERVED_USERNAMES = new Set(["login", "logout", "register", "dashboard", "order", "demo", "api", "admin", "verify-email", "404", "500"]);

/** Field user yang aman dikirim ke client (tanpa passwordHash). */
export const publicUserSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  themeColor: true,
  isVerified: true,
  socialLinks: true,
  role: true,
  emailVerified: true,
  isSuspended: true,
  suspendedReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.isProduction,
  path: "/",
};

function setAuthCookie(res: Response, token: string): void {
  res.cookie(TOKEN_COOKIE, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(message);
  return value.trim();
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const username = requireString(body.username, "Username wajib diisi.").toLowerCase();
  const email = requireString(body.email, "Email wajib diisi.").toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : username;

  if (!USERNAME.test(username)) {
    throw new ValidationError("Username hanya boleh huruf kecil dan angka, 3 sampai 30 karakter.");
  }
  if (RESERVED_USERNAMES.has(username)) throw new ValidationError("Username ini tidak bisa dipakai.");
  if (!EMAIL.test(email)) throw new ValidationError("Format email tidak valid.");
  if (password.length < 8) throw new ValidationError("Password minimal 8 karakter.");

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true },
  });
  if (existing) {
    res.status(409).json({
      message: existing.username === username ? "Username sudah dipakai." : "Email sudah terdaftar.",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, displayName },
    select: publicUserSelect,
  });

  // Pendaftaran tetap berhasil walau email gagal terkirim: user bisa memakai tombol kirim ulang di dashboard.
  await issueVerification(user.id, user.email, user.displayName).catch((err) =>
    console.error(`Gagal mengirim email verifikasi ke ${user.email}:`, err),
  );

  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.status(201).json({ user, token });
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const email = requireString(body.email, "Email wajib diisi.").toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  // Select eksplisit: field internal (hash password, token reset) tidak boleh ikut ke respons.
  const found = await prisma.user.findUnique({ where: { email }, select: { ...publicUserSelect, passwordHash: true } });
  // Pesan sama untuk email salah dan password salah, supaya tidak membocorkan email yang terdaftar.
  if (!found || !(await bcrypt.compare(password, found.passwordHash))) {
    res.status(401).json({ message: "Email atau password salah." });
    return;
  }

  const { passwordHash: _omit, ...user } = found;
  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.json({ user, token });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(TOKEN_COOKIE, cookieOptions);
  res.json({ message: "Berhasil logout." });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: publicUserSelect });
  if (!user) {
    res.status(401).json({ message: "Akun tidak ditemukan." });
    return;
  }
  res.json({ user });
}

/** PUT /api/auth/profile: ubah profil toko milik user yang login. Field yang tidak dikirim tidak diubah. */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: parsed.data,
    select: publicUserSelect,
  });
  res.json({ user });
}

/** Password user yang login harus cocok, atau melempar 400. Dipakai untuk aksi sensitif. */
async function verifyCurrentPassword(userId: string | undefined, password: unknown): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ValidationError("Password saat ini salah.");
  }
}

/** PUT /api/auth/password: { currentPassword, newPassword } */
export async function changePassword(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 8) throw new ValidationError("Password baru minimal 8 karakter.");
  await verifyCurrentPassword(req.userId, body.currentPassword);

  await prisma.user.update({
    where: { id: req.userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), resetTokenHash: null, resetTokenExpires: null },
  });
  res.json({ message: "Password berhasil diganti." });
}

/**
 * DELETE /api/auth/account: { password }. Menghapus user beserta item, pesanan, analitik, dan kupon
 * (cascade di skema), lalu file produk digital miliknya.
 */
export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  await verifyCurrentPassword(req.userId, body.password);

  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  if (user?.username === DEMO_USERNAME) throw new ValidationError("Akun demo tidak bisa dihapus dari sini.");

  const files = await prisma.item.findMany({
    where: { userId: req.userId, digitalFileKey: { not: null } },
    select: { digitalFileKey: true },
  });
  await prisma.user.delete({ where: { id: req.userId } });
  await Promise.all(
    files.map(({ digitalFileKey: key }) =>
      isDigitalFileKey(key) ? unlink(digitalFilePath(key)).catch(() => undefined) : undefined,
    ),
  );

  res.clearCookie(TOKEN_COOKIE, cookieOptions);
  res.json({ message: "Akun dihapus." });
}

const RESET_TTL_MS = 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/** Buat token verifikasi baru (yang lama otomatis tidak berlaku) dan kirim tautannya. */
async function issueVerification(userId: string, email: string, displayName: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationTokenHash: hashToken(token),
      verificationExpires: new Date(Date.now() + VERIFY_TTL_MS),
      verificationSentAt: new Date(),
    },
  });
  await sendVerificationEmail(email, displayName, token);
}

/** GET /api/auth/verify-email?token=...: dipanggil halaman /verify-email. */
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    res.status(400).json({ message: "Tautan verifikasi tidak valid." });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { verificationTokenHash: hashToken(token), verificationExpires: { gt: new Date() } },
    select: { id: true, email: true },
  });
  if (!user) {
    res.status(400).json({ message: "Tautan verifikasi tidak valid atau sudah kedaluwarsa. Kirim ulang dari dashboard." });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationTokenHash: null, verificationExpires: null },
  });
  res.json({ verified: true, email: user.email });
}

/** POST /api/auth/resend-verification: kirim ulang tautan, maksimal sekali per menit. */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, displayName: true, emailVerified: true, verificationSentAt: true },
  });
  if (!user) {
    res.status(401).json({ message: "Akun tidak ditemukan." });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ message: "Email kamu sudah terverifikasi." });
    return;
  }
  const waitMs = (user.verificationSentAt?.getTime() ?? 0) + RESEND_COOLDOWN_MS - Date.now();
  if (waitMs > 0) {
    res.status(429).json({ message: `Tunggu ${Math.ceil(waitMs / 1000)} detik sebelum mengirim ulang.` });
    return;
  }
  try {
    await issueVerification(user.id, user.email, user.displayName);
  } catch (err) {
    console.error(`Gagal mengirim ulang email verifikasi ke ${user.email}:`, err);
    res.status(502).json({ message: "Email belum bisa dikirim. Coba lagi beberapa saat lagi." });
    return;
  }
  res.json({ message: `Tautan verifikasi dikirim ke ${user.email}.` });
}

/**
 * POST /api/auth/forgot-password: { email }. Jawabannya selalu sama untuk email terdaftar atau tidak,
 * supaya endpoint ini tidak bisa dipakai menebak email yang terdaftar.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  if (!mailEnabled()) {
    res.status(503).json({ message: "Reset password lewat email belum diaktifkan. Hubungi pengelola situs." });
    return;
  }
  const email = requireString(asBody(req.body).email, "Email wajib diisi.").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: hashToken(token), resetTokenExpires: new Date(Date.now() + RESET_TTL_MS) },
    });
    try {
      await sendPasswordResetEmail(email, token);
    } catch (err) {
      console.error("Gagal mengirim email reset password:", err);
      res.status(502).json({ message: "Email gagal dikirim. Coba lagi beberapa menit lagi." });
      return;
    }
  }
  res.json({ message: "Jika email itu terdaftar, tautan reset sudah dikirim. Cek juga folder spam." });
}

/** POST /api/auth/reset-password: { token, password }. Token sekali pakai. */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ValidationError("Tautan reset tidak valid.");
  if (password.length < 8) throw new ValidationError("Password minimal 8 karakter.");

  const user = await prisma.user.findFirst({
    where: { resetTokenHash: hashToken(token), resetTokenExpires: { gt: new Date() } },
    select: { id: true },
  });
  if (!user) throw new ValidationError("Tautan reset sudah kedaluwarsa atau sudah dipakai. Minta tautan baru.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), resetTokenHash: null, resetTokenExpires: null },
  });
  res.json({ message: "Password baru tersimpan. Silakan masuk." });
}
