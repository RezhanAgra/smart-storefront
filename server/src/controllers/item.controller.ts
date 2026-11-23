import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  asBody,
  isObjectId,
  optionalInt,
  optionalString,
  optionalUrl,
  ValidationError,
  type Body,
} from "../lib/validation.js";
import { firstIssue, reorderSchema } from "../lib/schemas.js";

const ITEM_TYPES = ["link", "product"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

function parseType(value: unknown): ItemType | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && (ITEM_TYPES as readonly string[]).includes(value)) return value as ItemType;
  throw new ValidationError('type harus "link" atau "product".');
}

/** Field yang boleh diisi user, dipakai bersama oleh create dan update. */
function parseEditableFields(body: Body) {
  const isActive = body.isActive;
  if (isActive !== undefined && typeof isActive !== "boolean") throw new ValidationError("isActive harus boolean.");

  return {
    type: parseType(body.type),
    description: optionalString(body, "description"),
    price: optionalInt(body, "price"),
    stock: optionalInt(body, "stock"),
    url: optionalUrl(body, "url"),
    imageUrl: optionalUrl(body, "imageUrl"),
    orderIndex: optionalInt(body, "orderIndex"),
    isActive: isActive as boolean | undefined,
  };
}

/** Ambil item hanya jika milik user yang login. `null` berarti tidak ada atau bukan miliknya. */
async function findOwnedItem(req: Request) {
  const { id } = req.params;
  if (!isObjectId(id)) return null;
  return prisma.item.findFirst({ where: { id, userId: req.userId } });
}

export async function listItems(req: Request, res: Response): Promise<void> {
  const items = await prisma.item.findMany({
    where: { userId: req.userId },
    orderBy: { orderIndex: "asc" },
  });
  res.json({ items });
}

export async function createItem(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const body = asBody(req.body);
  const title = optionalString(body, "title");
  if (!title) throw new ValidationError("Judul wajib diisi.");

  const fields = parseEditableFields(body);
  const type = fields.type ?? "product";
  if (type === "link" && !fields.url) throw new ValidationError("Item bertipe link wajib punya url.");

  // Item baru ditaruh di urutan paling bawah kecuali orderIndex dikirim.
  const orderIndex = fields.orderIndex ?? (await prisma.item.count({ where: { userId } }));

  const data: Prisma.ItemUncheckedCreateInput = {
    ...fields,
    type,
    title,
    orderIndex,
    userId,
  };
  const item = await prisma.item.create({ data });
  res.status(201).json({ item });
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const existing = await findOwnedItem(req);
  if (!existing) {
    res.status(404).json({ message: "Item tidak ditemukan." });
    return;
  }

  const body = asBody(req.body);
  const title = optionalString(body, "title");
  if (title === null) throw new ValidationError("Judul tidak boleh kosong.");

  const fields = parseEditableFields(body);
  const nextType = fields.type ?? existing.type;
  const nextUrl = fields.url === undefined ? existing.url : fields.url;
  if (nextType === "link" && !nextUrl) throw new ValidationError("Item bertipe link wajib punya url.");

  const item = await prisma.item.update({
    where: { id: existing.id },
    data: { ...fields, title },
  });
  res.json({ item });
}

export async function deleteItem(req: Request, res: Response): Promise<void> {
  const existing = await findOwnedItem(req);
  if (!existing) {
    res.status(404).json({ message: "Item tidak ditemukan." });
    return;
  }

  await prisma.item.delete({ where: { id: existing.id } });
  res.status(204).end();
}

/**
 * PATCH /api/items/reorder: body [{ id, orderIndex }]. Semua item harus milik user yang login,
 * dan semua update dijalankan dalam satu transaksi (semua berhasil atau tidak sama sekali).
 */
export async function reorderItems(req: Request, res: Response): Promise<void> {
  const userId = req.userId!;
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));

  const ids = parsed.data.map((i) => i.id);
  const owned = await prisma.item.count({ where: { id: { in: ids }, userId } });
  if (owned !== ids.length) {
    res.status(404).json({ message: "Sebagian item tidak ditemukan." });
    return;
  }

  await prisma.$transaction(
    parsed.data.map(({ id, orderIndex }) => prisma.item.update({ where: { id }, data: { orderIndex } })),
  );

  const items = await prisma.item.findMany({ where: { userId }, orderBy: { orderIndex: "asc" } });
  res.json({ items });
}
