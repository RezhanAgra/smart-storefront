# smart-storefront

Link-in-bio dan etalase produk untuk kreator dan UMKM. Satu halaman publik per user (`/username`) berisi tautan eksternal dan kartu produk berharga Rupiah. Pembeli membayar lewat Midtrans Snap. Penjual melihat analitik kunjungan/klik dan riwayat pesanan di dashboard.

| Bagian | Teknologi |
| --- | --- |
| `server/` | Node.js, Express 5, Prisma 6, MongoDB, JWT (HTTP-only cookie), Multer (upload), Midtrans Snap, TypeScript strict |
| `client/` | Astro 7 SSR (`@astrojs/node` standalone), Tailwind CSS 4 (`@tailwindcss/vite`), Chart.js 4, TypeScript strict |
| `docker-compose.yml` | MongoDB 7 sebagai single-node replica set `rs0` (dibutuhkan Prisma) |

> Prisma dikunci di versi 6 karena dukungan MongoDB belum tersedia stabil di Prisma 7+. Dua dependensi CLI Prisma yang rentan (`effect`, `deepmerge-ts`) dinaikkan lewat `overrides` di `server/package.json`, sehingga `npm audit` bersih tanpa pindah ke Prisma 7.
>
> Tailwind 4 tidak memakai `tailwind.config.mjs`: tema (font, warna `night`) ada di blok `@theme` pada `client/src/styles/global.css`.

## Menjalankan secara lokal

Butuh **Node.js 22.23.4 atau lebih baru** (syarat Astro 7.4; Astro menolak jalan di versi lebih lama) dan Docker. Server sendiri cukup Node 20+.

Catatan lockfile client: `client/package-lock.json` dibuat di Linux agar mencatat dependensi WASM opsional Tailwind 4 (`@emnapi/*`) yang dibutuhkan `npm ci` di Docker. Jika lockfile dibuat ulang di macOS dan build Docker gagal dengan "Missing: @emnapi/... from lock file", buat ulang di container:
`docker run --rm -v "$PWD/client":/w -w /w node:22-alpine npm install --package-lock-only`

```bash
# 1. MongoDB (tunggu status "healthy", replica set diinisialisasi otomatis)
docker compose up -d

# 2. API Express, http://localhost:5000
cd server
npm install
npx prisma generate
npx prisma db push      # membuat index (username/email unik, orderCode unik)
npm run seed            # toko contoh di /demo (tautan "Akun Demo" di landing). Aman dijalankan ulang.
npm run dev

# 3. Client Astro, http://localhost:4321 (terminal lain)
cd client
npm install
npm run dev
```

Buka http://localhost:4321, daftar akun, tambah item di **Produk & Tautan**, lalu buka `http://localhost:4321/<username>`.

## Pembayaran Midtrans

Tanpa key Midtrans, checkout online nonaktif: tombol Beli memakai "Link pembelian di luar" milik item jika ada, dan selain itu tampil "Pembelian belum tersedia".

Untuk mengaktifkan (sandbox):

1. Daftar di https://dashboard.sandbox.midtrans.com, buka **Settings > Access Keys**.
2. Isi `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY` di `server/.env`, lalu restart API. `GET /api/health` akan menampilkan `"payments": true`.
3. Atur **Payment Notification URL** di dashboard Midtrans ke `https://<domain-api>/api/payments/midtrans/notification`. Di lokal, webhook tidak bisa menjangkau `localhost`. Pakai tunnel (misalnya ngrok), atau andalkan sinkronisasi status yang otomatis dipanggil halaman toko setelah popup Snap ditutup.

Alur: pembeli mengisi nama, email, jumlah, dan catatan → `POST /api/checkout` membuat pesanan `PENDING` dan token Snap → popup Snap → status jadi `PAID` atau `FAILED` lewat webhook (signature SHA-512 diverifikasi) atau `POST /api/checkout/:orderCode/sync`. Stok dikurangi sekali, saat transisi pertama ke `PAID`.

## Pengecekan tipe dan build

```bash
cd server && npx tsc --noEmit && npm run build && npm start
cd client && npx astro check && npm run build && npm start
```

## Environment

`server/.env` (salin dari `.env.example`):

| Variabel | Contoh |
| --- | --- |
| `PORT` | `5000` |
| `DATABASE_URL` | `mongodb://localhost:27017/smart_storefront?replicaSet=rs0` |
| `JWT_SECRET` | ganti dengan string acak panjang di production |
| `CLIENT_URL` | `http://localhost:4321` (origin yang diizinkan CORS) |
| `SERVER_PUBLIC_URL` | `http://localhost:5000` (untuk URL gambar hasil upload; production: `https://api.domainmu.id`) |
| `INTERNAL_API_KEY` | string acak panjang, harus sama dengan di `client/.env` (lihat "Keamanan") |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | server SMTP. `SMTP_HOST` kosong = email nonaktif |
| `MAIL_FROM` | `SmartStorefront <noreply@domainmu.id>` |
| `MIDTRANS_SERVER_KEY` | kosong = checkout nonaktif |
| `MIDTRANS_CLIENT_KEY` | kosong = checkout nonaktif |
| `MIDTRANS_IS_PRODUCTION` | `false` untuk sandbox |

`client/.env`:

| Variabel | Contoh |
| --- | --- |
| `PUBLIC_API_URL` | `http://localhost:5000` |
| `SITE_URL` | `http://localhost:4321` (untuk canonical, `og:url`, dan alamat toko yang ditampilkan) |
| `INTERNAL_API_KEY` | sama dengan di `server/.env`. Hanya dibaca saat SSR, tidak pernah masuk ke bundle browser |
| `SITE_OPERATOR_NAME` | nama orang atau badan usaha pengelola, tampil di halaman legal. Kosong = penanda `[ISI ...]` |
| `SITE_CONTACT_EMAIL` | email kontak untuk refund dan privasi, tampil di halaman legal |

Gambar hasil upload disimpan di `server/uploads/` (tidak masuk git). Untuk production, pindahkan ke object storage.

## API

| Method | Path | Auth | Keterangan |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | | `username` (huruf kecil/angka, 3 sampai 30), `email`, `password` (min 8), `displayName` opsional |
| POST | `/api/auth/login` | | `email`, `password` |
| POST | `/api/auth/logout` | | Hapus cookie |
| GET | `/api/auth/me` | ya | Profil user yang login |
| PUT | `/api/auth/password` | ya | `currentPassword`, `newPassword` (min 8) |
| DELETE | `/api/auth/account` | ya | `password`. Hapus user beserta item, pesanan, analitik, kupon, dan file digitalnya |
| POST | `/api/auth/forgot-password` | | `email`. Kirim tautan reset (berlaku 1 jam). 503 jika SMTP belum diatur |
| POST | `/api/auth/reset-password` | | `token` (dari email), `password`. Token sekali pakai |
| GET | `/api/items` | ya | Item milik user, urut `orderIndex` |
| POST | `/api/items` | ya | `type` (`link`/`product`), `title`, `description`, `price`, `stock`, `url`, `imageUrl` |
| PUT/DELETE | `/api/items/:id` | ya | Hanya item milik sendiri (selain itu 404). `PUT` juga untuk `isActive` |
| PATCH | `/api/items/reorder` | ya | Body `[{ id, orderIndex }]`, diterapkan dalam satu `prisma.$transaction` |
| PUT | `/api/auth/profile` | ya | Divalidasi Zod: `displayName`, `bio` (maks. 250), `avatarUrl`, `themeColor` (hex), `socialLinks` (array atau JSON string `{ platform, url }`, maks. 8) |
| POST | `/api/uploads` | ya | Multipart field `image`, JPG/PNG/WebP maks. 2 MB → `{ url }` |
| GET | `/api/store` | | Username toko yang punya item aktif (untuk `sitemap.xml`) |
| GET | `/api/store/:username` | | Profil publik, item aktif, dan status pembayaran (`payments.enabled`, client key) |
| POST | `/api/store/:username/events?type=view\|click&itemId=` | | Catat kunjungan atau klik (tanpa body) |
| POST | `/api/checkout` | | `itemId`, `quantity`, `buyerName`, `buyerEmail`, `note` → token Snap |
| POST | `/api/checkout/:orderCode/sync` | | Tanya status ke Midtrans, kembalikan status saja |
| POST | `/api/payments/midtrans/notification` | signature | Webhook Midtrans |
| GET | `/api/orders?status=PAID\|PENDING\|FAILED` | ya | Pesanan milik penjual, terbaru dulu (maks. 200) |
| GET | `/api/orders/status/:orderCode` | | Struk publik: tanpa email, catatan, atau id internal |
| GET | `/api/health` | | Ping database. 200 `{ status: "ok", timestamp }` atau 503 |
| GET | `/api/auth/verify-email?token=` | | Konfirmasi email (token sekali pakai, berlaku 24 jam) |
| POST | `/api/auth/resend-verification` | ya | Kirim ulang tautan verifikasi, maksimal sekali per menit |
| PATCH | `/api/orders/:id/tracking` | ya | `{ trackingNumber }` untuk pesanan barang fisik yang lunas. Pembeli dikabari lewat email |
| GET | `/api/payouts/summary` | ya | Omzet lunas, total ditarik, saldo tersedia, riwayat pengajuan |
| POST | `/api/payouts` | ya | `{ amount, bankName, accountNumber, accountHolder }`. Wajib email terverifikasi, minimal Rp 50.000, tidak melebihi saldo |
| POST | `/api/reports` | | Laporkan toko: `{ targetUsername, reason, description, reporterEmail? }`. Maks. 5 laporan per jam per IP |
| GET | `/api/admin/overview` | admin | Semua toko, laporan terbaru, pengajuan pencairan `PENDING` |
| PATCH | `/api/admin/users/:id/suspend` | admin | `{ isSuspended, suspendedReason }` |
| PATCH | `/api/admin/reports/:id` | admin | `{ status: RESOLVED \| DISMISSED }` |
| PATCH | `/api/admin/payouts/:id` | admin | `{ status: APPROVED \| REJECTED, adminNote }` (alasan wajib saat menolak) |
| GET/POST | `/api/coupons` | ya | Daftar dan buat kode promo: `code` (3-20 huruf/angka), `type` (`PERCENT` 1-90 / `FIXED` Rupiah), `value`, `maxUses`, `expiresAt` |
| PUT/DELETE | `/api/coupons/:id` | ya | Aktif/nonaktif (`isActive`) dan hapus |
| POST | `/api/checkout/coupon` | | Cek kode promo sebelum bayar: `{ itemId, quantity, code }` → `{ code, subtotal, discountAmount, total }` |
| POST | `/api/uploads/digital` | ya | File produk digital (field `file`, PDF/ZIP/EPUB/MP3/MP4/JPG/PNG/TXT, maks. 25 MB) ke folder privat → `{ fileKey, fileName }` |
| GET | `/api/orders/download/:orderCode` | | Unduh file produk digital. Hanya pesanan `PAID`, maks. 10 kali per pesanan |
| GET | `/api/analytics?days=7\|14\|30` | ya | Total, seri harian (WIB), dan 5 item teratas |

Auth diterima dari cookie `token` atau header `Authorization: Bearer <token>`.

Username `login`, `logout`, `register`, `dashboard`, `order`, `demo`, `api`, `admin`, `404`, dan `500` ditolak saat daftar karena bentrok dengan route client.

## Halaman client

| Path | Isi |
| --- | --- |
| `/` | Landing |
| `/login` | Masuk dan daftar |
| `/lupa-password`, `/reset-password` | Minta dan pakai tautan reset password |
| `/syarat-ketentuan`, `/kebijakan-privasi`, `/kebijakan-refund` | Halaman legal (dibutuhkan Midtrans untuk aktivasi akun produksi) |
| `/robots.txt`, `/sitemap.xml` | SEO. Sitemap berisi halaman legal dan semua toko yang punya item aktif |
| `/<username>` | Halaman toko publik. `/@<username>` dialihkan permanen ke sini |
| `/demo` | Toko contoh dari `npm run seed`. Checkout untuk akun ini ditolak server |
| `/order/<orderCode>` | Struk dan status pembayaran pembeli (bisa dicetak/disimpan PDF) |
| `/dashboard` | Analitik |
| `/dashboard/items` | Tambah, edit, sembunyikan, urutkan, dan hapus produk/tautan |
| `/dashboard/orders` | Riwayat transaksi (termasuk kode promo dan unduhan file) |
| `/dashboard/promo` | Kode promo: buat, aktif/nonaktif, hapus, lihat pemakaian |
| `/dashboard/qr` | QR Code kasir menuju halaman toko: cetak poster, unduh PNG/SVG |
| `/dashboard/payouts` | Saldo dan pengajuan pencairan dana |
| `/terms`, `/privacy`, `/forgot-password` | Dialihkan (301) ke `/syarat-ketentuan`, `/kebijakan-privasi`, `/lupa-password` |
| `/verify-email?token=` | Konfirmasi email dari tautan yang dikirim saat daftar |
| `/admin` | Panel admin (role `ADMIN`): laporan, status toko, persetujuan pencairan |
| `/dashboard/settings` | Foto profil, nama toko, bio, warna aksen, tautan sosial, ganti password, hapus akun |

## Kode promo dan produk digital

- Diskon dikirim ke Midtrans sebagai baris item berharga negatif, sehingga jumlah item sama dengan `gross_amount`. Diskon tidak boleh menghabiskan seluruh harga (Midtrans menolak total 0).
- `usedCount` kupon bertambah saat pesanan menjadi `PAID`, bukan saat checkout. Pesanan `PENDING` yang bersamaan bisa membuat kuota terlewati sedikit.
- File produk digital disimpan di `server/private-uploads/` (tidak masuk git, tidak disajikan `express.static`). Pembeli mengunduh lewat tombol di struk `/order/<kode>` setelah lunas. Tautan struk juga dikirim ke email pembeli jika SMTP diatur.
- Untuk production, pindahkan `uploads/` dan `private-uploads/` ke object storage (misalnya S3 dengan URL bertanda tangan).

## Keamanan

- `helmet` aktif. `Cross-Origin-Resource-Policy: cross-origin` supaya gambar `/uploads` bisa dimuat client dari origin lain.
- `trust proxy` = 1: API diasumsikan berada di belakang **satu** reverse proxy (Nginx/Caddy) yang mengisi `X-Forwarded-For`. Jika API diakses langsung tanpa proxy, set ke `false`, karena header itu bisa dipalsukan untuk mengelabui rate limit.
- Rate limit per IP (memori proses, reset saat restart):
  - `/api`: 100 request per 15 menit.
  - `/api/auth/login` dan `/api/auth/register`: 10 percobaan per 15 menit.
- Pengecualian rate limit:
  - Webhook Midtrans (`/api/payments/*`), yang diverifikasi lewat signature.
  - Request SSR dari server Astro yang membawa header `x-internal-key`. Tanpa pengecualian ini, semua pengunjung halaman toko terlihat sebagai satu IP (IP server Astro), dan batas 100 request habis dalam hitungan menit.
- Jika API dijalankan lebih dari satu instance, pindahkan penyimpanan rate limit ke Redis (`rate-limit-redis`).

## Panduan Deployment Produksi ke VPS (Docker + Caddy SSL)

Arsitektur: satu domain, empat container di jaringan internal `smart_net`. Hanya Caddy yang membuka port ke internet.

```
Internet ──443/80──▶ caddy ──/api/*, /uploads/*──▶ server:5000 ──▶ mongo:27017 (replica set rs0)
                          └──────── selain itu ───▶ client:4321 ──(SSR, x-internal-key)──▶ server:5000
```

| File | Isi |
| --- | --- |
| `server/Dockerfile` | Multi-stage: `builder` (npm ci, prisma generate, tsc) dan `runner` (dependensi produksi, user `node`, healthcheck `/api/health`) |
| `client/Dockerfile` | Multi-stage: `builder` (astro build dengan build-arg `PUBLIC_API_URL`, `SITE_URL`) dan `runner` (user `node`, `node ./dist/server/entry.mjs`) |
| `Caddyfile` | HTTPS otomatis Let's Encrypt, routing, kompresi zstd/gzip, security header |
| `docker-compose.prod.yml` | `mongo`, `server`, `client`, `caddy`, plus `migrate` (profil `tools`) |
| `.env.prod.example` | Semua variabel produksi |

### 1. Siapkan VPS

Ubuntu 22.04/24.04 atau Debian 12, minimal 2 GB RAM (build image Astro butuh memori). Instal Docker Engine dan plugin Compose sesuai https://docs.docker.com/engine/install/, lalu buka port 80 dan 443:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
```

### 2. Arahkan DNS ke VPS

Di panel DNS domain, buat **A record** (dan **AAAA** jika VPS punya IPv6):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` (atau subdomain, misalnya `toko`) | IP publik VPS |

Tunggu sampai `dig +short tokoku.id` menampilkan IP VPS. Caddy baru bisa mengambil sertifikat setelah DNS mengarah ke VPS dan port 80/443 terbuka.

### 3. Isi environment

```bash
git clone <repo> smart-storefront && cd smart-storefront
cp .env.prod.example .env.prod
nano .env.prod   # isi DOMAIN_NAME, ACME_EMAIL, CLIENT_URL, SERVER_PUBLIC_URL (= https://DOMAIN_NAME), SMTP_*, SITE_OPERATOR_NAME, SITE_CONTACT_EMAIL
openssl rand -hex 32   # jalankan dua kali: untuk JWT_SECRET dan INTERNAL_API_KEY
```

Catatan:
- `PUBLIC_API_URL` tidak perlu diisi: compose menyusunnya dari `DOMAIN_NAME` (`https://DOMAIN_NAME`, tanpa `/api`, karena client menambahkan `/api` sendiri).
- `INTERNAL_API_KEY` dibaca client saat runtime, tidak di-bake ke image.

### 4. Build dan jalankan

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Sekali setelah deploy pertama (dan setiap kali schema.prisma berubah): buat index unik MongoDB.
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate

# Opsional: toko contoh untuk tautan "Akun Demo" di landing page.
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate npm run seed
```

Cek status dan log:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f caddy server
curl https://tokoku.id/api/health
```

### 5. Webhook Midtrans

Di dashboard Midtrans (**Settings > Payment > Notification URL**), isi:

```
https://tokoku.id/api/payments/midtrans/notification
```

Endpoint ini memverifikasi `signature_key` dengan `MIDTRANS_SERVER_KEY` dan tidak terkena rate limit. Untuk transaksi sungguhan, pakai key produksi dan set `MIDTRANS_IS_PRODUCTION=true`.

### Update dan backup

```bash
git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm migrate   # jika schema berubah

```

Backup harian otomatis ada di bagian [Operasional Produksi, Legal & Checklist Go-Live](#operasional-produksi-legal--checklist-go-live).

Volume persisten: `mongo_prod_data`, `uploads_prod_data` (gambar), `private_uploads_prod_data` (file produk digital), `caddy_data` (sertifikat SSL).

### Uji di komputer sendiri

Dengan `DOMAIN_NAME=localhost`, Caddy memakai sertifikat lokal (browser menampilkan peringatan, atau jalankan `docker compose ... exec caddy caddy trust`). Port 80 dan 443 harus kosong.

### Yang perlu diketahui

- MongoDB berjalan tanpa autentikasi, tetapi hanya bisa diakses dari jaringan internal Docker (tidak ada port yang dibuka ke host). Jika MongoDB dipindah ke server lain atau dibuka ke luar, aktifkan autentikasi dan keyFile replica set.
- Rate limit disimpan di memori proses `server`: reset saat container restart, dan tidak dibagi jika `server` dijalankan lebih dari satu replika.
- `trust proxy` = 1 sesuai satu Caddy di depan API. Caddy mengganti `X-Forwarded-For` kiriman klien, jadi header palsu tidak bisa dipakai untuk menghindari rate limit.

## Verifikasi email, pengiriman, pencairan dana, dan moderasi

- **Dua jenis "verifikasi":** `emailVerified` berarti penjual sudah mengklik tautan di email dan menjadi syarat pencairan dana. `isVerified` adalah badge centang di halaman toko yang diatur manual oleh admin (lihat di bawah). Keduanya sengaja dipisah, agar konfirmasi email tidak otomatis memberi badge "terverifikasi" ke setiap toko.
- **Tanpa SMTP** (`SMTP_HOST` kosong), tautan verifikasi dicetak di log server. Di production, isi SMTP agar penjual bisa memverifikasi email.
- **Barang fisik:** centang "Produk fisik" di item. Checkout lalu mewajibkan nomor WhatsApp/HP dan alamat. Alamat hanya terlihat oleh penjual di `/dashboard/orders`, tidak di struk publik `/order/<kode>` (yang bisa dibuka siapa pun yang tahu kodenya). Struk hanya menampilkan nomor resi.
- **Pencairan dana:** saldo = total pesanan `PAID` dikurangi pengajuan `PENDING`/`APPROVED`. Admin mentransfer manual ke rekening penjual, lalu menekan "Setujui Transfer". Pengajuan bersamaan diserialkan lewat transaksi MongoDB, jadi saldo tidak bisa ditarik dua kali. Belum ada pemotongan biaya platform maupun penanganan refund: pesanan yang di-refund lewat Midtrans tetap terhitung omzet sampai statusnya diubah.
- **Moderasi:** toko yang dinonaktifkan menampilkan halaman peringatan (HTTP 403), tidak bisa menerima checkout, tidak muncul di sitemap, dan pencairan dananya ditahan. Penjual tetap bisa login dan melihat alasannya di dashboard.
- **Akun admin** dibuat oleh `npm run seed` dari `ADMIN_EMAIL` dan `ADMIN_PASSWORD`. Di development, tanpa variabel itu dipakai `admin@smartstore.id` / `admin1234`. Di production seed menolak password contoh atau yang lebih pendek dari 12 karakter. Untuk menjadikan akun lain admin: `mongosh smart_storefront --eval 'db.User.updateOne({email:"kamu@domain.id"},{$set:{role:"ADMIN"}})'`.
- **Rate limit** 100 request / 15 menit per IP juga berlaku untuk admin. Panel admin memperbarui data lokal setelah setiap aksi (tanpa memuat ulang semuanya) agar tidak cepat mengenai batas itu.

## Badge verifikasi

Badge centang di halaman toko hanya tampil jika `User.isVerified` bernilai `true` (default `false`). Belum ada UI admin. Ubah langsung di database:

```bash
mongosh smart_storefront --eval 'db.User.updateOne({username:"namatoko"},{$set:{isVerified:true}})'
```

## Email

Dengan `SMTP_HOST` dan `MAIL_FROM` terisi (`GET /api/health` menampilkan `"email": true`):

- Pembeli menerima struk dan tautan unduhan saat pesanan pertama kali menjadi `PAID`.
- Penjual menerima notifikasi pesanan lunas. `Reply-To` diisi email pembeli, jadi penjual bisa langsung membalas.
- Lupa password mengirim tautan reset sekali pakai yang berlaku 1 jam. Yang disimpan di database hanya hash SHA-256 token.

Email pesanan dikirim di latar belakang. Jika gagal, pesanan tetap lunas dan error hanya dicatat di log server. Pakai penyedia SMTP transaksional (misalnya Brevo, Mailgun, Amazon SES), lalu atur SPF dan DKIM domain pengirim agar email tidak masuk spam.

## Operasional Produksi, Legal & Checklist Go-Live

### Error tracking (Sentry)

1. Buat project **Node.js** di [sentry.io](https://sentry.io), salin DSN-nya.
2. Isi di `.env.prod`: `SENTRY_DSN="https://...@...ingest.sentry.io/..."` dan `SENTRY_ENVIRONMENT=production`, lalu `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d server`.
3. Di Sentry, buat **Alert** untuk issue baru agar kamu dikabari lewat email atau Slack.

Yang dikirim ke Sentry (`server/src/lib/sentry.ts`):

| Kejadian | Level | Tag `area` |
| --- | --- | --- |
| Error 5xx yang tidak tertangani di route mana pun | error | - |
| Webhook Midtrans dengan signature tidak valid (notifikasi palsu atau `MIDTRANS_SERVER_KEY` salah) | warning | `midtrans-webhook` |
| Pembayaran sudah terjadi di Midtrans tetapi status pesanan gagal disimpan | error | `midtrans-webhook` |
| Midtrans Snap menolak membuat transaksi | error | `midtrans-snap` |
| Email gagal terkirim (verifikasi, reset password, struk, notifikasi, resi) | error | `email` + `mail_kind` |

Error validasi (4xx) tidak dikirim. Sentry tidak menerima cookie, body request, header `Authorization`/`x-internal-key`, query string (token verifikasi/reset), variabel lokal, maupun parameter query database. Email hanya dikirim domainnya. Tanpa `SENTRY_DSN`, Sentry tidak aktif sama sekali.

### Backup harian ke luar VPS

`scripts/backup-mongo.sh` membuat `backup_YYYY-MM-DD_HHMM.gz` (mongodump terkompresi) dan `files_YYYY-MM-DD_HHMM.tar.gz` (volume gambar dan file produk digital; tanpa ini, restore menghasilkan toko dengan gambar rusak dan file unduhan hilang). Arsip dicek dengan `gzip -t`, backup lokal yang lebih tua dari 7 hari dihapus, lalu keduanya disalin ke luar VPS dengan rclone. Jika gagal, skrip mengirim pesan ke Discord/Telegram berisi langkah yang gagal.

1. Pasang rclone di VPS: `sudo apt install rclone` (atau versi terbaru: https://rclone.org/install/), lalu `rclone config` untuk membuat remote Cloudflare R2, AWS S3, atau Google Drive.
2. Konfigurasi skrip:
   ```bash
   cp scripts/backup.env.example scripts/backup.env
   nano scripts/backup.env   # RCLONE_REMOTE, DISCORD_WEBHOOK_URL / TELEGRAM_*, HEARTBEAT_URL
   sudo mkdir -p /var/backups/smart-storefront && sudo chown "$USER" /var/backups/smart-storefront
   ```
3. Jalankan sekali secara manual dan pastikan berhasil:
   ```bash
   ./scripts/backup-mongo.sh
   ./scripts/test-restore-mongo.sh   # memulihkan backup terbaru ke MongoDB sementara, lalu menghapusnya
   ```
4. Jadwalkan dengan `crontab -e` (user yang bisa menjalankan `docker`). Cron memakai zona waktu server; atur dulu dengan `sudo timedatectl set-timezone Asia/Jakarta`.
   ```cron
   # Backup setiap hari pukul 02:00
   0 2 * * * cd /opt/smart-storefront && ./scripts/backup-mongo.sh >> /var/log/smart-storefront-backup.log 2>&1
   # Uji restore setiap Minggu pukul 03:30
   30 3 * * 0 cd /opt/smart-storefront && ./scripts/test-restore-mongo.sh >> /var/log/smart-storefront-backup.log 2>&1
   ```
   Ganti `/opt/smart-storefront` dengan folder proyek di VPS.
5. Isi `HEARTBEAT_URL` dengan URL check dari [healthchecks.io](https://healthchecks.io) (gratis) berjadwal harian. Notifikasi Discord/Telegram hanya terkirim jika skrip berjalan lalu gagal; heartbeat juga memberi tahu jika cron sama sekali tidak berjalan.

`test-restore-mongo.sh` tidak menyentuh database produksi: arsip dipulihkan ke container `mongo:7` sementara sebagai database `smart_storefront_restore_test`, jumlah koleksi dan dokumen dicetak, arsip file diperiksa bisa dibaca, lalu database dan container dihapus.

**Pemulihan sungguhan** (menimpa data produksi, lakukan hanya saat bencana, setelah membuat backup kondisi saat ini):

```bash
C="docker compose -f docker-compose.prod.yml --env-file .env.prod"
$C exec -T mongo mongorestore --archive --gzip --drop < /var/backups/smart-storefront/backup_YYYY-MM-DD_HHMM.gz
docker run --rm -i --volumes-from "$($C ps -q server)" alpine tar xzf - -C /app < /var/backups/smart-storefront/files_YYYY-MM-DD_HHMM.tar.gz
```

### Uptime monitoring

`GET /api/health` mem-ping database dan mengembalikan 200 `{"status":"ok"}`, atau 503 jika database tidak terjangkau.

- **UptimeRobot** (gratis): *Add New Monitor* → tipe **Keyword**, URL `https://domainkamu.com/api/health`, keyword `"status":"ok"`, interval **5 menit**. Tambahkan monitor kedua tipe **HTTP(s)** untuk `https://domainkamu.com/` agar container client ikut terpantau. Di *Alert Contacts*, tambahkan email dan Telegram.
- **Better Stack Uptime** (gratis): *Create monitor* → *URL becomes unavailable* atau *URL doesn't contain keyword* (`"status":"ok"`), check frequency 5 menit, on-call via email/Telegram.

Endpoint health ikut rate limit 100 request / 15 menit per IP; satu cek per 5 menit jauh di bawah batas itu.

### Checklist go-live

**Keamanan dan operasional**
- [ ] `JWT_SECRET` dan `INTERNAL_API_KEY` di `.env.prod` adalah string acak (`openssl rand -hex 32`), bukan nilai contoh.
- [ ] `ADMIN_EMAIL` dan `ADMIN_PASSWORD` (minimal 12 karakter) diisi sebelum `run --rm migrate npm run seed`. **Jika seed pernah dijalankan di VPS sebelum service `migrate` diberi `NODE_ENV=production`**, akun `admin@smartstore.id` / `admin1234` mungkin sudah terbuat: hapus akun itu atau ganti passwordnya.
- [ ] SMTP terisi dan email verifikasi terkirim. Tanpa SMTP, penjual tidak bisa memverifikasi email dan tidak bisa mencairkan dana.
- [ ] `SENTRY_DSN` terisi dan alert Sentry aktif.
- [ ] Backup harian berjalan, `RCLONE_REMOTE` terisi, uji restore pernah berhasil, dan heartbeat aktif.
- [ ] Monitor uptime aktif untuk `/api/health` dan halaman utama.

**Legal**
- [ ] `SITE_OPERATOR_NAME` dan `SITE_CONTACT_EMAIL` terisi; halaman `/syarat-ketentuan`, `/kebijakan-privasi`, dan `/kebijakan-refund` tidak lagi menampilkan penanda `[ISI ...]`.
- [ ] Teks Syarat & Ketentuan, Kebijakan Privasi, dan Kebijakan Refund ditinjau orang yang paham hukum Indonesia, terutama batas waktu refund, mekanisme pencairan dana, dan batas tanggung jawab.
- [ ] Cek kewajiban pendaftaran Penyelenggara Sistem Elektronik (PSE) Lingkup Privat untuk layanan ini.

**Midtrans production**
- [ ] Dokumen usaha diunggah dan diverifikasi di dashboard Midtrans production sesuai yang diminta untuk jenis usahamu.
- [ ] **Konfirmasi tertulis dari tim Midtrans** bahwa model bisnis ini diizinkan di akunmu: satu akun merchant menerima pembayaran untuk banyak penjual, lalu dana diteruskan ke penjual secara manual (pencairan dana / payout). Model agregator atau marketplace bisa memerlukan persetujuan atau produk Midtrans yang berbeda. Jangan aktifkan production sebelum ini jelas.
- [ ] Key production terpasang, `MIDTRANS_IS_PRODUCTION=true`, dan Notification URL production diarahkan ke `https://domainkamu.com/api/payments/midtrans/notification`.
- [ ] Satu transaksi nyata bernominal kecil berhasil sampai status `PAID`, termasuk uji refund lewat dashboard Midtrans.

**Batasan yang masih ada**
- Sesi login lama (JWT, 7 hari) tetap berlaku setelah ganti atau reset password, karena token tidak dicek ke database.
- Refund lewat Midtrans tidak otomatis mengurangi saldo penjual; periksa sebelum menyetujui pencairan.
- Pencairan dana ditransfer manual oleh admin.
