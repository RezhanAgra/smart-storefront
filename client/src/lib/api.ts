import type { AstroGlobal } from "astro";
import type { UserProfile } from "../types/store";

export const API_URL = (import.meta.env.PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/$/, "");

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export const formatRupiah = (value: number): string => rupiah.format(value);

const number = new Intl.NumberFormat("id-ID");
export const formatNumber = (value: number): string => number.format(value);

/** Ambil pesan error dari respons API, dengan cadangan jika body bukan JSON. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    /* body kosong atau bukan JSON */
  }
  return fallback;
}

/**
 * Fetch dari server Astro (SSR) ke API. Header x-internal-key membebaskan request SSR dari rate limit
 * per IP, karena semua pengunjung tampil sebagai satu IP (server Astro). Jangan dipakai di script browser.
 */
export function ssrFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const key = import.meta.env.INTERNAL_API_KEY;
  if (key) headers.set("x-internal-key", key);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

/** Cek sesi di sisi server Astro memakai cookie `token` milik browser. */
export async function getSessionUser(token: string | undefined): Promise<UserProfile | null> {
  if (!token) return null;
  try {
    const res = await ssrFetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: UserProfile };
    return data.user;
  } catch {
    return null;
  }
}

/** Untuk halaman dashboard: user yang login, atau `null` jika harus diarahkan ke /login. */
export const requireUser = (astro: AstroGlobal) => getSessionUser(astro.cookies.get("token")?.value);

/** Host publik untuk ditampilkan, misalnya "localhost:4321" atau "tokoku.id". */
export const siteHost = (site: URL | undefined, fallback: URL): string => (site ?? fallback).host;
