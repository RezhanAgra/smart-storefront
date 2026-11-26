import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const httpUrl = z
  .string()
  .trim()
  .url("URL tidak valid.")
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), "URL harus diawali http:// atau https://.");

/** String kosong dari form diperlakukan sebagai "hapus" (null). */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const socialLinkSchema = z.object({
  platform: z.string().trim().min(1, "Nama platform wajib diisi.").max(30),
  url: httpUrl,
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1, "Nama toko wajib diisi.").max(60, "Nama toko maksimal 60 karakter.").optional(),
  bio: z.preprocess(emptyToNull, z.string().trim().max(250, "Bio maksimal 250 karakter.").nullable()).optional(),
  avatarUrl: z.preprocess(emptyToNull, httpUrl.nullable()).optional(),
  themeColor: z.string().regex(HEX_COLOR, "Warna harus kode hex, misalnya #6366f1.").optional(),
  // Form bisa mengirim array langsung atau JSON string (misalnya dari multipart/form-data).
  socialLinks: z
    .preprocess((v) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return v; // biarkan gagal di validasi array di bawah
      }
    }, z.array(socialLinkSchema, { error: "socialLinks harus berupa daftar { platform, url }." }).max(8, "Maksimal 8 tautan sosial."))
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const reorderSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-f0-9]{24}$/i, "id item tidak valid."),
      orderIndex: z.number().int().min(0),
    }),
    { error: "Body harus berupa daftar { id, orderIndex }." },
  )
  .min(1)
  .max(500)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, "id item tidak boleh duplikat.");

/** Pesan error pertama dari Zod, untuk ditampilkan langsung ke user. */
export const firstIssue = (error: z.ZodError): string => error.issues[0]?.message ?? "Data tidak valid.";

const COUPON_CODE = /^[A-Z0-9]{3,20}$/;

export const couponCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(COUPON_CODE, "Kode promo 3 sampai 20 huruf/angka, tanpa spasi.")),
    type: z.enum(["PERCENT", "FIXED"], { error: 'type harus "PERCENT" atau "FIXED".' }),
    value: z.number({ error: "Nilai diskon wajib angka." }).int().min(1, "Nilai diskon minimal 1."),
    maxUses: z.number().int().min(1, "Batas pemakaian minimal 1.").nullable().optional(),
    expiresAt: z.coerce.date({ error: "Tanggal kedaluwarsa tidak valid." }).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((c) => c.type !== "PERCENT" || c.value <= 90, { message: "Diskon persen maksimal 90%.", path: ["value"] });

export const couponUpdateSchema = z.object({ isActive: z.boolean() });

// ---------- Checkout ----------

/** Nomor HP Indonesia: 08xx / 628xx / +628xx, 10 sampai 15 digit. Spasi, titik, dan tanda hubung diabaikan. */
const phoneSchema = z
  .string({ error: "Nomor WhatsApp/HP wajib diisi." })
  .transform((v) => v.replace(/[\s.\-()]/g, ""))
  .pipe(z.string().regex(/^(\+62|62|0)8\d{7,12}$/, "Nomor WhatsApp/HP tidak valid. Contoh: 081234567890."));

export const checkoutSchema = z.object({
  itemId: z.string().regex(/^[a-f0-9]{24}$/i, "Produk tidak valid."),
  quantity: z.coerce.number().int().min(1, "Jumlah minimal 1.").max(99, "Jumlah maksimal 99."),
  buyerName: z.string({ error: "Nama wajib diisi." }).trim().min(1, "Nama wajib diisi.").max(80),
  buyerEmail: z.string({ error: "Email wajib diisi." }).trim().toLowerCase().email("Email tidak valid."),
  note: z.preprocess(emptyToNull, z.string().trim().max(300, "Catatan maksimal 300 karakter.").nullable()).optional(),
  couponCode: z.preprocess(emptyToNull, z.string().trim().max(20).nullable()).optional(),
  // Wajib hanya untuk barang fisik; dicek di controller setelah item diketahui.
  shippingPhone: z.preprocess(emptyToNull, phoneSchema.nullable()).optional(),
  shippingAddress: z
    .preprocess(
      emptyToNull,
      z.string().trim().min(15, "Alamat pengiriman terlalu pendek. Sertakan jalan, kota, dan kode pos.").max(500).nullable(),
    )
    .optional(),
});

export const trackingSchema = z.object({
  trackingNumber: z.preprocess(
    emptyToNull,
    z.string().trim().min(3, "Nomor resi minimal 3 karakter.").max(60, "Nomor resi maksimal 60 karakter.").nullable(),
  ),
});

// ---------- Pencairan dana ----------

export const MIN_PAYOUT = 50_000;

export const payoutRequestSchema = z.object({
  amount: z.coerce
    .number({ error: "Nominal wajib angka." })
    .int("Nominal harus bilangan bulat.")
    .min(MIN_PAYOUT, `Minimal penarikan Rp ${MIN_PAYOUT.toLocaleString("id-ID")}.`),
  bankName: z.string({ error: "Nama bank/e-wallet wajib diisi." }).trim().min(2, "Nama bank/e-wallet wajib diisi.").max(40),
  accountNumber: z
    .string({ error: "Nomor rekening wajib diisi." })
    .transform((v) => v.replace(/[\s.\-]/g, ""))
    .pipe(z.string().regex(/^\+?\d{5,30}$/, "Nomor rekening/akun hanya berisi angka (5 sampai 30 digit).")),
  accountHolder: z.string({ error: "Nama pemilik rekening wajib diisi." }).trim().min(2, "Nama pemilik rekening wajib diisi.").max(80),
});

// ---------- Laporan & moderasi ----------

export const REPORT_REASONS = ["PHISHING", "PENIPUAN", "KONTEN_TERLARANG", "LAINNYA"] as const;

export const reportSchema = z.object({
  targetUsername: z.string().trim().toLowerCase().regex(/^[a-z0-9]{3,30}$/, "Toko tidak valid."),
  reason: z.enum(REPORT_REASONS, { error: "Pilih alasan laporan." }),
  description: z
    .string({ error: "Jelaskan apa yang terjadi." })
    .trim()
    .min(10, "Jelaskan minimal 10 karakter.")
    .max(1000, "Maksimal 1000 karakter."),
  reporterEmail: z.preprocess(emptyToNull, z.string().trim().toLowerCase().email("Email tidak valid.").nullable()).optional(),
});

export const suspendSchema = z
  .object({
    isSuspended: z.boolean({ error: "isSuspended harus boolean." }),
    suspendedReason: z.preprocess(emptyToNull, z.string().trim().max(300).nullable()).optional(),
  })
  .refine((v) => !v.isSuspended || Boolean(v.suspendedReason), {
    message: "Tulis alasan penonaktifan.",
    path: ["suspendedReason"],
  });

export const reportStatusSchema = z.object({
  status: z.enum(["RESOLVED", "DISMISSED"], { error: 'status harus "RESOLVED" atau "DISMISSED".' }),
});

export const payoutDecisionSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"], { error: 'status harus "APPROVED" atau "REJECTED".' }),
    adminNote: z.preprocess(emptyToNull, z.string().trim().max(300).nullable()).optional(),
  })
  .refine((v) => v.status !== "REJECTED" || Boolean(v.adminNote), {
    message: "Tulis alasan penolakan agar penjual tahu apa yang harus diperbaiki.",
    path: ["adminNote"],
  });
