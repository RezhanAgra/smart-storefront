/**
 * Identitas pengelola situs untuk halaman legal. Dibaca saat runtime (SSR) dari env SITE_OPERATOR_NAME
 * dan SITE_CONTACT_EMAIL. Jika kosong, penanda [ISI ...] sengaja tampil agar tidak terlewat sebelum rilis.
 */
function read(name: "SITE_OPERATOR_NAME" | "SITE_CONTACT_EMAIL"): string {
  const runtime = typeof process !== "undefined" ? process.env[name] : undefined;
  return (runtime || import.meta.env[name] || "").trim();
}

export function siteOperator() {
  const email = read("SITE_CONTACT_EMAIL");
  return {
    name: read("SITE_OPERATOR_NAME") || "[ISI SITE_OPERATOR_NAME]",
    email: email || "[ISI SITE_CONTACT_EMAIL]",
    hasEmail: Boolean(email),
  };
}
