#!/usr/bin/env bash
# Backup harian smart-storefront: database MongoDB + file upload (gambar dan file produk digital),
# disimpan di BACKUP_DIR lalu disalin ke penyimpanan di luar VPS dengan rclone.
#
# Pemakaian:  scripts/backup-mongo.sh
# Konfigurasi: scripts/backup.env (lihat scripts/backup.env.example) atau variabel environment.
set -Eeuo pipefail
source "$(dirname "$0")/lib-common.sh"

RETENTION_DAYS="${RETENTION_DAYS:-7}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"            # contoh: r2:smart-storefront-backup/daily
RCLONE_BIN="${RCLONE_BIN:-rclone}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-}"  # kosong = file di remote tidak dihapus otomatis
INCLUDE_FILES="${INCLUDE_FILES:-1}"            # 1 = ikut arsipkan volume uploads & private-uploads
HEARTBEAT_URL="${HEARTBEAT_URL:-}"            # contoh: https://hc-ping.com/<uuid> (dead man's switch)

STEP="persiapan"
on_error() {
  local code=$?
  log "GAGAL pada langkah: $STEP (exit $code)"
  rm -f "${DB_TMP:-}" "${FILES_TMP:-}" 2>/dev/null || true
  notify "Backup smart-storefront GAGAL di $(hostname) pada langkah: ${STEP} (exit ${code}). Cek log cron."
  [[ -n "$HEARTBEAT_URL" ]] && curl -fsS -m 10 "$HEARTBEAT_URL/fail" >/dev/null 2>&1 || true
  exit "$code"
}
trap on_error ERR

acquire_lock smart-storefront-backup
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

STEP="cek prasyarat"
command -v docker >/dev/null
if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v "${RCLONE_BIN%% *}" >/dev/null || { log "rclone tidak ditemukan. Pasang: https://rclone.org/install/"; false; }
fi
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"

STEP="mongodump"
DB_FILE="$BACKUP_DIR/backup_${STAMP}.gz"
DB_TMP="$DB_FILE.partial"
log "Dump database $DB_NAME -> $DB_FILE"
compose exec -T mongo mongodump --db="$DB_NAME" --archive --gzip --quiet >"$DB_TMP"

STEP="verifikasi arsip database"
# Arsip kosong atau terpotong tidak boleh dianggap backup.
[[ -s "$DB_TMP" ]] || { log "Arsip database kosong"; false; }
gzip -t "$DB_TMP"
mv "$DB_TMP" "$DB_FILE"

FILES_FILE=""
if [[ "$INCLUDE_FILES" == "1" ]]; then
  STEP="arsip file upload"
  SERVER_ID="$(compose ps -q server)"
  [[ -n "$SERVER_ID" ]] || { log "Container server tidak berjalan; file upload tidak bisa diarsipkan"; false; }
  FILES_FILE="$BACKUP_DIR/files_${STAMP}.tar.gz"
  FILES_TMP="$FILES_FILE.partial"
  log "Arsip uploads & private-uploads -> $FILES_FILE"
  docker run --rm --volumes-from "$SERVER_ID":ro alpine \
    tar czf - -C /app uploads private-uploads >"$FILES_TMP"
  gzip -t "$FILES_TMP"
  mv "$FILES_TMP" "$FILES_FILE"
fi

STEP="hapus backup lokal lama"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'backup_*.gz' -o -name 'files_*.tar.gz' \) -mtime +"$RETENTION_DAYS" -print -delete |
  sed 's/^/  dihapus: /'
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -mmin +60 -delete

if [[ -n "$RCLONE_REMOTE" ]]; then
  STEP="upload ke $RCLONE_REMOTE"
  log "Salin ke luar VPS: $RCLONE_REMOTE"
  $RCLONE_BIN copy "$DB_FILE" "$RCLONE_REMOTE"
  [[ -n "$FILES_FILE" ]] && $RCLONE_BIN copy "$FILES_FILE" "$RCLONE_REMOTE"
  if [[ -n "$REMOTE_RETENTION_DAYS" ]]; then
    STEP="hapus backup lama di remote"
    $RCLONE_BIN delete --min-age "${REMOTE_RETENTION_DAYS}d" "$RCLONE_REMOTE"
  fi
else
  log "PERINGATAN: RCLONE_REMOTE kosong. Backup hanya ada di VPS ini dan ikut hilang jika VPS rusak."
fi

STEP="selesai"
DB_SIZE="$(du -h "$DB_FILE" | cut -f1)"
FILES_SIZE="$([[ -n "$FILES_FILE" ]] && du -h "$FILES_FILE" | cut -f1 || echo '-')"
log "Backup selesai: database $DB_SIZE, file $FILES_SIZE"
[[ -n "$HEARTBEAT_URL" ]] && curl -fsS -m 10 "$HEARTBEAT_URL" >/dev/null 2>&1 || true
[[ "${NOTIFY_ON_SUCCESS:-0}" == "1" ]] && notify "Backup smart-storefront berhasil di $(hostname): database $DB_SIZE, file $FILES_SIZE."
exit 0
