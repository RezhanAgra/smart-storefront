import { prisma } from "./prisma.js";
import type { OrderStatus } from "./midtrans.js";
import { sendOrderPaidEmails } from "./mailer.js";

/**
 * Terapkan status dari Midtrans ke pesanan. Aman dipanggil berulang (webhook bisa dikirim lebih dari
 * sekali, dan client juga memanggil sync): stok hanya dikurangi sekali, saat transisi pertama ke PAID.
 */
export async function applyOrderStatus(orderCode: string, status: OrderStatus, paymentType?: string) {
  const order = await prisma.order.findUnique({ where: { orderCode } });
  if (!order) return null;
  if (order.status === "PAID") return order; // status final, abaikan notifikasi lama

  if (status === "PAID") {
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, status: { not: "PAID" } },
      data: { status: "PAID", paidAt: new Date(), paymentType },
    });
    if (claimed.count === 1) {
      // Pemakaian kode promo dihitung hanya untuk pesanan yang benar-benar lunas.
      if (order.couponCode) {
        await prisma.coupon.updateMany({
          where: { userId: order.userId, code: order.couponCode },
          data: { usedCount: { increment: 1 } },
        });
      }
      const decremented = await prisma.item.updateMany({
        where: { id: order.itemId, stock: { gte: order.quantity } },
        data: { stock: { decrement: order.quantity } },
      });
      // Stok sudah kurang dari jumlah dibayar (pesanan bersamaan): habiskan, jangan sampai minus.
      if (decremented.count === 0) {
        await prisma.item.updateMany({ where: { id: order.itemId, stock: { not: null } }, data: { stock: 0 } });
      }
      // Dikirim sekali, di transisi pertama ke PAID yang sama dengan pengurangan stok.
      const seller = await prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, displayName: true } });
      if (seller) sendOrderPaidEmails(order, seller);
    }
  } else if (status !== order.status) {
    await prisma.order.update({ where: { id: order.id }, data: { status, paymentType } });
  }

  return prisma.order.findUnique({ where: { orderCode } });
}
