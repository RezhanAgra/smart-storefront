import { randomBytes } from "node:crypto";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { env } from "../lib/env.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

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

/** POST /api/uploads (multipart, field "image") -> { url } */
router.post("/", requireAuth, upload.single("image"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ message: "Pilih gambar JPG, PNG, atau WebP." });
    return;
  }
  res.status(201).json({ url: `${env.apiPublicUrl}/uploads/${req.file.filename}` });
});

router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Ukuran gambar maksimal 2 MB." : err.message });
    return;
  }
  next(err);
});

export default router;
