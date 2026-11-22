/** Helper fetch untuk script di browser: selalu kirim cookie sesi ke API. */
import { API_URL } from "./api";

export const api = (path: string, init: RequestInit = {}) =>
  fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include",
    headers: init.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init.headers },
  });

/** Sesi habis di tengah jalan: kembali ke login. Mengembalikan true jika sudah diarahkan. */
export function redirectIfUnauthorized(res: Response): boolean {
  if (res.status !== 401) return false;
  location.assign("/login");
  return true;
}

/** Tampilkan satu dari beberapa elemen state (loading/error/empty/ready) berdasarkan atribut data-state. */
export function showState(root: ParentNode, state: string): void {
  root.querySelectorAll<HTMLElement>("[data-state]").forEach((el) => {
    el.hidden = el.dataset.state !== state;
  });
}

const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
