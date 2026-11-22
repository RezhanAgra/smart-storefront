const HEX = /^#([0-9a-f]{6})$/i;
export const DEFAULT_THEME = "#0f172a";
const NIGHT = "#070913";
/** Indigo-400: dipakai jika warna tema kreator terlalu gelap untuk terlihat di latar malam. */
const FALLBACK_ACCENT = "#818cf8";

/** themeColor masuk ke atribut style, jadi hanya hex 6 digit yang diterima. */
export function safeHex(value: string | null | undefined): string {
  return value && HEX.test(value) ? value : DEFAULT_THEME;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Warna tema kreator jika cukup kontras (3:1, elemen non-teks) di atas latar gelap, selain itu indigo. */
export function accentOnDark(hex: string): string {
  return contrast(hex, NIGHT) >= 3 ? hex : FALLBACK_ACCENT;
}

/** Pilih teks hitam atau putih, mana yang kontrasnya lebih tinggi di atas warna tertentu (WCAG). */
export function readableTextOn(hex: string): "#ffffff" | "#0b0d17" {
  return contrast(hex, "#ffffff") >= contrast(hex, "#0b0d17") ? "#ffffff" : "#0b0d17";
}
