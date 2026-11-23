import { randomBytes } from "node:crypto";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { env } from "../lib/env.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { cleanFileName, PRIVATE_DIR } from "../lib/digital.js";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_BYTES = 2 * 1024 * 1024;
// Ekstensi ditentukan dari tipe yang diizinkan, bukan dari nama file kiriman user.
const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomBytes(12).toString("hex")}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXTENSIONS),
});

const router = Router();

// Produk digital: dokumen, arsip, audio, video, dan gambar. Disimpan di folder privat.
const DIGITAL_MAX_BYTES = 25 * 1024 * 1024;
const DIGITAL_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "application/epub+zip": ".epub",
  "audio/mpeg": ".mp3",
  "video/mp4": ".mp4",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "text/plain": ".txt",
};
const digitalUpload = multer({
  storage: multer.diskStorage({
    destination: PRIVATE_DIR,
    filename: (_req, file, cb) => cb(null, `${randomBytes(12).toString("hex")}${DIGITAL_EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: DIGITAL_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in DIGITAL_EXTENSIONS),
});

/** POST /api/uploads/digital (multipart, field "file") -> { fileKey, fileName } */
router.post("/digital", requireAuth, digitalUpload.single("file"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ message: "Pilih file PDF, ZIP, EPUB, MP3, MP4, JPG, PNG, atau TXT." });
    return;
  }
  res.status(201).json({ fileKey: req.file.filename, fileName: cleanFileName(req.file.originalname) });
});

/** POST /api/uploads (multipart, field "image") -> { url } */
router.post("/", requireAuth, upload.single("image"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ message: "Pilih gambar JPG, PNG, atau WebP." });
    return;
  }
  res.status(201).json({ url: `${env.serverPublicUrl}/uploads/${req.file.filename}` });
});

router.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    const tooBig = req.path.startsWith("/digital") ? "Ukuran file maksimal 25 MB." : "Ukuran gambar maksimal 2 MB.";
    res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? tooBig : err.message });
    return;
  }
  next(err);
});

export default router;
