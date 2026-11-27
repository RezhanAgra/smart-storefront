import { PrismaClient } from "@prisma/client";

// Simpan instance di globalThis agar hot-reload `tsx watch` tidak membuat koneksi baru setiap kali file berubah.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Pesan error ringkas tanpa potongan kode dan nilai argumen query (bisa berisi email/alamat),
    // karena pesan ini ikut ke log dan Sentry.
    errorFormat: "minimal",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
