/**
 * Error tracking Sentry. Diimpor paling awal di app.ts. Tanpa SENTRY_DSN (development lokal), Sentry tidak
 * diinisialisasi sama sekali dan reportError/reportMessage hanya menulis ke console.
 */
import "dotenv/config";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim() ?? "";
export const sentryEnabled = dsn !== "";

/** Header yang tidak boleh ikut ke Sentry: sesi, token, dan rahasia internal. */
const SECRET_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-internal-key"]);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || undefined,
    // Hanya error tracking, tanpa tracing performa.
    tracesSampleRate: 0,
    // Default Sentry 11 mengumpulkan cookie, header, body request, variabel lokal, dan parameter query
    // database. Di aplikasi ini itu berarti password, token, alamat pengiriman, dan nomor rekening,
    // jadi semuanya dimatikan; yang tersisa hanya header non-rahasia untuk konteks (user-agent, dsb.).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: [...SECRET_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
    },
    // Lapisan kedua: buang data request sensitif walau ada integrasi yang menambahkannya.
    beforeSend(event) {
      if (event.request) {
        // Body bisa berisi password, alamat pengiriman, atau nomor rekening.
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.headers) {
          for (const name of Object.keys(event.request.headers)) {
            if (SECRET_HEADERS.has(name.toLowerCase())) delete event.request.headers[name];
          }
        }
      }
      return event;
    },
  });
}

interface ErrorContext {
  /** Area fitur, jadi tag yang bisa difilter di Sentry, misalnya "midtrans-webhook" atau "email". */
  area: string;
  tags?: Record<string, string>;
  /** Data tambahan tanpa PII (kode pesanan, status, dsb.). */
  extra?: Record<string, unknown>;
}

/** Laporkan error yang sudah ditangani (tidak dilempar ulang) beserta konteksnya. */
export function reportError(err: unknown, ctx: ErrorContext): void {
  console.error(`[${ctx.area}]`, err);
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("area", ctx.area);
    if (ctx.tags) scope.setTags(ctx.tags);
    if (ctx.extra) scope.setExtras(ctx.extra);
    Sentry.captureException(err);
  });
}

/** Laporkan kejadian mencurigakan yang bukan exception (misalnya signature webhook tidak valid). */
export function reportMessage(message: string, level: "warning" | "error", ctx: ErrorContext): void {
  console.warn(`[${ctx.area}] ${message}`, ctx.extra ?? "");
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("area", ctx.area);
    if (ctx.tags) scope.setTags(ctx.tags);
    if (ctx.extra) scope.setExtras(ctx.extra);
    Sentry.captureMessage(message, level);
  });
}

/** Hanya domain email yang dikirim ke Sentry, bukan alamat lengkapnya. */
export const emailDomain = (email: string) => email.split("@")[1] ?? "unknown";

export { Sentry };
