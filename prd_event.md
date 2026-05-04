# PRD — Event Management

**TiketPro Platform** · Versi 1.0 · April 2025 · READY TO BUILD

| Metadata | Detail |
|---|---|
| Dokumen | PRD — Event Management Module |
| Sistem | TiketPro — Platform Tiket Konser & Event |
| Versi | 1.0 Final |
| Dibuat untuk | AI Agent (logika & backend) + Junior Developer (UI & testing) |
| Prioritas | P0 — Dikerjakan setelah modul User/Auth selesai |
| Estimasi total | 14 hari kerja (Fase 2 & 3 dari roadmap sistem) |
| Dokumen terkait | PRD User/Auth Management v1.0, System Analysis v2.0 |

---

## Table of Contents

1. [Overview & Tujuan Modul](#1-overview--tujuan-modul)
2. [Event Status & State Machine](#2-event-status--state-machine)
3. [Fitur Detail — Step by Step](#3-fitur-detail--step-by-step)
   - [3.1 Buat Event Baru](#31-buat-event-baru)
   - [3.2 Manajemen Venue](#32-manajemen-venue)
   - [3.3 Manajemen Lineup Artis](#33-manajemen-lineup-artis)
   - [3.4 Manajemen Rundown](#34-manajemen-rundown)
   - [3.5 Manajemen Kategori Tiket](#35-manajemen-kategori-tiket)
   - [3.6 Publish Event](#36-publish-event--checklist--flow)
   - [3.7 Halaman Detail Event (Publik)](#37-halaman-detail-event-publik)
   - [3.8 Search & Browse Event](#38-search--browse-event)
   - [3.9 EO Dashboard](#39-eo-dashboard--ringkasan-event)
   - [3.10 Pembatalan Event](#310-pembatalan-event)
4. [Database Schema — Prisma](#4-database-schema--prisma)
5. [API Endpoints Lengkap](#5-api-endpoints-lengkap)
6. [Rencana Pengerjaan](#6-rencana-pengerjaan--step-by-step)
7. [Acceptance Criteria & Definition of Done](#7-acceptance-criteria--definition-of-done)
8. [Error Codes](#8-error-codes--event-module)
9. [Environment Variables](#9-environment-variables-tambahan)

---

## 1. Overview & Tujuan Modul

Modul Event Management adalah inti dari platform TiketPro. EO/Promotor menggunakan modul ini untuk membuat dan mengelola konser atau event — mulai dari informasi dasar, lineup artis, jadwal (rundown), detail venue, hingga pengaturan kategori tiket. Halaman event publik adalah halaman yang dilihat jutaan customer sebelum memutuskan membeli tiket.

**Scope modul ini mencakup:**

- Manajemen event lengkap: create, edit, publish, archive oleh EO Admin
- Halaman detail event publik: lineup, rundown, venue, tiket — untuk customer
- Manajemen lineup artis: tambah, edit, urutan tampil
- Manajemen rundown: jadwal per stage, multi-hari
- Manajemen venue: detail lokasi, fasilitas, peta Google Maps
- Manajemen kategori tiket: harga, kuota, template, periode jual, early bird
- Dashboard ringkasan penjualan per event untuk EO
- Search & browse event untuk customer (homepage dan halaman `/events`)

### 1.1 Siapa yang Pakai Modul Ini?

| Role | Apa yang Mereka Lakukan di Modul Ini |
|---|---|
| EO Admin | Buat event, isi detail, tambah lineup & rundown, set venue, buat kategori tiket, publish, lihat dashboard penjualan |
| EO Staff | Bantu isi lineup/rundown, generate tiket internal (complimentary), tidak bisa publish event |
| Customer | Browse event, lihat detail event (lineup, rundown, venue), pilih tiket, beli tiket |
| Super Admin | Lihat semua event, approve/reject event EO baru, feature event di homepage |
| Affiliate / Reseller | Akses halaman event publik untuk share link tracking |

---

## 2. Event Status & State Machine

Setiap event mempunyai status yang mengontrol apa yang bisa dilakukan dan siapa yang bisa melihatnya.

| Status | Keterangan |
|---|---|
| `DRAFT` | Hanya EO yang bisa lihat |
| `REVIEW` | Menunggu approve admin |
| `PUBLISHED` | Tampil publik di platform |
| `SALE_OPEN` | Tiket bisa dibeli |
| `SALE_CLOSED` | Penjualan selesai |
| `COMPLETED` | Event sudah berlangsung |
| `ARCHIVED` | Disembunyikan dari publik |
| `CANCELLED` | Event dibatalkan |

### Tabel Transisi Status

| Transisi | Siapa yang Bisa | Trigger | Efek pada Tiket |
|---|---|---|---|
| `DRAFT → REVIEW` | EO Admin | Klik "Submit for Review" | – |
| `DRAFT → PUBLISHED` | Super Admin only (bypass review) | Force publish | Tiket kategori mulai bisa dibuat |
| `REVIEW → PUBLISHED` | Super Admin | Approve event | Tiket mulai tampil, bisa beli jika saleStart sudah lewat |
| `REVIEW → DRAFT` | Super Admin | Reject + alasan | EO dapat notifikasi email dengan alasan penolakan |
| `PUBLISHED → SALE_OPEN` | Sistem otomatis | `saleStartAt` tercapai | Tombol beli tiket aktif di halaman event |
| `SALE_OPEN → SALE_CLOSED` | Sistem otomatis | `saleEndAt` tercapai atau semua kuota habis | Tombol beli hilang, tampil "Tiket Habis" |
| `SALE_CLOSED → COMPLETED` | Sistem otomatis | `eventEndDate` + 1 hari | Event pindah ke arsip otomatis setelah 30 hari |
| `ANY → CANCELLED` | EO Admin / Super Admin | Manual cancel | Semua tiket valid otomatis di-flag untuk refund review |
| `ANY → ARCHIVED` | EO Admin / Super Admin | Manual archive | Event hilang dari listing publik |

---

## 3. Fitur Detail — Step by Step

---

### 3.1 Buat Event Baru

EO Admin membuat event melalui form multi-step (wizard) agar tidak overwhelming. Setiap step bisa disimpan sebagai draft.

#### 3.1.1 Step-by-Step Wizard

| Step | Nama Tab | Fields | Wajib Diisi |
|---|---|---|---|
| 1 | Info Dasar | Judul event, slug (auto), deskripsi singkat, deskripsi panjang (rich text), poster (upload), banner (upload), genre musik, tags | Judul, Deskripsi singkat, Poster |
| 2 | Jadwal & Lokasi | Tanggal mulai, tanggal selesai, kota, provinsi, apakah multi-hari? | Semua field wajib |
| 3 | Venue | Nama venue, alamat lengkap, kapasitas total, fasilitas (checklist), koordinat GPS, embed Google Maps URL, catatan venue | Nama venue, Alamat, Kapasitas |
| 4 | Lineup | Daftar artis: nama, foto, role (Headliner/Supporting/DJ/Host), urutan tampil | Min. 1 artis |
| 5 | Rundown | Jadwal per sesi: waktu mulai, waktu selesai, judul sesi, stage (jika multi-stage) | Min. 1 sesi |
| 6 | Tiket | Kategori tiket: nama, harga, kuota, periode jual, deskripsi benefit, template | Min. 1 kategori |
| 7 | Review & Publish | Preview event sebagai customer, cek checklist kelengkapan, pilih: Save Draft atau Submit for Review | – |

#### 3.1.2 Field Specifications — Info Dasar

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| Judul Event | text | Min 5 kar, max 150 kar, wajib | Contoh: "MALIQ & D'Essentials: SENANDUNG JAKARTA 2025" |
| Slug | text (auto) | URL-safe, unik di sistem, lowercase, hanya huruf-angka-dash | Auto-generate dari judul. EO bisa edit manual. Contoh: `maliq-senandung-jakarta-2025` |
| Deskripsi Singkat | textarea | Min 20 kar, max 300 kar, wajib | Tampil di card listing dan OG meta description |
| Deskripsi Panjang | rich text | Min 50 kar, wajib | Editor WYSIWYG (Tiptap). Support: bold, italic, bullet, heading, link, image embed |
| Poster | file upload | Max 5MB, JPG/PNG/WEBP, min 800×800px | Tampil sebagai gambar utama event. Di-resize ke 800×800 (square) |
| Banner | file upload | Max 5MB, JPG/PNG/WEBP, min 1200×630px | Untuk OG image dan header halaman event. Di-resize ke 1200×630 |
| Genre Musik | select multi | Min 1 pilihan dari list yang ada | List: Pop, Rock, Jazz, EDM, Hip-Hop, R&B, Dangdut, Indie, Classical, World Music |
| Tags | text multi | Max 10 tag, max 30 kar per tag | Untuk SEO dan filter. Contoh: `#jakarta`, `#outdoor`, `#2025` |
| Tanggal Mulai | datetime-local | Harus di masa depan saat pertama dibuat | Format: DD/MM/YYYY HH:mm WIB/WITA/WIT (timezone-aware) |
| Tanggal Selesai | datetime-local | Harus >= tanggal mulai | Jika single-day event: tanggal selesai = tanggal mulai |
| Multi-hari? | toggle | – | Jika on: rundown bisa dibuat per hari. Tiket bisa dibuat per hari |

#### 3.1.3 Create Event API

```typescript
// POST /api/events
// Auth: EO_ADMIN atau EO_STAFF (dengan flag canCreateEvent)

// Request Body:
{
  title: string,                  // "MALIQ Senandung Jakarta 2025"
  slug?: string,                  // opsional, auto-generate jika tidak diisi
  shortDescription: string,
  description: string,            // HTML dari rich text editor
  genreIds: string[],
  tags: string[],
  startDate: string,              // ISO 8601: "2025-08-15T19:00:00+07:00"
  endDate: string,
  isMultiDay: boolean,
  city: string,
  province: string,
}

// Response 201:
{
  id: string,
  slug: string,
  status: "DRAFT",
  createdAt: string
}

// Error cases:
// 400: VALIDATION_ERROR — field tidak valid
// 409: SLUG_ALREADY_EXISTS — slug sudah dipakai, saran slug alternatif
// 403: FORBIDDEN — role tidak punya akses buat event
```

#### 3.1.4 Upload Poster & Banner

```typescript
// POST /api/events/:id/poster   (multipart/form-data, field: poster)
// POST /api/events/:id/banner   (multipart/form-data, field: banner)

// Backend flow per upload:
// 1. Validasi MIME dari magic bytes (bukan hanya extension)
// 2. Cek ukuran: max 5MB
// 3. Resize dengan Sharp:
//    - poster  → 800x800 cover center + 400x400 thumbnail
//    - banner  → 1200x630 cover center + 600x315 thumbnail
// 4. Convert ke WebP (quality 85) untuk ukuran lebih kecil
// 5. Upload ke Cloudflare R2: /events/{eventId}/poster.webp
// 6. Update event.posterUrl dan event.bannerUrl di DB
// 7. Return: { posterUrl, bannerUrl, thumbnailUrl }

// Error cases:
// 400: FILE_TOO_LARGE (> 5MB)
// 400: INVALID_FILE_TYPE
// 400: IMAGE_TOO_SMALL (di bawah minimum resolusi)
```

---

### 3.2 Manajemen Venue

Detail venue adalah informasi penting bagi customer untuk mempersiapkan diri sebelum event. Venue disimpan sebagai relasi 1-to-1 dengan event.

#### 3.2.1 Field Specifications Venue

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| Nama Venue | text | Min 3 kar, max 200 kar, wajib | Contoh: "Istora Senayan Jakarta" |
| Alamat Lengkap | textarea | Min 10 kar, wajib | Baris 1: Nama jalan + nomor. Baris 2: Kelurahan, Kecamatan. Baris 3: Kota, Kode Pos |
| Kota | text / select | Wajib, dari list kota Indonesia | Digunakan juga untuk filter event di homepage |
| Provinsi | select | Wajib | 34 provinsi Indonesia |
| Kapasitas Total | number | Min 1, max 999999, wajib | Kapasitas maksimum venue (bukan jumlah tiket yang dijual) |
| Latitude | decimal | Range -90 to 90, 6 desimal | Untuk embed peta. Bisa auto-fill dari nama venue (Google Places API) |
| Longitude | decimal | Range -180 to 180, 6 desimal | Untuk embed peta |
| Google Maps URL | url | Format URL Google Maps yang valid | Link ke Google Maps halaman venue. Tampil sebagai tombol "Lihat di Maps" |
| Fasilitas | checkbox multi | – | Pilihan: Parkir Motor, Parkir Mobil, Akses Difabel, ATM, Mushola, Toilet Umum, Food Court, First Aid, Security |
| Catatan Venue | textarea | Max 1000 kar | Info tambahan: "Dilarang bawa kamera profesional", "Tidak ada kantong plastik" |
| Zona Waktu | select | Default: WIB (Asia/Jakarta) | WIB, WITA, WIT |

#### 3.2.2 Venue API

```typescript
// Create atau update venue (upsert)
// PUT /api/events/:eventId/venue
// Auth: EO_ADMIN yang memiliki event ini

// Request:
{
  name: string,
  address: string,
  city: string,
  province: string,
  capacity: number,
  latitude?: number,
  longitude?: number,
  mapsUrl?: string,
  facilities: string[],   // ["PARKING_CAR","MUSHOLA","ATM"]
  notes?: string,
  timezone: string,       // "Asia/Jakarta"
}
// Response 200: venue object lengkap

// GET venue untuk halaman publik
// GET /api/events/:slug/venue
// Auth: Public
```

---

### 3.3 Manajemen Lineup Artis

#### 3.3.1 Field Specifications Lineup

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| Nama Artis | text | Min 2 kar, max 150 kar, wajib | Nama penampil. Bisa nama band atau nama orang |
| Foto Artis | file upload | Max 2MB, JPG/PNG, min 400×400px | Di-resize ke 400×400 cover center, format WebP |
| Deskripsi Singkat | textarea | Max 300 kar, opsional | Bio singkat artis yang tampil di halaman event |
| Role | select | Wajib, pilihan dari enum | `HEADLINER`, `SUPPORTING`, `DJ`, `HOST`, `SPECIAL_GUEST`, `OPENING_ACT` |
| Urutan Tampil (orderIndex) | number (drag-drop UI) | Auto-assign, bisa di-reorder | 1 = tampil paling pertama/paling prominent di halaman |
| Social Media URL | url | Format URL valid, opsional | Instagram, Spotify, YouTube — tampil sebagai icon link |
| Tag Per-Hari | select | Opsional, jika event multi-hari | Artis ini tampil di hari ke berapa? Bisa multi-hari |

#### 3.3.2 Lineup API

```typescript
// Tambah artis ke lineup
// POST /api/events/:eventId/lineup
{
  artistName: string,
  role: "HEADLINER" | "SUPPORTING" | "DJ" | "HOST" | "SPECIAL_GUEST" | "OPENING_ACT",
  description?: string,
  socialLinks?: { instagram?: string, spotify?: string, youtube?: string },
  dayIndex?: number,   // Untuk event multi-hari: hari ke berapa (1-based)
}
// Response 201: { id, artistName, role, orderIndex, photoUrl: null }

// Upload foto artis (terpisah dari create)
// POST /api/events/:eventId/lineup/:lineupId/photo
// Content-Type: multipart/form-data, field: photo

// Update artis (nama, role, dll)
// PATCH /api/events/:eventId/lineup/:lineupId

// Hapus artis dari lineup
// DELETE /api/events/:eventId/lineup/:lineupId

// Reorder lineup (drag-drop)
// PATCH /api/events/:eventId/lineup/reorder
{
  orderedIds: string[]   // Array ID artis sesuai urutan baru
}
// Response 200: lineup lengkap dengan orderIndex baru
```

---

### 3.4 Manajemen Rundown

Rundown adalah jadwal detail acara. Mendukung event satu stage maupun multi-stage (festival). Juga mendukung event multi-hari.

#### 3.4.1 Field Specifications Rundown

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| Judul Sesi | text | Min 2 kar, max 150 kar, wajib | Contoh: "Opening Act", "Penampilan Raisa", "Istirahat 30 Menit" |
| Waktu Mulai | time/datetime | Wajib, tidak boleh overlap di stage yang sama | Format HH:mm. Jika multi-hari, juga pilih tanggal |
| Waktu Selesai | time/datetime | Harus > waktu mulai, opsional | Opsional — jika tidak diisi, tampil sebagai "open ended" |
| Stage / Area | text / select | Max 100 kar, opsional | Jika single-stage kosongkan. Contoh: "Main Stage", "Side Stage", "VIP Area" |
| Deskripsi | textarea | Max 500 kar, opsional | Detail tambahan sesi. Contoh: "Live acoustic set bersama string section" |
| Tipe Sesi | select | Wajib | `PERFORMANCE`, `BREAK`, `CEREMONY`, `TALKSHOW`, `OTHER` |
| Artis Terkait | select (dari lineup) | Opsional, bisa pilih dari lineup yang sudah ada | Link ke lineup artis. Satu sesi bisa multi-artis (kolaborasi) |
| Hari Ke (multi-hari) | select | Wajib jika `isMultiDay=true` | Hari ke-1, ke-2, dst. |
| Urutan (orderIndex) | number | Auto dari waktu mulai, bisa drag-drop override | Menentukan urutan tampil di halaman publik |

#### 3.4.2 Rundown API

```typescript
// Tambah item rundown
// POST /api/events/:eventId/rundown
{
  title: string,
  startTime: string,        // "19:00" atau "2025-08-15T19:00:00+07:00"
  endTime?: string,
  stage?: string,
  description?: string,
  sessionType: "PERFORMANCE" | "BREAK" | "CEREMONY" | "TALKSHOW" | "OTHER",
  lineupIds?: string[],     // Link ke artis yang tampil di sesi ini
  dayIndex?: number,        // Untuk multi-hari, default: 1
}

// Validasi backend:
// Cek overlap waktu di stage yang sama pada hari yang sama
// Contoh error: { error: "Jadwal bentrok dengan: Penampilan MALIQ (19:00-20:30)" }

// Reorder rundown
// PATCH /api/events/:eventId/rundown/reorder
{ orderedIds: string[] }

// Get rundown publik (dikelompokkan per hari & stage)
// GET /api/events/:slug/rundown
// Response: { days: [{ dayIndex, date, stages: [{ name, sessions: [...] }] }] }
```

---

### 3.5 Manajemen Kategori Tiket

Kategori tiket mengatur harga, kuota, dan aturan penjualan. Satu event bisa punya banyak kategori (VVIP, VIP, Regular, Early Bird, dll).

#### 3.5.1 Field Specifications Kategori Tiket

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| Nama Kategori | text | Min 2 kar, max 100 kar, wajib | Contoh: "VVIP", "VIP", "Regular", "Early Bird", "Student" |
| Harga | number | Min 0 (gratis), max 99999999, wajib | Dalam Rupiah. 0 = tiket gratis. Tampil sebagai "GRATIS" di UI |
| Kuota | number | Min 1, max 999999, wajib | Jumlah tiket yang tersedia. Di-lock di Redis saat war tiket |
| Deskripsi Benefit | textarea | Max 500 kar, opsional | Apa yang didapat pembeli: "Akses area backstage + meet & greet + merchandise pack" |
| Periode Jual Mulai | datetime-local | Harus >= saat ini, wajib | Tiket mulai bisa dibeli. Bisa berbeda per kategori (early bird lebih awal) |
| Periode Jual Selesai | datetime-local | Harus <= tanggal event, wajib | Tiket tidak bisa dibeli setelah tanggal ini |
| Max per Transaksi | number | Min 1, max 10, default 4 | Batas maksimal tiket yang bisa dibeli dalam 1 order |
| Max per Akun | number | Min 1, default 10 | Total tiket kategori ini yang bisa dibeli per akun (anti-scalping) |
| Template Tiket | select | Default: "system", atau "custom" | Jika "custom": EO upload PDF template dengan placeholder QR |
| Upload Template | file upload | PDF max 5MB, wajib jika template=custom | Template PDF yang akan di-inject QR code oleh sistem |
| Adalah Tiket Internal | toggle | Default: false | Jika true: tidak tampil di publik. Hanya untuk complimentary/staff |
| Akses Gate | multiselect | Dari list gate event | Gate mana yang bisa dimasuki dengan tiket kategori ini |
| Warna Tiket | color picker | Hex color, opsional | Warna identifikasi di scan app (hijau=VIP, merah=Regular, dll) |
| Urutan Tampil | number (drag-drop) | Auto, bisa diubah | Urutan kategori di halaman event. Umumnya: VVIP dulu, lalu VIP, lalu Regular |

#### 3.5.2 Early Bird Logic

> **Catatan:** Early Bird adalah kategori tiket biasa dengan periode jual yang lebih pendek dan harga lebih murah. Tidak ada field khusus `is_early_bird` — EO cukup set:
> - Nama: "Early Bird Regular"
> - Harga: Rp 150.000 (lebih murah dari Regular Rp 200.000)
> - Periode Jual Selesai: H-30 sebelum event
>
> Sistem otomatis menutup penjualan Early Bird saat `saleEndAt` tercapai. UI halaman event menampilkan countdown "Early Bird berakhir dalam X hari". Setelah Early Bird habis, tampil kategori Regular dengan harga normal.

#### 3.5.3 Ticket Category API

```typescript
// Buat kategori tiket
// POST /api/events/:eventId/ticket-categories
// Auth: EO_ADMIN yang memiliki event ini
{
  name: string,
  price: number,
  quota: number,
  description?: string,
  saleStartAt: string,      // ISO 8601
  saleEndAt: string,
  maxPerOrder: number,      // default: 4
  maxPerAccount: number,    // default: 10
  templateType: "system" | "custom",
  isInternal: boolean,
  colorHex?: string,
  gateIds?: string[],
}

// Upload template PDF custom
// POST /api/ticket-categories/:categoryId/template
// Content-Type: multipart/form-data, field: template
// Backend: validasi placeholder QR ada di PDF, upload ke R2

// Update kategori (sebelum ada transaksi)
// PATCH /api/ticket-categories/:categoryId
// TIDAK bisa ubah: quota ke nilai lebih kecil dari yang sudah terjual
// BISA ubah: nama, deskripsi, harga (untuk yang belum bayar), periode jual

// Hapus kategori (hanya jika belum ada transaksi)
// DELETE /api/ticket-categories/:categoryId

// Sync kuota ke Redis (wajib dipanggil saat event dipublish)
// POST /api/ticket-categories/:categoryId/sync-quota
// LPUSH tiket_quota:{categoryId} ke Redis dengan nilai quota
```

---

### 3.6 Publish Event — Checklist & Flow

Sebelum event bisa dipublish (disubmit untuk review atau langsung publish jika Super Admin), sistem melakukan validasi kelengkapan.

#### 3.6.1 Pre-Publish Validation Checklist (11 Poin)

| # | Pengecekan | Error jika Gagal |
|---|---|---|
| 1 | Judul event tidak kosong | Wajib isi judul event |
| 2 | Deskripsi singkat tidak kosong (min 20 kar) | Wajib isi deskripsi singkat |
| 3 | Poster event sudah diupload | Wajib upload poster event |
| 4 | Tanggal event di masa depan (min H+3 dari sekarang) | Tanggal event terlalu dekat atau sudah lewat |
| 5 | Venue sudah diisi (nama, alamat, kota wajib) | Detail venue belum lengkap |
| 6 | Min 1 artis di lineup | Tambahkan minimal 1 artis ke lineup |
| 7 | Min 1 sesi di rundown | Tambahkan minimal 1 jadwal ke rundown |
| 8 | Min 1 kategori tiket aktif (bukan internal) | Tambahkan minimal 1 kategori tiket publik |
| 9 | Semua kategori tiket punya `saleStartAt` dan `saleEndAt` | Periode jual tiket belum diisi |
| 10 | `saleEndAt` tidak melebihi tanggal event | Periode jual tidak boleh melebihi tanggal event |
| 11 | Total kuota tiket tidak melebihi kapasitas venue | Total kuota tiket melebihi kapasitas venue |

#### 3.6.2 Publish API Flow

```typescript
// EO submit event untuk review
// POST /api/events/:eventId/submit-review
// Auth: EO_ADMIN yang memiliki event

// Backend:
// 1. Jalankan semua 11 checklist validasi
// 2. Jika ada yang gagal: return 400 dengan daftar error lengkap
// 3. Jika semua passed:
//    - Update event.status = "REVIEW"
//    - Notifikasi Super Admin via email: "Ada event baru menunggu review"
//    - Notifikasi EO: "Event Anda sudah dikirim untuk review"
//    - Return 200: { status: "REVIEW", message: "Event dalam proses review" }

// Super Admin: approve event
// POST /api/admin/events/:eventId/approve
// Auth: SUPER_ADMIN
{
  featuredOnHome?: boolean,   // Tampilkan di featured section homepage
  adminNote?: string,
}

// Backend setelah approve:
// 1. Update event.status = "PUBLISHED"
// 2. Sync semua quota kategori tiket ke Redis
// 3. Kirim email ke EO: "Event Anda telah dipublish!"
// 4. Jika featuredOnHome: tambahkan ke Redis set "featured_events"

// Super Admin: reject event
// POST /api/admin/events/:eventId/reject
{ reason: string }   // Wajib isi alasan
// Update status = "DRAFT", kirim email ke EO dengan alasan
```

---

### 3.7 Halaman Detail Event (Publik)

Halaman yang dilihat customer. Ini adalah halaman terpenting dari sisi konversi — dari sini customer memutuskan beli tiket atau tidak.

#### 3.7.1 Sections Halaman Event

| Section | Konten | Sumber Data | Catatan UI |
|---|---|---|---|
| Hero / Header | Banner event, judul, tanggal, kota, status sale (Beli Tiket / Habis / Belum Dibuka) | `event.bannerUrl`, `event.*` | Banner full-width. Judul overlay di atas banner |
| Tombol CTA Sticky | Tombol "Beli Tiket" sticky di bottom (mobile) atau sidebar kanan (desktop) | `ticketCategories` | Selalu visible saat scroll. Update real-time jika habis |
| Info Cepat | Tanggal, Jam, Venue, Kota — 4 icon cards horizontal | `event.*`, `venue.*` | Di bawah hero. Klik Venue → buka Google Maps |
| Deskripsi Event | Rich text deskripsi panjang event | `event.description` | Render HTML dari Tiptap. Sanitize XSS sebelum render |
| Lineup Artis | Grid foto artis: nama, role, urutan tampil | `lineup[]` | Sort by `orderIndex`. Headliner tampil lebih besar |
| Rundown / Jadwal | Timeline per hari & stage | `rundown[]` | Tab per hari jika multi-hari. Timeline per stage jika multi-stage |
| Venue & Lokasi | Nama venue, alamat, fasilitas (icon), Google Maps embed | `venue.*` | Embed maps via iframe. Tombol "Buka di Maps" |
| Pilih Tiket | Tabel/card per kategori: nama, harga, kuota tersisa, tombol beli | `ticketCategories` | Real-time stok via polling 30 detik. Counter "X tiket tersisa" jika < 50 |
| Bagikan Event | Tombol share: WhatsApp, Instagram, Twitter/X, Copy Link | – | Copy link otomatis include UTM parameter dan referral code |
| Event Lainnya | 3-4 event EO yang sama atau kategori serupa | events API | Rekomendasi untuk upsell |

#### 3.7.2 Real-Time Stok Tiket

> **Cara kerja:** Stok tiket di halaman event di-update agar customer tahu ketersediaan terkini.
> - Polling: Frontend `GET /api/events/:slug/ticket-availability` setiap **30 detik**
> - Response: array kategori dengan field: `{ id, available, sold, status }`
> - Jika `available = 0`: tombol berubah menjadi "Habis" (disabled, warna abu)
> - Jika `available < 50`: tampil badge "Tersisa [X] tiket!" (warna merah/amber)
> - Stok diambil dari **Redis** (DECRBY result) — bukan dari database (lebih cepat)
>
> ⚠️ **JANGAN gunakan WebSocket untuk ini** — polling 30 detik sudah cukup dan lebih sederhana.

#### 3.7.3 Event Public API

```typescript
// Detail event publik (Next.js generateStaticParams + ISR)
// GET /api/events/:slug
// Auth: Public
// Cache: ISR 5 menit (revalidate on publish/update)
// Response:
{
  id, title, slug, shortDescription, description,
  posterUrl, bannerUrl, status,
  startDate, endDate, isMultiDay,
  city, province,
  eo: { id, companyName, logoUrl },
  venue: { name, address, latitude, longitude, mapsUrl, facilities },
  lineup: [{ id, artistName, role, photoUrl, orderIndex, socialLinks }],
  rundown: [{ dayIndex, date, sessions: [{ ... }] }],
  ticketCategories: [{ id, name, price, quota, sold, saleStartAt, saleEndAt }]
}

// Stok real-time (polling 30 detik)
// GET /api/events/:slug/ticket-availability
// Cache: no-cache (selalu fresh dari Redis)
// Response:
{
  categories: [
    { id, available, sold, status: "AVAILABLE" | "LOW_STOCK" | "SOLD_OUT" | "NOT_YET" | "CLOSED" }
  ]
}

// List event (homepage & /events page)
// GET /api/events?city=Jakarta&genre=Pop&page=1&limit=12&sort=date
// Auth: Public
```

---

### 3.8 Search & Browse Event

Customer bisa mencari dan memfilter event dari halaman `/events` dan homepage.

#### 3.8.1 Filter & Sort Options

| Parameter Query | Tipe | Contoh Nilai | Keterangan |
|---|---|---|---|
| `q` | string | `?q=MALIQ` | Full-text search: judul event, nama artis, nama venue |
| `city` | string | `?city=Jakarta` | Filter berdasarkan kota event |
| `genre` | string (multi) | `?genre=Pop&genre=Rock` | Filter berdasarkan genre (OR) |
| `dateFrom` | date | `?dateFrom=2025-06-01` | Event yang mulai dari tanggal ini |
| `dateTo` | date | `?dateTo=2025-12-31` | Event yang mulai sampai tanggal ini |
| `priceMin` | number | `?priceMin=0` | Harga tiket minimum (kategori termurah) |
| `priceMax` | number | `?priceMax=500000` | Harga tiket maksimum (kategori termurah) |
| `sort` | string | `?sort=date` \| `date_desc` \| `price` \| `popular` | Urutan hasil. Default: `date` (terdekat dulu) |
| `page` | number | `?page=2` | Paginasi, default: 1 |
| `limit` | number | `?limit=12` | Jumlah per halaman, default: 12, max: 48 |
| `status` | string | `?status=SALE_OPEN` | Filter hanya event yang lagi bisa dibeli tiketnya |

#### 3.8.2 Implementasi Search

**Opsi A — Sederhana (direkomendasikan untuk awal):**
- PostgreSQL Full-Text Search dengan `tsvector` + `tsquery`
- Index: `CREATE INDEX events_fts ON events USING GIN(to_tsvector(...))`
- Cocok untuk hingga ~50.000 event

**Opsi B — Skala besar (implement nanti):**
- Typesense atau Algolia untuk search yang lebih canggih
- Sync dari PostgreSQL via BullMQ job setiap kali event update
- Implement di Fase 4+ setelah core selesai

> **Keputusan:** Mulai dengan Opsi A. Migrasi ke Opsi B saat event > 50.000.

---

### 3.9 EO Dashboard — Ringkasan Event

Setelah event dipublish, EO dapat melihat dashboard ringkasan penjualan tiket secara real-time.

#### 3.9.1 Sections Dashboard

| Section | Metrik yang Tampil | Sumber Data | Update Interval |
|---|---|---|---|
| Header Stats | Total tiket terjual, Total pendapatan (gross), Estimasi net (setelah platform fee), Persentase kuota terisi | `orders + ticketCategories` | 5 menit (tidak perlu real-time) |
| Chart Penjualan | Line chart: penjualan per hari (7 hari, 30 hari). Bar chart: penjualan per kategori | `orders group by date` | Daily refresh |
| Per Kategori | Tabel: nama kategori, kuota, terjual, tersisa, pendapatan, status sale | `ticketCategories` | 5 menit |
| Order Terbaru | Tabel 20 order terbaru: nama pembeli, kategori, jumlah, waktu, status payment | `orders` | Real-time (polling 30 detik) |
| Affiliate & Referral | Top 5 affiliate berdasarkan konversi, kode referral paling banyak dipakai | `affiliateClicks + referralTransactions` | Harian |
| Pengunjung Halaman | Jumlah view halaman event (unique visitor), dari mana datang (UTM source) | Analytics (Plausible/Simple Analytics) | Harian |

#### 3.9.2 EO Dashboard API

```typescript
// Summary stats
// GET /api/eo/events/:eventId/dashboard/summary
// Auth: EO_ADMIN yang memiliki event, atau SUPER_ADMIN
// Response:
{
  totalSold: number,
  totalRevenue: number,         // Gross dalam Rupiah
  netRevenue: number,           // Setelah platform fee
  platformFeePercent: number,   // Dari eoProfile.commissionRate
  quotaFillPercent: number,     // (totalSold / totalQuota) * 100
  totalQuota: number,
  categorySummary: [{
    categoryId, name, quota, sold, available, revenue
  }]
}

// Chart data penjualan per hari
// GET /api/eo/events/:eventId/dashboard/sales-chart?period=7d|30d|all
// Response: { dates: string[], counts: number[], revenues: number[] }

// Order terbaru
// GET /api/eo/events/:eventId/dashboard/recent-orders?limit=20
// Response: { orders: [{ orderId, buyerName, categoryName, qty, amount, paidAt }] }
```

---

### 3.10 Pembatalan Event

Jika event dibatalkan, sistem harus menangani semua tiket yang sudah terjual secara otomatis.

```typescript
// POST /api/events/:eventId/cancel
// Auth: EO_ADMIN yang memiliki event, atau SUPER_ADMIN
{
  reason: string,        // Wajib isi alasan pembatalan
  notifyBuyers: boolean, // Default: true
}

// Backend flow:
// 1. Validasi: event masih bisa dicancel (status bukan COMPLETED/ARCHIVED)
// 2. Update event.status = "CANCELLED"
// 3. Set semua ticketCategories.status = "SALE_CLOSED"
// 4. Hapus quota dari Redis (set ke 0)
// 5. Flag semua tiket VALID sebagai status CANCELLED_EVENT
// 6. Buat RefundRequest otomatis untuk semua order PAID dengan status PENDING_REVIEW
// 7. Queue BullMQ: kirim email notifikasi ke semua pembeli
// 8. Queue BullMQ: kirim email + WA ke EO konfirmasi pembatalan
// 9. Super Admin mendapat notifikasi untuk review refund

// Email ke pembeli:
// Subjek: "Event [Nama Event] Dibatalkan — Proses Refund Otomatis"
// Isi: alasan, informasi refund akan diproses 3-7 hari kerja
```

---

## 4. Database Schema — Prisma

Schema lengkap untuk modul Event. Salin langsung ke `schema.prisma`, jalankan `prisma migrate`.

```prisma
model Event {
  id               String      @id @default(cuid())
  eoId             String
  title            String
  slug             String      @unique
  shortDescription String
  description      String      @db.Text
  posterUrl        String?
  bannerUrl        String?
  thumbnailUrl     String?
  status           EventStatus @default(DRAFT)
  startDate        DateTime
  endDate          DateTime
  isMultiDay       Boolean     @default(false)
  city             String
  province         String
  isFeatured       Boolean     @default(false)
  adminNote        String?     @db.Text
  cancelReason     String?     @db.Text
  publishedAt      DateTime?
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  eo               EoProfile   @relation(fields: [eoId], references: [id])
  venue            EventVenue?
  lineup           EventLineup[]
  rundown          EventRundown[]
  ticketCategories TicketCategory[]
  genres           EventGenre[]
  tags             EventTag[]
  gates            Gate[]
  orders           Order[]

  @@index([status, startDate])
  @@index([city, status])
  @@index([eoId, status])
  @@index([isFeatured, status])
}

enum EventStatus {
  DRAFT REVIEW PUBLISHED SALE_OPEN SALE_CLOSED COMPLETED ARCHIVED CANCELLED
}

model EventVenue {
  id          String   @id @default(cuid())
  eventId     String   @unique
  name        String
  address     String   @db.Text
  city        String
  province    String
  capacity    Int
  latitude    Float?
  longitude   Float?
  mapsUrl     String?
  facilities  String[]              // ["PARKING_CAR","MUSHOLA","ATM"]
  notes       String?  @db.Text
  timezone    String   @default("Asia/Jakarta")
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

model EventLineup {
  id          String      @id @default(cuid())
  eventId     String
  artistName  String
  photoUrl    String?
  description String?     @db.Text
  role        LineupRole  @default(SUPPORTING)
  orderIndex  Int
  dayIndex    Int?        // null = tampil semua hari
  socialLinks Json?       // { instagram?, spotify?, youtube? }
  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  rundownSessions EventRundown[] @relation("RundownArtists")

  @@index([eventId, orderIndex])
}

enum LineupRole { HEADLINER SUPPORTING DJ HOST SPECIAL_GUEST OPENING_ACT }

model EventRundown {
  id          String      @id @default(cuid())
  eventId     String
  title       String
  startTime   DateTime
  endTime     DateTime?
  stage       String?
  description String?     @db.Text
  sessionType SessionType @default(PERFORMANCE)
  orderIndex  Int
  dayIndex    Int         @default(1)
  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  artists     EventLineup[] @relation("RundownArtists")

  @@index([eventId, dayIndex, orderIndex])
}

enum SessionType { PERFORMANCE BREAK CEREMONY TALKSHOW OTHER }

model TicketCategory {
  id              String    @id @default(cuid())
  eventId         String
  name            String
  description     String?   @db.Text
  price           Int                       // Rupiah. 0 = gratis
  quota           Int
  sold            Int       @default(0)
  saleStartAt     DateTime
  saleEndAt       DateTime
  maxPerOrder     Int       @default(4)
  maxPerAccount   Int       @default(10)
  templateType    String    @default("system")  // "system" | "custom"
  templateUrl     String?
  isInternal      Boolean   @default(false)
  colorHex        String?
  orderIndex      Int       @default(0)
  status          CatStatus @default(DRAFT)
  event           Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tickets         Ticket[]
  allowedGates    Gate[]    @relation("GateCategories")

  @@index([eventId, isInternal, status])
}

enum CatStatus { DRAFT ACTIVE CLOSED SOLD_OUT }

model EventGenre {
  id      String @id @default(cuid())
  eventId String
  genre   String
  event   Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, genre])
}

model EventTag {
  id      String @id @default(cuid())
  eventId String
  tag     String
  event   Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, tag])
}
```

---

## 5. API Endpoints Lengkap

### 5.1 Event CRUD

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/events` | EO_ADMIN | Buat event baru (status: DRAFT) |
| `GET` | `/api/events` | Public | List event dengan filter & pagination |
| `GET` | `/api/events/:slug` | Public | Detail event lengkap (publik) |
| `PATCH` | `/api/events/:eventId` | EO_ADMIN (pemilik) | Update event (judul, deskripsi, tanggal, dll) |
| `DELETE` | `/api/events/:eventId` | EO_ADMIN (pemilik) | Soft delete (hanya jika DRAFT & belum ada order) |
| `POST` | `/api/events/:eventId/poster` | EO_ADMIN (pemilik) | Upload / ganti poster event |
| `POST` | `/api/events/:eventId/banner` | EO_ADMIN (pemilik) | Upload / ganti banner event |
| `POST` | `/api/events/:eventId/submit-review` | EO_ADMIN (pemilik) | Submit event untuk review Super Admin |
| `POST` | `/api/events/:eventId/cancel` | EO_ADMIN / SUPER_ADMIN | Cancel event + auto-refund flow |
| `POST` | `/api/events/:eventId/archive` | EO_ADMIN (pemilik) | Archive event (hilang dari publik) |
| `GET` | `/api/events/:slug/ticket-availability` | Public | Stok real-time per kategori (no-cache) |

### 5.2 Venue

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `PUT` | `/api/events/:eventId/venue` | EO_ADMIN (pemilik) | Create atau update venue (upsert) |
| `GET` | `/api/events/:slug/venue` | Public | Detail venue event (include fasilitas & peta) |
| `DELETE` | `/api/events/:eventId/venue` | EO_ADMIN (pemilik) | Hapus venue (hanya jika event masih DRAFT) |

### 5.3 Lineup & Rundown

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/events/:eventId/lineup` | EO_ADMIN (pemilik) | Tambah artis ke lineup |
| `PATCH` | `/api/events/:eventId/lineup/:lineupId` | EO_ADMIN (pemilik) | Update data artis |
| `POST` | `/api/events/:eventId/lineup/:lineupId/photo` | EO_ADMIN (pemilik) | Upload foto artis |
| `DELETE` | `/api/events/:eventId/lineup/:lineupId` | EO_ADMIN (pemilik) | Hapus artis dari lineup |
| `PATCH` | `/api/events/:eventId/lineup/reorder` | EO_ADMIN (pemilik) | Ubah urutan lineup (drag-drop) |
| `GET` | `/api/events/:slug/lineup` | Public | List lineup artis event (terurut) |
| `POST` | `/api/events/:eventId/rundown` | EO_ADMIN (pemilik) | Tambah sesi rundown |
| `PATCH` | `/api/events/:eventId/rundown/:rundownId` | EO_ADMIN (pemilik) | Update sesi rundown |
| `DELETE` | `/api/events/:eventId/rundown/:rundownId` | EO_ADMIN (pemilik) | Hapus sesi rundown |
| `PATCH` | `/api/events/:eventId/rundown/reorder` | EO_ADMIN (pemilik) | Ubah urutan rundown |
| `GET` | `/api/events/:slug/rundown` | Public | Rundown lengkap (grouped per hari & stage) |

### 5.4 Ticket Categories

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/events/:eventId/ticket-categories` | EO_ADMIN (pemilik) | Buat kategori tiket baru |
| `GET` | `/api/events/:slug/ticket-categories` | Public | List kategori tiket publik (bukan internal) |
| `PATCH` | `/api/ticket-categories/:categoryId` | EO_ADMIN (pemilik) | Update kategori tiket |
| `DELETE` | `/api/ticket-categories/:categoryId` | EO_ADMIN (pemilik) | Hapus kategori (hanya jika sold=0) |
| `POST` | `/api/ticket-categories/:categoryId/template` | EO_ADMIN (pemilik) | Upload template PDF tiket custom |
| `POST` | `/api/ticket-categories/:categoryId/sync-quota` | EO_ADMIN / System | Sync kuota ke Redis (dipanggil saat publish) |

### 5.5 Admin & EO Dashboard

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/admin/events` | SUPER_ADMIN | List semua event dengan filter & status |
| `GET` | `/api/admin/events/:eventId` | SUPER_ADMIN | Detail event + info EO untuk review |
| `POST` | `/api/admin/events/:eventId/approve` | SUPER_ADMIN | Approve event → PUBLISHED |
| `POST` | `/api/admin/events/:eventId/reject` | SUPER_ADMIN | Reject event → kembali DRAFT + alasan |
| `PATCH` | `/api/admin/events/:eventId/feature` | SUPER_ADMIN | Toggle tampil di featured homepage |
| `GET` | `/api/eo/events` | EO_ADMIN | List event milik EO ini (semua status) |
| `GET` | `/api/eo/events/:eventId/dashboard/summary` | EO_ADMIN (pemilik) | Statistik penjualan event |
| `GET` | `/api/eo/events/:eventId/dashboard/sales-chart` | EO_ADMIN (pemilik) | Data chart penjualan per hari |
| `GET` | `/api/eo/events/:eventId/dashboard/recent-orders` | EO_ADMIN (pemilik) | 20 order terbaru |

---

## 6. Rencana Pengerjaan — Step by Step

> **Konteks penting sebelum mulai:**
> - Modul ini dikerjakan **SETELAH** PRD User/Auth selesai (Fase 1 sudah done)
> - Database sudah ada, Fastify sudah setup, plugin auth sudah ada
> - **AI Agent** mengerjakan semua backend logic & schema
> - **Junior Developer** mengerjakan UI, form handling, testing manual
> - Setiap task menyebut file yang harus dibuat/diubah secara eksplisit

---

### 6.1 Fase 2A — Schema & Backend Core (Hari 1-4)

| Task ID | Task | File yang Dibuat/Diubah | Siapa | Est. |
|---|---|---|---|---|
| E-01 | Tambahkan semua model Event ke schema.prisma (Event, EventVenue, EventLineup, EventRundown, TicketCategory, EventGenre, EventTag) | `packages/db/schema.prisma` | AI Agent | 2 jam |
| E-02 | `prisma migrate dev --name add_event_module` | Terminal | AI Agent | 15 mnt |
| E-03 | Seed data: 3 event dummy lengkap dengan venue, lineup, rundown, kategori tiket | `packages/db/seed.ts` | AI Agent | 1 jam |
| E-04 | Service: `generateSlug(title)` — URL-safe, cek keunikan di DB | `apps/api/src/services/slug.service.ts` | AI Agent | 30 mnt |
| E-05 | Service: `validateEventPublish(eventId)` — jalankan 11 checklist pre-publish | `apps/api/src/services/event-validation.service.ts` | AI Agent | 1 jam |
| E-06 | Service: `syncQuotaToRedis(categoryId, quota)` — LPUSH ke Redis | `apps/api/src/services/quota.service.ts` | AI Agent | 30 mnt |
| E-07 | Route: `POST /api/events` — buat event baru, validasi Zod | `apps/api/src/routes/events/create.ts` | AI Agent | 1 jam |
| E-08 | Route: `GET /api/events` — list publik dengan filter PostgreSQL full-text + index | `apps/api/src/routes/events/list.ts` | AI Agent | 1.5 jam |
| E-09 | Route: `GET /api/events/:slug` — detail event lengkap (join venue+lineup+rundown+tiket) | `apps/api/src/routes/events/detail.ts` | AI Agent | 1 jam |
| E-10 | Route: `PATCH /api/events/:eventId` — update event (validasi: hanya pemilik EO) | `apps/api/src/routes/events/update.ts` | AI Agent | 45 mnt |
| E-11 | Route: `DELETE /api/events/:eventId` — soft delete (cek: status DRAFT & sold=0) | `apps/api/src/routes/events/delete.ts` | AI Agent | 30 mnt |
| E-12 | Route: `POST /api/events/:id/poster` + `/banner` — upload + Sharp resize + R2 | `apps/api/src/routes/events/upload-media.ts` | AI Agent | 1.5 jam |
| E-13 | Tambahkan FTS index PostgreSQL di migration: `CREATE INDEX events_fts` | `packages/db/migrations/` | AI Agent | 20 mnt |
| E-14 | Unit test: generateSlug, validateEventPublish, syncQuotaToRedis | `apps/api/src/services/*.test.ts` | AI Agent | 1 jam |
| E-15 | Update Postman collection: folder Events dengan semua request & contoh response | Postman | Junior Dev | 1.5 jam |

### 6.2 Fase 2B — Venue, Lineup, Rundown (Hari 4-6)

| Task ID | Task | File yang Dibuat/Diubah | Siapa | Est. |
|---|---|---|---|---|
| E-16 | Route: `PUT /api/events/:id/venue` — upsert venue (Prisma upsert) | `apps/api/src/routes/events/venue.ts` | AI Agent | 45 mnt |
| E-17 | Route: `GET /api/events/:slug/venue` — venue publik | `apps/api/src/routes/events/venue.ts` | AI Agent | 20 mnt |
| E-18 | Route: `POST /api/events/:id/lineup` — tambah artis, auto-assign orderIndex | `apps/api/src/routes/events/lineup.ts` | AI Agent | 45 mnt |
| E-19 | Route: `POST /api/events/:id/lineup/:lid/photo` — upload foto artis (Sharp 400x400) | `apps/api/src/routes/events/lineup.ts` | AI Agent | 45 mnt |
| E-20 | Route: `PATCH /api/events/:id/lineup/:lid` — update artis | `apps/api/src/routes/events/lineup.ts` | AI Agent | 20 mnt |
| E-21 | Route: `DELETE /api/events/:id/lineup/:lid` — hapus artis | `apps/api/src/routes/events/lineup.ts` | AI Agent | 15 mnt |
| E-22 | Route: `PATCH /api/events/:id/lineup/reorder` — batch update orderIndex | `apps/api/src/routes/events/lineup.ts` | AI Agent | 30 mnt |
| E-23 | Route: `GET /api/events/:slug/lineup` — list artis terurut | `apps/api/src/routes/events/lineup.ts` | AI Agent | 15 mnt |
| E-24 | Route: `POST /api/events/:id/rundown` — tambah sesi + validasi overlap | `apps/api/src/routes/events/rundown.ts` | AI Agent | 45 mnt |
| E-25 | Route: `PATCH /api/events/:id/rundown/:rid` — update sesi | `apps/api/src/routes/events/rundown.ts` | AI Agent | 20 mnt |
| E-26 | Route: `DELETE /api/events/:id/rundown/:rid` — hapus sesi | `apps/api/src/routes/events/rundown.ts` | AI Agent | 15 mnt |
| E-27 | Route: `PATCH /api/events/:id/rundown/reorder` — batch update orderIndex | `apps/api/src/routes/events/rundown.ts` | AI Agent | 20 mnt |
| E-28 | Route: `GET /api/events/:slug/rundown` — rundown publik grouped per hari & stage | `apps/api/src/routes/events/rundown.ts` | AI Agent | 30 mnt |
| E-29 | Test semua route venue, lineup, rundown di Postman | Postman | Junior Dev | 1.5 jam |

### 6.3 Fase 2C — Ticket Categories & Publish (Hari 6-8)

| Task ID | Task | File yang Dibuat/Diubah | Siapa | Est. |
|---|---|---|---|---|
| E-30 | Route: `POST /api/events/:id/ticket-categories` — buat kategori tiket | `apps/api/src/routes/ticket-categories/create.ts` | AI Agent | 1 jam |
| E-31 | Route: `GET /api/events/:slug/ticket-categories` — list publik (bukan internal) | `apps/api/src/routes/ticket-categories/list.ts` | AI Agent | 20 mnt |
| E-32 | Route: `PATCH /api/ticket-categories/:id` — update (validasi: tidak bisa kurangi kuota < sold) | `apps/api/src/routes/ticket-categories/update.ts` | AI Agent | 45 mnt |
| E-33 | Route: `DELETE /api/ticket-categories/:id` — hapus (hanya jika sold=0) | `apps/api/src/routes/ticket-categories/delete.ts` | AI Agent | 20 mnt |
| E-34 | Route: `POST /api/ticket-categories/:id/template` — upload PDF template | `apps/api/src/routes/ticket-categories/template.ts` | AI Agent | 1 jam |
| E-35 | Route: `GET /api/events/:slug/ticket-availability` — stok real-time dari Redis | `apps/api/src/routes/events/availability.ts` | AI Agent | 30 mnt |
| E-36 | Route: `POST /api/events/:id/submit-review` — validasi + ubah status + notif | `apps/api/src/routes/events/publish.ts` | AI Agent | 1 jam |
| E-37 | Route: `POST /api/admin/events/:id/approve` — approve + sync quota Redis | `apps/api/src/routes/admin/events.ts` | AI Agent | 45 mnt |
| E-38 | Route: `POST /api/admin/events/:id/reject` — reject + notif EO | `apps/api/src/routes/admin/events.ts` | AI Agent | 30 mnt |
| E-39 | Route: `POST /api/events/:id/cancel` — cancel + auto flag refund | `apps/api/src/routes/events/cancel.ts` | AI Agent | 1.5 jam |
| E-40 | BullMQ job: kirim email notifikasi cancel ke semua pembeli | `apps/api/src/workers/event-cancel.worker.ts` | AI Agent | 1 jam |
| E-41 | Email template: Event Dibatalkan, Event Dipublish, Event Ditolak | `apps/api/src/emails/` | Junior Dev | 2 jam |
| E-42 | Cron job: auto update status event (PUBLISHED→SALE_OPEN, SALE_OPEN→SALE_CLOSED, dll) | `apps/api/src/cron/event-status.ts` | AI Agent | 1 jam |
| E-43 | Test semua ticket category + publish flow di Postman | Postman | Junior Dev | 1.5 jam |

### 6.4 Fase 2D — EO Dashboard Backend (Hari 8-9)

| Task ID | Task | File yang Dibuat/Diubah | Siapa | Est. |
|---|---|---|---|---|
| E-44 | Route: `GET /api/eo/events` — list event milik EO (semua status) | `apps/api/src/routes/eo/events.ts` | AI Agent | 30 mnt |
| E-45 | Route: `GET /api/eo/events/:id/dashboard/summary` — stats penjualan | `apps/api/src/routes/eo/dashboard.ts` | AI Agent | 1 jam |
| E-46 | Route: `GET /api/eo/events/:id/dashboard/sales-chart` — data chart | `apps/api/src/routes/eo/dashboard.ts` | AI Agent | 45 mnt |
| E-47 | Route: `GET /api/eo/events/:id/dashboard/recent-orders` — 20 order terbaru | `apps/api/src/routes/eo/dashboard.ts` | AI Agent | 30 mnt |
| E-48 | Route: `GET /api/admin/events` — list semua event untuk Super Admin | `apps/api/src/routes/admin/events.ts` | AI Agent | 30 mnt |
| E-49 | Test dashboard routes di Postman dengan data seed | Postman | Junior Dev | 1 jam |

### 6.5 Fase 3 — Frontend (Hari 9-16)

> Backend sudah selesai dan sudah ditest di Postman. Frontend connect ke real API.

| Task ID | Task | File yang Dibuat/Diubah | Siapa | Est. |
|---|---|---|---|---|
| F-01 | Setup TanStack Query (React Query) untuk fetching, caching, polling | `apps/web/src/lib/query-client.ts` | AI Agent | 30 mnt |
| F-02 | Hooks: `useEvent(slug)`, `useEventList(filters)`, `useTicketAvailability(slug)` dengan polling 30 detik | `apps/web/src/hooks/event.hooks.ts` | AI Agent | 1 jam |
| F-03 | Halaman `/events` — grid event, filter sidebar (kota, genre, tanggal, harga), search bar | `apps/web/src/app/events/page.tsx` | Junior Dev | 3 jam |
| F-04 | Komponen `EventCard` — thumbnail, judul, tanggal, kota, harga mulai dari, status badge | `apps/web/src/components/EventCard.tsx` | Junior Dev | 1.5 jam |
| F-05 | Halaman `/events/[slug]` — halaman detail event lengkap (semua sections) | `apps/web/src/app/events/[slug]/page.tsx` | Junior Dev | 5 jam |
| F-06 | Komponen `LineupGrid` — grid foto artis, responsive, headliner lebih besar | `apps/web/src/components/event/LineupGrid.tsx` | Junior Dev | 2 jam |
| F-07 | Komponen `RundownTimeline` — tab per hari, timeline per stage, icon tipe sesi | `apps/web/src/components/event/RundownTimeline.tsx` | Junior Dev | 2.5 jam |
| F-08 | Komponen `VenueCard` — alamat, fasilitas icon, Google Maps embed, tombol buka maps | `apps/web/src/components/event/VenueCard.tsx` | Junior Dev | 2 jam |
| F-09 | Komponen `TicketSelector` — card per kategori, harga, stok, tombol beli, countdown early bird | `apps/web/src/components/event/TicketSelector.tsx` | Junior Dev | 2.5 jam |
| F-10 | Sticky CTA button (mobile: bottom fixed, desktop: sidebar kanan) | `apps/web/src/components/event/StickyBuy.tsx` | Junior Dev | 1 jam |
| F-11 | Halaman `/eo/events` — list event EO dengan status badge, tombol edit/lihat | `apps/web/src/app/eo/events/page.tsx` | Junior Dev | 2 jam |
| F-12 | Halaman `/eo/events/create` — wizard multi-step (7 step) | `apps/web/src/app/eo/events/create/page.tsx` | Junior Dev | 6 jam |
| F-13 | Step 1 Wizard: form info dasar + genre + tags | `apps/web/src/app/eo/events/create/steps/Step1.tsx` | Junior Dev | 1.5 jam |
| F-14 | Step 2 Wizard: tanggal, kota, toggle multi-hari | `apps/web/src/app/eo/events/create/steps/Step2.tsx` | Junior Dev | 1 jam |
| F-15 | Step 3 Wizard: form venue + peta (leaflet.js atau Google Maps Embed) | `apps/web/src/app/eo/events/create/steps/Step3.tsx` | Junior Dev | 2 jam |
| F-16 | Step 4 Wizard: lineup manager — tambah, edit, hapus, drag-drop reorder | `apps/web/src/app/eo/events/create/steps/Step4.tsx` | Junior Dev | 3 jam |
| F-17 | Step 5 Wizard: rundown manager — timeline, tambah sesi, drag-drop | `apps/web/src/app/eo/events/create/steps/Step5.tsx` | Junior Dev | 3 jam |
| F-18 | Step 6 Wizard: ticket category manager — tambah, edit, hapus kategori | `apps/web/src/app/eo/events/create/steps/Step6.tsx` | Junior Dev | 2.5 jam |
| F-19 | Step 7 Wizard: review preview + checklist kelengkapan + submit/save draft | `apps/web/src/app/eo/events/create/steps/Step7.tsx` | Junior Dev | 1.5 jam |
| F-20 | Halaman `/eo/events/[id]/dashboard` — statistik + chart (Recharts) + order terbaru | `apps/web/src/app/eo/events/[id]/dashboard/page.tsx` | Junior Dev | 4 jam |
| F-21 | Halaman `/admin/events` — list event untuk review, approve, reject | `apps/web/src/app/admin/events/page.tsx` | Junior Dev | 2 jam |
| F-22 | Rich text editor Tiptap untuk deskripsi event (bold, italic, link, bullet, heading) | `apps/web/src/components/RichTextEditor.tsx` | AI Agent | 1 jam |
| F-23 | Upload component dengan drag-drop + preview + progress bar | `apps/web/src/components/FileUploader.tsx` | AI Agent | 1 jam |
| F-24 | `generateMetadata()` untuk SEO per event (title, description, OG image) | `apps/web/src/app/events/[slug]/page.tsx` | AI Agent | 30 mnt |
| F-25 | Responsive test semua halaman baru: 375px, 768px, 1280px | Browser | Junior Dev | 2 jam |
| F-26 | E2E test Playwright: buat event → publish → lihat di publik | `apps/web/e2e/event.spec.ts` | AI Agent | 2 jam |

---

## 7. Acceptance Criteria & Definition of Done

### 7.1 Acceptance Criteria per Fitur

| Fitur | Acceptance Criteria (semua harus PASS) |
|---|---|
| Buat Event | ✓ Slug auto-generate dari judul, unik, bisa diedit manual<br>✓ Semua field divalidasi dengan pesan error spesifik<br>✓ Event tersimpan sebagai DRAFT setelah create<br>✓ Upload poster/banner berhasil di-resize dan tersimpan di R2 |
| Venue | ✓ Upsert bekerja (create pertama, update berikutnya)<br>✓ Koordinat GPS opsional, jika diisi tampil di peta<br>✓ Fasilitas tersimpan sebagai array string |
| Lineup | ✓ Artis bisa ditambah, diedit, dihapus<br>✓ Reorder drag-drop menyimpan orderIndex yang benar<br>✓ Foto artis di-resize ke 400×400 WebP |
| Rundown | ✓ Validasi overlap waktu per stage per hari berjalan<br>✓ Error overlap menampilkan nama sesi yang bentrok<br>✓ Multi-hari dan multi-stage dikelompokkan dengan benar di halaman publik |
| Tiket Kategori | ✓ Tidak bisa hapus kategori jika sudah ada tiket terjual<br>✓ Tidak bisa set kuota ke nilai lebih kecil dari yang sudah terjual<br>✓ Template PDF custom bisa diupload dan divalidasi ada placeholder QR<br>✓ Saat approve: quota ter-sync ke Redis dengan benar |
| Publish Flow | ✓ 11 checklist validasi berjalan sebelum submit review<br>✓ Error checklist tampil sebagai list spesifik (bukan pesan generik)<br>✓ Notifikasi email dikirim ke EO (submit) dan Super Admin (menunggu review)<br>✓ Notifikasi email dikirim ke EO setelah approve/reject |
| Halaman Publik | ✓ Halaman tampil < 2 detik (LCP)<br>✓ ISR 5 menit berjalan (update setelah event diupdate)<br>✓ SEO meta title, description, OG image terpasang<br>✓ Stok tiket polling 30 detik berjalan tanpa refresh halaman<br>✓ Badge "Tersisa X tiket" muncul saat stok < 50<br>✓ Tombol berubah menjadi "Habis" saat stok = 0 |
| Cancel Event | ✓ Semua tiket VALID otomatis di-flag `CANCELLED_EVENT`<br>✓ `RefundRequest` otomatis dibuat untuk semua order PAID<br>✓ Email notifikasi dikirim ke semua pembeli<br>✓ Quota di Redis di-set ke 0 |
| EO Dashboard | ✓ Angka total tiket dan pendapatan akurat<br>✓ Chart penjualan menampilkan data 7 hari terakhir<br>✓ Order terbaru muncul < 1 menit setelah bayar |

### 7.2 Performance Requirements

| Endpoint | Target Response Time | Strategi |
|---|---|---|
| `GET /api/events/:slug` (detail publik) | < 100ms (P95) | ISR Next.js + PostgreSQL index pada slug |
| `GET /api/events` (list + filter) | < 200ms (P95) | PostgreSQL FTS index + pagination + Redis cache 2 menit |
| `GET /api/events/:slug/ticket-availability` | < 50ms (P95) | Baca langsung dari Redis (bukan DB) |
| `POST /api/events` (create) | < 500ms (P95) | Insert sederhana + validasi Zod |
| `PATCH /api/events/:id/lineup/reorder` | < 300ms (P95) | Prisma `updateMany` dalam satu transaction |
| EO Dashboard summary | < 1000ms (P95) | Query aggregate dengan index, cache 5 menit |

---

## 8. Error Codes — Event Module

| HTTP | Error Code | Kapan Terjadi |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input field tidak valid (judul terlalu pendek, tanggal format salah, dll) |
| 400 | `SLUG_ALREADY_EXISTS` | Slug yang diinput sudah dipakai event lain. Response include `suggestedSlug` |
| 400 | `IMAGE_TOO_SMALL` | Resolusi gambar di bawah minimum (poster < 800×800, banner < 1200×630) |
| 400 | `FILE_TOO_LARGE` | Ukuran file melebihi batas (5MB untuk media, 5MB untuk PDF) |
| 400 | `INVALID_FILE_TYPE` | Format file tidak didukung (harus JPG/PNG/WEBP untuk gambar, PDF untuk template) |
| 400 | `SCHEDULE_OVERLAP` | Sesi rundown baru bertabrakan dengan sesi yang sudah ada di stage & hari yang sama |
| 400 | `QUOTA_BELOW_SOLD` | Tidak bisa set kuota lebih kecil dari tiket yang sudah terjual |
| 400 | `EVENT_NOT_CANCELABLE` | Event sudah COMPLETED atau ARCHIVED, tidak bisa dicancel |
| 400 | `CATEGORY_HAS_ORDERS` | Tidak bisa hapus kategori tiket yang sudah ada transaksinya |
| 400 | `PUBLISH_VALIDATION_FAILED` | Checklist pre-publish tidak lulus. Response include array of failed checks |
| 400 | `SALE_DATE_AFTER_EVENT` | Periode jual tiket melebihi tanggal event |
| 403 | `NOT_EVENT_OWNER` | EO mencoba edit event yang bukan miliknya |
| 403 | `EVENT_NOT_EDITABLE` | Event sudah PUBLISHED/COMPLETED, tidak semua field bisa diedit |
| 404 | `EVENT_NOT_FOUND` | Slug atau ID event tidak ditemukan |
| 404 | `LINEUP_NOT_FOUND` | Artis lineup tidak ditemukan di event ini |
| 404 | `RUNDOWN_NOT_FOUND` | Sesi rundown tidak ditemukan di event ini |
| 404 | `CATEGORY_NOT_FOUND` | Kategori tiket tidak ditemukan |
| 409 | `EVENT_ALREADY_PUBLISHED` | Event sudah pernah dipublish, tidak bisa submit review lagi |

---

## 9. Environment Variables Tambahan

Tambahkan ke file `.env` yang sudah ada dari PRD User/Auth. Modul event menggunakan R2 dan Redis yang sudah di-setup sebelumnya.

```bash
# ═══ EVENT SETTINGS ═══
EVENT_REVIEW_REQUIRED="true"      # true = semua event harus review admin dulu
                                   # false = EO bisa langsung publish (untuk dev/test)
EVENT_MIN_DAYS_BEFORE_PUBLISH=3   # Minimum hari antara sekarang dan tanggal event
EVENT_MAX_GENRES_PER_EVENT=5      # Maksimal genre per event
EVENT_MAX_TAGS_PER_EVENT=10       # Maksimal tags per event

# ═══ TICKET SETTINGS ═══
TICKET_LOW_STOCK_THRESHOLD=50     # Tampil badge "Tersisa X" jika stok < nilai ini
TICKET_AVAILABILITY_POLL_MS=30000 # Polling interval stok di frontend (30 detik)

# ═══ UPLOAD LIMITS ═══
UPLOAD_POSTER_MAX_MB=5
UPLOAD_BANNER_MAX_MB=5
UPLOAD_ARTIST_PHOTO_MAX_MB=2
UPLOAD_TICKET_TEMPLATE_MAX_MB=5

# ═══ IMAGE SIZES ═══
POSTER_WIDTH=800
POSTER_HEIGHT=800
BANNER_WIDTH=1200
BANNER_HEIGHT=630
ARTIST_PHOTO_SIZE=400   # Square: 400x400

# ═══ CACHE TTL ═══
CACHE_EVENT_DETAIL_TTL=300        # 5 menit (detik)
CACHE_EVENT_LIST_TTL=120          # 2 menit (detik)
CACHE_EO_DASHBOARD_TTL=300        # 5 menit (detik)

# ═══ CRON ═══
CRON_EVENT_STATUS_UPDATE="*/5 * * * *"  # Cek & update status event tiap 5 menit
```

---

*TiketPro — PRD Event Management v1.0 · April 2025 · Confidential*