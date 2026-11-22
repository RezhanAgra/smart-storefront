// @ts-check
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import node from "@astrojs/node";
import tailwind from "@astrojs/tailwind";

const { SITE_URL } = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

export default defineConfig({
  // URL publik client. Dipakai untuk canonical, og:url, dan alamat toko yang ditampilkan ke user.
  site: SITE_URL || "http://localhost:4321",
  output: "server",
  adapter: node({ mode: "standalone" }),
  // Directive Tailwind ditulis sendiri di src/styles/global.css bersama kelas kaca.
  integrations: [tailwind({ applyBaseStyles: false })],
  server: { port: 4321 },
});
