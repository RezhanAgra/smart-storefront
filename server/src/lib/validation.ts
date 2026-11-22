/** Helper kecil untuk membaca `req.body` (bertipe `any` di Express) secara type-safe. */

export type Body = Record<string, unknown>;

export function asBody(value: unknown): Body {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Body) : {};
}

export function optionalString(body: Body, key: string): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${key} harus berupa teks.`);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function optionalInt(body: Body, key: string): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isInteger(num) || num < 0) {
    throw new ValidationError(`${key} harus bilangan bulat 0 atau lebih.`);
  }
  return num;
}

export function optionalUrl(body: Body, key: string): string | null | undefined {
  const value = optionalString(body, key);
  if (value == null) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
  } catch {
    throw new ValidationError(`${key} harus URL yang diawali http:// atau https://.`);
  }
  return value;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
export const isObjectId = (value: unknown): value is string => typeof value === "string" && OBJECT_ID.test(value);

export class ValidationError extends Error {
  readonly status = 400;
}
