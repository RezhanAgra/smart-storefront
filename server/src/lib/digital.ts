import { existsSync } from "node:fs";
import path from "node:path";

/** File produk digital. Folder ini TIDAK disajikan oleh express.static; hanya bisa diunduh lewat struk lunas. */
export const PRIVATE_DIR = path.resolve(process.cwd(), "private-uploads");

/** Format key yang dibuat upload route: 24 hex + ekstensi. Mencegah path traversal saat key dipakai. */
const FILE_KEY = /^[a-f0-9]{24}\.[a-z0-9]{2,5}$/;

export const isDigitalFileKey = (value: unknown): value is string => typeof value === "string" && FILE_KEY.test(value);

export const digitalFilePath = (key: string) => path.join(PRIVATE_DIR, key);

export const digitalFileExists = (key: string) => isDigitalFileKey(key) && existsSync(digitalFilePath(key));

/** Nama file yang aman untuk header Content-Disposition. */
export function cleanFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "file";
}

/** Batas unduhan per pesanan, supaya satu link struk tidak dibagikan tanpa batas. */
export const MAX_DOWNLOADS = 10;
