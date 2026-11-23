import type { CookieOptions, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { TOKEN_COOKIE, TOKEN_TTL_SECONDS, signToken } from "../middlewares/auth.middleware.js";
import { asBody, ValidationError } from "../lib/validation.js";
import { firstIssue, updateProfileSchema } from "../lib/schemas.js";

const USERNAME = /^[a-z0-9]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Nama yang bentrok dengan route statis di client Astro (/login, /dashboard, /404, dst).
const RESERVED_USERNAMES = new Set(["login", "logout", "register", "dashboard", "order", "api", "admin", "404", "500"]);

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

  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.status(201).json({ user, token });
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = asBody(req.body);
  const email = requireString(body.email, "Email wajib diisi.").toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  const found = await prisma.user.findUnique({ where: { email } });
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
