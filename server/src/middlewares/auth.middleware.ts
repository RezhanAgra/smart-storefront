import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";

export const TOKEN_COOKIE = "token";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
}

function readToken(req: Request): string | undefined {
  const fromCookie: unknown = req.cookies?.[TOKEN_COOKIE];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim() || undefined;

  return undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: "Silakan login terlebih dahulu." });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Payload token tidak valid");
    }
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ message: "Sesi tidak valid atau sudah kedaluwarsa." });
  }
}
