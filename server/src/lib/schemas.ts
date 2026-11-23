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
