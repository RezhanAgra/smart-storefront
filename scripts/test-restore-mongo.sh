#!/usr/bin/env bash
# Uji restore: membuktikan arsip backup benar-benar bisa dipulihkan.
# Arsip dipulihkan ke container mongo:7 SEMENTARA (bukan database produksi) dengan nama database
# smart_storefront_restore_test, jumlah koleksi/dokumen diperiksa, lalu database dan container dihapus.
#
# Pemakaian:  scripts/test-restore-mongo.sh [backup_YYYY-MM-DD_HHMM.gz]
#             tanpa argumen: backup terbaru di BACKUP_DIR.
set -Eeuo pipefail
source "$(dirname "$0")/lib-common.sh"

TEST_DB="smart_storefront_restore_test"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:7}"
MIN_DOCUMENTS="${MIN_DOCUMENTS:-1}"

STEP="persiapan"
CONTAINER=""
cleanup() {
  if [[ -n "$CONTAINER" ]]; then
    docker exec "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('$TEST_DB').dropDatabase()" >/dev/null 2>&1 || true
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
on_error() {
  local code=$?
  log "UJI RESTORE GAGAL pada langkah: $STEP (exit $code)"
  notify "Uji restore backup smart-storefront GAGAL di $(hostname) pada langkah: ${STEP}. Backup mungkin tidak bisa dipulihkan."
  exit "$code"
}
trap on_error ERR
trap cleanup EXIT

STEP="memilih arsip"
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(ls -1t "$BACKUP_DIR"/backup_*.gz 2>/dev/null | head -n1 || true)"
  [[ -n "$ARCHIVE" ]] || { log "Tidak ada backup_*.gz di $BACKUP_DIR"; false; }
fi
[[ -s "$ARCHIVE" ]] || { log "Arsip tidak ada atau kosong: $ARCHIVE"; false; }
log "Arsip: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
STEP="cek integritas arsip (gzip)"
gzip -t "$ARCHIVE"

STEP="menyalakan MongoDB sementara"
CONTAINER="ssf-restore-test-$$"
docker run -d --name "$CONTAINER" "$MONGO_IMAGE" --quiet >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' >/dev/null

STEP="mongorestore"
docker exec -i "$CONTAINER" mongorestore --archive --gzip --quiet \
  --nsFrom="${DB_NAME}.*" --nsTo="${TEST_DB}.*" <"$ARCHIVE"

STEP="verifikasi isi"
REPORT="$(docker exec "$CONTAINER" mongosh --quiet --eval "
  const d = db.getSiblingDB('$TEST_DB');
  let total = 0;
  const names = d.getCollectionNames().sort();
  names.forEach((c) => { const n = d.getCollection(c).countDocuments(); total += n; print('  ' + c + ': ' + n); });
  print('KOLEKSI=' + names.length);
  print('TOTAL=' + total);
")"
echo "$REPORT" | grep -v '^KOLEKSI=\|^TOTAL='
COLLECTIONS="$(echo "$REPORT" | sed -n 's/^KOLEKSI=//p')"
TOTAL="$(echo "$REPORT" | sed -n 's/^TOTAL=//p')"
log "Hasil: $COLLECTIONS koleksi, $TOTAL dokumen"
[[ "${COLLECTIONS:-0}" -ge 1 ]] || { log "Tidak ada koleksi yang terpulihkan"; false; }
[[ "${TOTAL:-0}" -ge "$MIN_DOCUMENTS" ]] || { log "Jumlah dokumen ($TOTAL) di bawah minimum $MIN_DOCUMENTS"; false; }

# Arsip file dari tanggal yang sama (jika ada) ikut diperiksa bisa dibaca utuh.
FILES_ARCHIVE="${ARCHIVE/backup_/files_}"
FILES_ARCHIVE="${FILES_ARCHIVE%.gz}.tar.gz"
if [[ -f "$FILES_ARCHIVE" ]]; then
  STEP="verifikasi arsip file"
  FILE_COUNT="$(tar tzf "$FILES_ARCHIVE" | grep -vc '/$' || true)"
  log "Arsip file $(basename "$FILES_ARCHIVE"): $FILE_COUNT file terbaca"
fi

STEP="selesai"
log "Uji restore BERHASIL. Database uji dan container sementara dihapus."
[[ "${NOTIFY_ON_SUCCESS:-0}" == "1" ]] && notify "Uji restore smart-storefront berhasil: $COLLECTIONS koleksi, $TOTAL dokumen dari $(basename "$ARCHIVE")."
exit 0
