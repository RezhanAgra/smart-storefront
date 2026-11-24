# smart-storefront

Link-in-bio dan etalase produk untuk kreator dan UMKM. Satu halaman publik per user (`/username`) berisi tautan eksternal dan kartu produk berharga Rupiah. Pembeli membayar lewat Midtrans Snap. Penjual melihat analitik kunjungan/klik dan riwayat pesanan di dashboard.

| Bagian | Teknologi |
| --- | --- |
| `server/` | Node.js, Express 5, Prisma 6, MongoDB, JWT (HTTP-only cookie), Multer (upload), Midtrans Snap, TypeScript strict |
| `client/` | Astro 5 SSR (`@astrojs/node` standalone), Tailwind CSS 3, Chart.js 4, TypeScript strict |
| `docker-compose.yml` | MongoDB 7 sebagai single-node replica set `rs0` (dibutuhkan Prisma) |

> Prisma dikunci di versi 6 karena dukungan MongoDB belum tersedia stabil di Prisma 7+. Astro dikunci di versi 5 karena `@astrojs/tailwind` hanya mendukung Astro sampai versi 5.

## Menjalankan secara lokal

Butuh Node.js 20+ dan Docker.

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
| `MIDTRANS_SERVER_KEY` | kosong = checkout nonaktif |
| `MIDTRANS_CLIENT_KEY` | kosong = checkout nonaktif |
| `MIDTRANS_IS_PRODUCTION` | `false` untuk sandbox |

`client/.env`:

| Variabel | Contoh |
| --- | --- |
| `PUBLIC_API_URL` | `http://localhost:5000` |
| `SITE_URL` | `http://localhost:4321` (untuk canonical, `og:url`, dan alamat toko yang ditampilkan) |
| `INTERNAL_API_KEY` | sama dengan di `server/.env`. Hanya dibaca saat SSR, tidak pernah masuk ke bundle browser |

Gambar hasil upload disimpan di `server/uploads/` (tidak masuk git). Untuk production, pindahkan ke object storage.

## API

| Method | Path | Auth | Keterangan |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | | `username` (huruf kecil/angka, 3 sampai 30), `email`, `password` (min 8), `displayName` opsional |
| POST | `/api/auth/login` | | `email`, `password` |
| POST | `/api/auth/logout` | | Hapus cookie |
| GET | `/api/auth/me` | ya | Profil user yang login |
| GET | `/api/items` | ya | Item milik user, urut `orderIndex` |
| POST | `/api/items` | ya | `type` (`link`/`product`), `title`, `description`, `price`, `stock`, `url`, `imageUrl` |
| PUT/DELETE | `/api/items/:id` | ya | Hanya item milik sendiri (selain itu 404). `PUT` juga untuk `isActive` |
| PATCH | `/api/items/reorder` | ya | Body `[{ id, orderIndex }]`, diterapkan dalam satu `prisma.$transaction` |
| PUT | `/api/auth/profile` | ya | Divalidasi Zod: `displayName`, `bio` (maks. 250), `avatarUrl`, `themeColor` (hex), `socialLinks` (array atau JSON string `{ platform, url }`, maks. 8) |
| POST | `/api/uploads` | ya | Multipart field `image`, JPG/PNG/WebP maks. 2 MB → `{ url }` |
| GET | `/api/store/:username` | | Profil publik, item aktif, dan status pembayaran (`payments.enabled`, client key) |
| POST | `/api/store/:username/events?type=view\|click&itemId=` | | Catat kunjungan atau klik (tanpa body) |
| POST | `/api/checkout` | | `itemId`, `quantity`, `buyerName`, `buyerEmail`, `note` → token Snap |
| POST | `/api/checkout/:orderCode/sync` | | Tanya status ke Midtrans, kembalikan status saja |
| POST | `/api/payments/midtrans/notification` | signature | Webhook Midtrans |
| GET | `/api/orders?status=PAID\|PENDING\|FAILED` | ya | Pesanan milik penjual, terbaru dulu (maks. 200) |
| GET | `/api/orders/status/:orderCode` | | Struk publik: tanpa email, catatan, atau id internal |
| GET | `/api/health` | | Ping database. 200 `{ status: "ok", timestamp }` atau 503 |
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
| `/<username>` | Halaman toko publik. `/@<username>` dialihkan permanen ke sini |
| `/demo` | Toko contoh dari `npm run seed`. Checkout untuk akun ini ditolak server |
| `/order/<orderCode>` | Struk dan status pembayaran pembeli (bisa dicetak/disimpan PDF) |
| `/dashboard` | Analitik |
| `/dashboard/items` | Tambah, edit, sembunyikan, urutkan, dan hapus produk/tautan |
| `/dashboard/orders` | Riwayat transaksi (termasuk kode promo dan unduhan file) |
| `/dashboard/promo` | Kode promo: buat, aktif/nonaktif, hapus, lihat pemakaian |
| `/dashboard/qr` | QR Code kasir menuju halaman toko: cetak poster, unduh PNG/SVG |
| `/dashboard/settings` | Foto profil, nama toko, bio, warna aksen, tautan sosial |

## Kode promo dan produk digital

- Diskon dikirim ke Midtrans sebagai baris item berharga negatif, sehingga jumlah item sama dengan `gross_amount`. Diskon tidak boleh menghabiskan seluruh harga (Midtrans menolak total 0).
- `usedCount` kupon bertambah saat pesanan menjadi `PAID`, bukan saat checkout. Pesanan `PENDING` yang bersamaan bisa membuat kuota terlewati sedikit.
- File produk digital disimpan di `server/private-uploads/` (tidak masuk git, tidak disajikan `express.static`). Pembeli mengunduh lewat tombol di struk `/order/<kode>` setelah lunas. Belum ada pengiriman lewat email.
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
nano .env.prod   # isi DOMAIN_NAME, ACME_EMAIL, CLIENT_URL, SERVER_PUBLIC_URL (= https://DOMAIN_NAME)
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

# Backup database dan file upload
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T mongo mongodump --archive --gzip > backup-$(date +%F).gz
docker run --rm -v smart-storefront-prod_uploads_prod_data:/u -v smart-storefront-prod_private_uploads_prod_data:/p -v "$PWD":/b alpine tar czf /b/files-$(date +%F).tgz /u /p
```

Volume persisten: `mongo_prod_data`, `uploads_prod_data` (gambar), `private_uploads_prod_data` (file produk digital), `caddy_data` (sertifikat SSL).

### Uji di komputer sendiri

Dengan `DOMAIN_NAME=localhost`, Caddy memakai sertifikat lokal (browser menampilkan peringatan, atau jalankan `docker compose ... exec caddy caddy trust`). Port 80 dan 443 harus kosong.

### Yang perlu diketahui

- MongoDB berjalan tanpa autentikasi, tetapi hanya bisa diakses dari jaringan internal Docker (tidak ada port yang dibuka ke host). Jika MongoDB dipindah ke server lain atau dibuka ke luar, aktifkan autentikasi dan keyFile replica set.
- Rate limit disimpan di memori proses `server`: reset saat container restart, dan tidak dibagi jika `server` dijalankan lebih dari satu replika.
- `trust proxy` = 1 sesuai satu Caddy di depan API. Caddy mengganti `X-Forwarded-For` kiriman klien, jadi header palsu tidak bisa dipakai untuk menghindari rate limit.

## Badge verifikasi

Badge centang di halaman toko hanya tampil jika `User.isVerified` bernilai `true` (default `false`). Belum ada UI admin. Ubah langsung di database:

```bash
mongosh smart_storefront --eval 'db.User.updateOne({username:"namatoko"},{$set:{isVerified:true}})'
```

## Yang belum ada

- Mengosongkan harga atau stok produk lewat form edit (field kosong berarti "tidak diubah").
- Email konfirmasi ke pembeli dari aplikasi ini.
- Logo dan favicon resmi. Saat ini wordmark teks dan avatar inisial dipakai sebagai placeholder.
