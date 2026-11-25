import nodemailer from "nodemailer";
import { env, mailEnabled } from "./env.js";

const transport = mailEnabled()
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Email teks biasa plus versi HTML sederhana dari paragraf yang sama. */
async function send(to: string, subject: string, paragraphs: string[], replyTo?: string): Promise<void> {
  if (!transport) return;
  const html = paragraphs
    .map((p) => `<p>${escape(p).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`)
    .join("");
  await transport.sendMail({ from: env.smtp.from, to, replyTo, subject, text: paragraphs.join("\n\n"), html });
}

/** Kirim tanpa menggagalkan request: email yang gagal hanya dicatat di log. */
function sendQuietly(to: string, subject: string, paragraphs: string[], replyTo?: string): void {
  send(to, subject, paragraphs, replyTo).catch((err) => console.error(`Gagal mengirim email ke ${to}:`, err));
}

interface PaidOrder {
  orderCode: string;
  itemTitle: string;
  quantity: number;
  grossAmount: number;
  buyerName: string;
  buyerEmail: string;
  note: string | null;
  digitalFileName: string | null;
}

export function sendOrderPaidEmails(order: PaidOrder, seller: { email: string; displayName: string }): void {
  const receiptUrl = `${env.clientUrl}/order/${order.orderCode}`;
  const line = `${order.itemTitle} x ${order.quantity}, total ${rupiah.format(order.grossAmount)}`;

  sendQuietly(order.buyerEmail, `Pembayaran lunas: ${order.itemTitle}`, [
    `Halo ${order.buyerName},`,
    `Pembayaranmu di ${seller.displayName} sudah kami terima.`,
    `${line}. Kode pesanan: ${order.orderCode}.`,
    order.digitalFileName
      ? `File ${order.digitalFileName} bisa diunduh dari struk ini: ${receiptUrl}`
      : `Struk pesanan: ${receiptUrl}`,
    `Simpan email ini. Ada pertanyaan soal pesanan? Hubungi penjual lewat kontak di halaman tokonya.`,
  ]);

  sendQuietly(seller.email, `Pesanan baru lunas: ${order.itemTitle}`, [
    `Ada pesanan baru yang sudah dibayar.`,
    `${line}.`,
    `Pembeli: ${order.buyerName} (${order.buyerEmail}).`,
    ...(order.note ? [`Catatan pembeli: ${order.note}`] : []),
    `Detail lengkap di dashboard: ${env.clientUrl}/dashboard/orders`,
    `Balas email ini untuk menghubungi pembeli langsung.`,
  ], order.buyerEmail);
}

/** Dilempar ke pemanggil agar user tahu jika email reset gagal terkirim. */
export function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  return send(to, "Atur ulang password smart-storefront", [
    `Kami menerima permintaan untuk mengatur ulang password akunmu.`,
    `Buka tautan ini dalam 1 jam: ${link}`,
    `Tidak merasa meminta? Abaikan email ini. Password lamamu tetap berlaku.`,
  ]);
}
