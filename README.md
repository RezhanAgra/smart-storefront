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
| `API_PUBLIC_URL` | `http://localhost:5000` (untuk URL gambar hasil upload) |
| `MIDTRANS_SERVER_KEY` | kosong = checkout nonaktif |
| `MIDTRANS_CLIENT_KEY` | kosong = checkout nonaktif |
| `MIDTRANS_IS_PRODUCTION` | `false` untuk sandbox |

`client/.env`:

| Variabel | Contoh |
| --- | --- |
| `PUBLIC_API_URL` | `http://localhost:5000` |
| `SITE_URL` | `http://localhost:4321` (untuk canonical, `og:url`, dan alamat toko yang ditampilkan) |

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
| PUT/DELETE | `/api/items/:id` | ya | Hanya item milik sendiri (selain itu 404) |
| POST | `/api/uploads` | ya | Multipart field `image`, JPG/PNG/WebP maks. 2 MB → `{ url }` |
| GET | `/api/store/:username` | | Profil publik, item aktif, dan status pembayaran (`payments.enabled`, client key) |
| POST | `/api/store/:username/events?type=view\|click&itemId=` | | Catat kunjungan atau klik (tanpa body) |
| POST | `/api/checkout` | | `itemId`, `quantity`, `buyerName`, `buyerEmail`, `note` → token Snap |
| POST | `/api/checkout/:orderCode/sync` | | Tanya status ke Midtrans, kembalikan status saja |
| POST | `/api/payments/midtrans/notification` | signature | Webhook Midtrans |
| GET | `/api/orders?status=PAID\|PENDING\|FAILED` | ya | Pesanan milik penjual, terbaru dulu (maks. 200) |
| GET | `/api/analytics?days=7\|14\|30` | ya | Total, seri harian (WIB), dan 5 item teratas |

Auth diterima dari cookie `token` atau header `Authorization: Bearer <token>`.

Username `login`, `logout`, `register`, `dashboard`, `api`, `admin`, `404`, dan `500` ditolak saat daftar karena bentrok dengan route client.

## Badge verifikasi

Badge centang di halaman toko hanya tampil jika `User.isVerified` bernilai `true` (default `false`). Belum ada UI admin. Ubah langsung di database:

```bash
docker exec smart-storefront-mongo mongosh smart_storefront --eval 'db.User.updateOne({username:"namatoko"},{$set:{isVerified:true}})'
```

## Yang belum ada

- Edit profil (bio, avatar, `themeColor`) dari UI. Kolomnya sudah dipakai halaman toko.
- Edit dan urutkan ulang item dari dashboard (endpoint `PUT` sudah ada).
- Rate limit untuk endpoint publik (`events`, `checkout`).
- Email konfirmasi ke pembeli dari aplikasi ini.
- Logo dan favicon resmi. Saat ini wordmark teks dan avatar inisial dipakai sebagai placeholder.
