// @ts-check
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

const { SITE_URL } = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

export default defineConfig({
  // URL publik client. Dipakai untuk canonical, og:url, dan alamat toko yang ditampilkan ke user.
  site: SITE_URL || "http://localhost:4321",
  output: "server",
  adapter: node({ mode: "standalone" }),
  // Tailwind 4 lewat plugin Vite. Tema dan kelas kaca ada di src/styles/global.css.
  vite: { plugins: [tailwindcss()] },
  server: { port: 4321 },
  // Alamat bahasa Inggris yang umum dipakai, diarahkan permanen ke halaman berbahasa Indonesia.
  redirects: {
    "/terms": { status: 301, destination: "/syarat-ketentuan" },
    "/privacy": { status: 301, destination: "/kebijakan-privasi" },
    "/forgot-password": { status: 301, destination: "/lupa-password" },
  },
});
