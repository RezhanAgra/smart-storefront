#!/usr/bin/env bash
# Fungsi bersama untuk backup-mongo.sh dan test-restore-mongo.sh. Di-source, tidak dijalankan langsung.

# Konfigurasi opsional di scripts/backup.env (tidak masuk git, lihat backup.env.example).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$SCRIPT_DIR/backup.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/backup.env"
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$PROJECT_DIR/.env.prod}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-}"
DB_NAME="${DB_NAME:-smart_storefront}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/smart-storefront}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

compose() {
  local args=(-f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE")
  [[ -n "$COMPOSE_PROJECT" ]] && args+=(-p "$COMPOSE_PROJECT")
  docker compose "${args[@]}" "$@"
}

# Escape teks untuk dimasukkan ke string JSON (tanpa bergantung pada jq).
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/ }"
  printf '%s' "$s"
}

# Kirim pesan ke Discord dan/atau Telegram jika dikonfigurasi. Gagal kirim tidak menghentikan skrip.
notify() {
  local text="$1"
  if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
    curl -fsS -m 15 -H "Content-Type: application/json" \
      -d "{\"content\":\"$(json_escape "$text")\"}" "$DISCORD_WEBHOOK_URL" >/dev/null ||
      log "PERINGATAN: gagal mengirim notifikasi Discord"
  fi
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    curl -fsS -m 15 "${TELEGRAM_API_URL:-https://api.telegram.org}/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${text}" >/dev/null ||
      log "PERINGATAN: gagal mengirim notifikasi Telegram"
  fi
}

# Kunci sederhana (mkdir bersifat atomik, tersedia di Linux dan macOS) agar skrip tidak berjalan dobel.
acquire_lock() {
  LOCK_DIR="${TMPDIR:-/tmp}/$1.lock"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "Proses lain masih berjalan ($LOCK_DIR). Jika yakin tidak ada, hapus folder kunci itu."
    exit 1
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}
