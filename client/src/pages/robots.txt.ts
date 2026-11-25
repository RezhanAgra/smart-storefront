import type { APIRoute } from "astro";

// Dashboard, login, dan struk pesanan tidak perlu diindeks mesin pencari.
export const GET: APIRoute = ({ site, url }) => {
  const origin = (site ?? url).origin;
  const body = [
    "User-agent: *",
    "Disallow: /dashboard",
    "Disallow: /order/",
    "Disallow: /login",
    "Disallow: /lupa-password",
    "Disallow: /reset-password",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
