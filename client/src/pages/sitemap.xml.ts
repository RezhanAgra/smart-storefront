import type { APIRoute } from "astro";
import { ssrFetch } from "../lib/api";

const STATIC_PATHS = ["/", "/syarat-ketentuan", "/kebijakan-privasi", "/kebijakan-refund"];

/** Halaman statis ditambah semua toko yang punya minimal satu item aktif. */
export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site ?? url).origin;
  let stores: { username: string; updatedAt: string }[] = [];
  try {
    const res = await ssrFetch("/api/store");
    if (res.ok) stores = ((await res.json()) as { stores: typeof stores }).stores;
  } catch {
    /* API tidak terjangkau: sitemap tetap berisi halaman statis */
  }

  const entry = (path: string, lastmod?: string) =>
    `<url><loc>${origin}${path}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}</url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...STATIC_PATHS.map((p) => entry(p)), ...stores.map((s) => entry(`/${s.username}`, s.updatedAt))].join("\n")}
</urlset>`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
