/**
 * Notifikasi toast ringan. Diumumkan ke pembaca layar lewat region aria-live, tetap tampil 5 detik
 * (berhenti saat disorot atau difokus) dan bisa ditutup manual.
 */
type Tone = "success" | "error";

const TONE: Record<Tone, string> = {
  success: "border-emerald-400/30 text-emerald-100",
  error: "border-rose-400/30 text-rose-100",
};

function region(): HTMLElement {
  let el = document.querySelector<HTMLElement>("#toast-region");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-region";
    el.setAttribute("aria-live", "polite");
    el.className = "pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end";
    document.body.append(el);
  }
  return el;
}

export function toast(message: string, tone: Tone = "success"): void {
  const item = document.createElement("div");
  item.setAttribute("role", tone === "error" ? "alert" : "status");
  item.className = `toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-night-raised/95 px-4 py-3 text-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-sm ${TONE[tone]}`;

  const text = document.createElement("p");
  text.className = "flex-1 pt-0.5";
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "-m-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white";
  close.setAttribute("aria-label", "Tutup notifikasi");
  close.innerHTML = '<span aria-hidden="true">&times;</span>';

  item.append(text, close);
  region().append(item);

  let timer = window.setTimeout(() => item.remove(), 5000);
  const pause = () => window.clearTimeout(timer);
  const resume = () => {
    timer = window.setTimeout(() => item.remove(), 3000);
  };
  item.addEventListener("mouseenter", pause);
  item.addEventListener("mouseleave", resume);
  item.addEventListener("focusin", pause);
  item.addEventListener("focusout", resume);
  close.addEventListener("click", () => item.remove());
}
