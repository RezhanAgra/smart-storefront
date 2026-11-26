/**
 * npm run seed:
 * 1. Toko contoh di /demo (tautan "Akun Demo" di landing page). Checkout untuk akun demo ditolak server.
 * 2. Akun super admin untuk halaman /admin.
 * Aman dijalankan berulang.
 *
 * Admin diambil dari ADMIN_EMAIL dan ADMIN_PASSWORD. Tanpa keduanya, di luar production dipakai akun
 * pengembangan admin@smartstore.id / admin1234. Di production password default itu ditolak, karena
 * siapa pun yang membaca kode ini bisa login sebagai admin.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === "production";

// ---------- 1. Toko demo ----------
const existing = await prisma.user.findUnique({ where: { username: "demo" } });
if (existing) {
  // Lengkapi akun demo lama dengan field baru tanpa mengubah isi lainnya.
  await prisma.user.update({ where: { id: existing.id }, data: { emailVerified: true } });
  await prisma.item.updateMany({
    where: { userId: existing.id, type: "product", isDigital: { not: true } },
    data: { isPhysical: true },
  });
  console.log("Akun demo sudah ada: email ditandai terverifikasi, produk non-digital ditandai barang fisik. /demo");
} else {
  // Password acak yang tidak disimpan di mana pun: akun ini tidak untuk login.
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
  const user = await prisma.user.create({
    data: {
      username: "demo",
      email: "demo@smartstorefront.invalid",
      passwordHash,
      displayName: "Toko Demo",
      bio: "Ini toko contoh untuk melihat tampilan halaman SmartStorefront. Produk di sini tidak dijual sungguhan.",
      themeColor: "#22d3ee",
      emailVerified: true,
      socialLinks: [
        { platform: "Instagram", url: "https://instagram.com" },
        { platform: "TikTok", url: "https://tiktok.com" },
      ],
    },
  });

  const items = [
    { type: "link", title: "Katalog lengkap di Instagram", url: "https://instagram.com", description: "Contoh kartu tautan" },
    { type: "link", title: "Tanya stok via WhatsApp", url: "https://wa.me/", description: null },
    {
      type: "product",
      title: "Kopi Arabika Gayo 250 g",
      price: 75000,
      stock: 12,
      isPhysical: true,
      description: "Contoh barang fisik: pembeli mengisi alamat, penjual mengisi nomor resi.",
    },
    {
      type: "product",
      title: "E-book Resep Kopi Rumahan",
      price: 35000,
      stock: null,
      isDigital: true,
      description: "Contoh produk digital: file bisa diunduh dari struk setelah lunas.",
    },
  ];
  for (const [orderIndex, item] of items.entries()) {
    await prisma.item.create({ data: { ...item, orderIndex, userId: user.id } });
  }
  await prisma.coupon.create({ data: { userId: user.id, code: "HEMAT20", type: "PERCENT", value: 20 } });
  console.log("Toko demo dibuat: /demo");
}

// ---------- 2. Super admin ----------
const DEV_EMAIL = "admin@smartstore.id";
const DEV_PASSWORD = "admin1234";
const adminEmail = (process.env.ADMIN_EMAIL || (isProduction ? "" : DEV_EMAIL)).toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? "" : DEV_PASSWORD);

if (!adminEmail || !adminPassword) {
  console.log("Akun admin dilewati: isi ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 12 karakter) lalu jalankan seed lagi.");
} else if (isProduction && (adminPassword === DEV_PASSWORD || adminPassword.length < 12)) {
  console.error("Akun admin TIDAK dibuat: di production ADMIN_PASSWORD minimal 12 karakter dan bukan password contoh.");
  process.exitCode = 1;
} else {
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (admin) {
    // Jangan menimpa password admin yang sudah ada; cukup pastikan role-nya.
    await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN", emailVerified: true } });
    console.log(`Akun admin sudah ada: ${adminEmail} (role dipastikan ADMIN, password tidak diubah).`);
  } else {
    const username = (await prisma.user.findUnique({ where: { username: "superadmin" } }))
      ? `superadmin${randomBytes(2).toString("hex")}`
      : "superadmin";
    await prisma.user.create({
      data: {
        username,
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        displayName: "Super Admin",
        role: "ADMIN",
        emailVerified: true,
      },
    });
    console.log(`Akun admin dibuat: ${adminEmail}${isProduction ? "" : ` / ${adminPassword} (khusus pengembangan)`}. Buka /admin.`);
  }
}

await prisma.$disconnect();
