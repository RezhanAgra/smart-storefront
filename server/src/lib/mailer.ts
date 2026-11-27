import nodemailer from "nodemailer";
import { env, mailEnabled } from "./env.js";
import { emailDomain, reportError } from "./sentry.js";

/** Jenis email, dipakai sebagai tag di Sentry saat pengiriman gagal. */
type MailKind = "order-paid-buyer" | "order-paid-seller" | "password-reset" | "verification" | "tracking";

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
async function send(kind: MailKind, to: string, subject: string, paragraphs: string[], replyTo?: string): Promise<void> {
  if (!transport) return;
  const html = paragraphs
    .map((p) => `<p>${escape(p).replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`)
    .join("");
  try {
    await transport.sendMail({ from: env.smtp.from, to, replyTo, subject, text: paragraphs.join("\n\n"), html });
  } catch (err) {
    // Biasanya SMTP tidak terjangkau, login SMTP salah, atau alamat ditolak server email.
    reportError(err, { area: "email", tags: { mail_kind: kind }, extra: { recipientDomain: emailDomain(to), smtpHost: env.smtp.host } });
    throw err;
  }
}

/** Kirim tanpa menggagalkan request: email yang gagal hanya dicatat di log. */
function sendQuietly(kind: MailKind, to: string, subject: string, paragraphs: string[], replyTo?: string): void {
  // Error sudah dicatat dan dilaporkan di send(); di sini cukup jangan sampai menggagalkan request.
  send(kind, to, subject, paragraphs, replyTo).catch(() => undefined);
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

  sendQuietly("order-paid-buyer", order.buyerEmail, `Pembayaran lunas: ${order.itemTitle}`, [
    `Halo ${order.buyerName},`,
    `Pembayaranmu di ${seller.displayName} sudah kami terima.`,
    `${line}. Kode pesanan: ${order.orderCode}.`,
    order.digitalFileName
      ? `File ${order.digitalFileName} bisa diunduh dari struk ini: ${receiptUrl}`
      : `Struk pesanan: ${receiptUrl}`,
    `Simpan email ini. Ada pertanyaan soal pesanan? Hubungi penjual lewat kontak di halaman tokonya.`,
  ]);

  sendQuietly("order-paid-seller", seller.email, `Pesanan baru lunas: ${order.itemTitle}`, [
    `Ada pesanan baru yang sudah dibayar.`,
    `${line}.`,
    `Pembeli: ${order.buyerName} (${order.buyerEmail}).`,
    ...(order.note ? [`Catatan pembeli: ${order.note}`] : []),
    `Detail lengkap di dashboard: ${env.clientUrl}/dashboard/orders`,
    `Balas email ini untuk menghubungi pembeli langsung.`,
  ], order.buyerEmail);
}

/** Dilempar ke pemanggil agar user tahu jika email reset gagal terkirim. */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  if (!transport) {
    console.log(["", "=".repeat(72), `  RESET PASSWORD (SMTP belum dikonfigurasi) untuk ${to}`, `  ${link}`, "=".repeat(72), ""].join("\n"));
    return;
  }
  return send("password-reset", to, "Atur ulang password smart-storefront", [
    `Kami menerima permintaan untuk mengatur ulang password akunmu.`,
    `Buka tautan ini dalam 1 jam: ${link}`,
    `Tidak merasa meminta? Abaikan email ini. Password lamamu tetap berlaku.`,
  ]);
}

/**
 * Email verifikasi pendaftaran. Tanpa SMTP (development), tautan dicetak di console server
 * supaya alur verifikasi tetap bisa diuji.
 */
export async function sendVerificationEmail(to: string, displayName: string, token: string): Promise<void> {
  const link = `${env.clientUrl}/verify-email?token=${token}`;
  if (!transport) {
    console.log(
      ["", "=".repeat(72), `  VERIFIKASI EMAIL (SMTP belum dikonfigurasi) untuk ${to}`, `  ${link}`, "=".repeat(72), ""].join("\n"),
    );
    return;
  }
  await send("verification", to, "Konfirmasi email akun smart-storefront", [
    `Halo ${displayName},`,
    `Konfirmasi email ini agar tokomu bisa mencairkan dana penjualan: ${link}`,
    `Tautan berlaku 24 jam. Tidak merasa mendaftar? Abaikan email ini.`,
  ]);
}

/** Kabari pembeli saat penjual mengisi nomor resi. Gagal kirim hanya dicatat di log. */
export function sendTrackingEmail(
  order: { orderCode: string; itemTitle: string; buyerName: string; buyerEmail: string; trackingNumber: string },
  sellerName: string,
): void {
  sendQuietly("tracking", order.buyerEmail, `Pesananmu sudah dikirim: ${order.itemTitle}`, [
    `Halo ${order.buyerName},`,
    `${sellerName} sudah mengirim pesananmu (${order.itemTitle}).`,
    `Nomor resi: ${order.trackingNumber}`,
    `Struk dan status pesanan: ${env.clientUrl}/order/${order.orderCode}`,
  ]);
}
