/**
 * npm run seed: membuat toko contoh di /demo (tautan "Akun Demo" di landing page).
 * Aman dijalankan berulang: jika akun demo sudah ada, isinya dibiarkan.
 * Toko ini hanya untuk dilihat. Checkout untuk akun demo ditolak oleh server.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const existing = await prisma.user.findUnique({ where: { username: "demo" } });
if (existing) {
  console.log("Akun demo sudah ada, tidak diubah: /demo");
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
      socialLinks: [
        { platform: "Instagram", url: "https://instagram.com" },
        { platform: "TikTok", url: "https://tiktok.com" },
      ],
    },
  });

  const items = [
    { type: "link", title: "Katalog lengkap di Instagram", url: "https://instagram.com", description: "Contoh kartu tautan" },
    { type: "link", title: "Tanya stok via WhatsApp", url: "https://wa.me/", description: null },
    { type: "product", title: "Kopi Arabika Gayo 250 g", price: 75000, stock: 12, description: "Contoh kartu produk fisik dengan stok." },
    { type: "product", title: "E-book Resep Kopi Rumahan", price: 35000, stock: null, isDigital: true, description: "Contoh produk digital: file bisa diunduh dari struk setelah lunas." },
  ];
  for (const [orderIndex, item] of items.entries()) {
    await prisma.item.create({ data: { ...item, orderIndex, userId: user.id } });
  }
  await prisma.coupon.create({ data: { userId: user.id, code: "HEMAT20", type: "PERCENT", value: 20 } });
  console.log("Toko demo dibuat: /demo");
}

await prisma.$disconnect();
