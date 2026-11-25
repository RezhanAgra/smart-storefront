interface ImportMetaEnv {
  readonly PUBLIC_API_URL?: string;
  /** Hanya tersedia di server (SSR). Vite tidak pernah menyertakan variabel tanpa awalan PUBLIC_ ke bundle browser. */
  readonly INTERNAL_API_KEY?: string;
  /** Base URL API untuk SSR saja, misalnya http://server:5000 di Docker. Default: PUBLIC_API_URL. */
  readonly INTERNAL_API_URL?: string;
  /** Nama pengelola situs (orang atau badan usaha) di halaman legal. Dibaca saat runtime. */
  readonly SITE_OPERATOR_NAME?: string;
  /** Email kontak di halaman legal (refund, privasi). Dibaca saat runtime. */
  readonly SITE_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
