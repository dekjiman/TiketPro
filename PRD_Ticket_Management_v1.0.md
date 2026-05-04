# PRD — Ticket Management

**TiketPro Platform** · Versi 1.0 · April 2025 · READY TO BUILD

| Metadata | Detail |
|---|---|
| Dokumen | PRD — Ticket Management Module |
| Sistem | TiketPro — Platform Tiket Konser & Event |
| Versi | 1.0 Final |
| Dibuat untuk | AI Agent (logika & backend) + Junior Developer (UI & testing) |
| Depends on | PRD User/Auth v1.0 ✅ + PRD Event Management v1.0 ✅ |
| Estimasi total | 12 hari kerja (Fase 3 dari roadmap sistem) |
| Dokumen terkait | System Analysis v2.0, PRD Payment (berikutnya) |

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Konsep Inti & Alur Sistem](#2-konsep-inti--alur-sistem)
3. [Fitur Detail](#3-fitur-detail)
   - [3.1 Pembelian Tiket (Order Flow)](#31-pembelian-tiket-order-flow)
   - [3.2 War Tiket — High Concurrency](#32-war-tiket--high-concurrency)
   - [3.3 Tiket Digital — QR Code Generation](#33-tiket-digital--qr-code-generation)
   - [3.4 Template Tiket PDF](#34-template-tiket-pdf)
   - [3.5 Tiket Internal / Complimentary](#35-tiket-internal--complimentary)
   - [3.6 Pengiriman Tiket](#36-pengiriman-tiket)
   - [3.7 My Tickets — Dashboard Customer](#37-my-tickets--dashboard-customer)
   - [3.8 Transfer Tiket](#38-transfer-tiket)
   - [3.9 Refund & Pembatalan Tiket](#39-refund--pembatalan-tiket)
   - [3.10 Resale Prevention & Anti-Scalping](#310-resale-prevention--anti-scalping)
4. [Database Schema — Prisma](#4-database-schema--prisma)
5. [API Endpoints Lengkap](#5-api-endpoints-lengkap)
6. [QR Code — Spesifikasi Teknis](#6-qr-code--spesifikasi-teknis)
7. [BullMQ Workers — Job Queue](#7-bullmq-workers--job-queue)
8. [Rencana Pengerjaan](#8-rencana-pengerjaan--step-by-step)
9. [Acceptance Criteria & Definition of Done](#9-acceptance-criteria--definition-of-done)
10. [Error Codes](#10-error-codes--ticket-module)
11. [Environment Variables](#11-environment-variables)

---

## 1. Overview & Scope

Modul Ticket Management mengelola seluruh lifecycle tiket — dari pemilihan kategori oleh customer, proses order, generate QR code terenkripsi, distribusi tiket digital (PDF + email + WA), hingga pengelolaan refund dan transfer tiket.

Modul ini adalah **jembatan antara Event Management dan Payment** — tanpa modul ini, pembeli tidak bisa mendapatkan tiket yang bisa digunakan untuk masuk ke venue.

### Yang TERMASUK dalam scope ini

- Order tiket oleh customer (single & bulk, hingga maxPerOrder)
- War tiket: anti-oversell dengan Redis atomic DECR
- Virtual waiting room saat traffic tinggi
- QR code generation terenkripsi (AES-256-GCM) per tiket
- PDF tiket — template default sistem & template custom EO
- Pengiriman tiket via email (Resend) & WhatsApp (Fonnte)
- Tiket internal / complimentary oleh EO Staff
- Dashboard "My Tickets" untuk customer
- Transfer tiket ke user lain (sebelum event)
- Refund tiket (terintegrasi dengan payment module)
- Anti-scalping: max per akun, verifikasi pemegang

### Yang TIDAK termasuk (modul lain)

- Payment processing — dihandle modul Payment (PRD berikutnya)
- Gate scan & check-in — dihandle modul Gate Management
- RFID/NFC — dihandle modul RFID

---

## 2. Konsep Inti & Alur Sistem

### 2.1 Hierarki Entitas

```
Event
└── TicketCategory (VVIP, VIP, Regular, Early Bird)
    └── Order (1 Order bisa punya banyak tiket dari 1 kategori)
        └── Ticket (1 tiket = 1 QR code unik = 1 orang masuk)
```

### 2.2 Order Status Lifecycle

```
PENDING      → User pilih tiket, order dibuat, menunggu bayar (TTL 15 menit)
     ↓ bayar via Midtrans
PAID         → Payment sukses, trigger generate tiket
     ↓ generate selesai
FULFILLED    → Tiket sudah di-generate dan dikirim ke customer
     ↓ (opsional)
REFUNDED     → Full refund, semua tiket di-invalidate
PARTIAL_REFUND → Sebagian tiket di-refund
EXPIRED      → Tidak bayar dalam 15 menit, order dibatalkan, stok dikembalikan
CANCELLED    → Di-cancel manual oleh customer/admin (sebelum bayar)
```

### 2.3 Ticket Status Lifecycle

```
PENDING    → Tiket belum di-generate (order belum PAID)
ACTIVE     → QR code sudah di-generate, siap dipakai
USED       → QR sudah di-scan di gate, tiket sudah dipakai
REFUNDED   → Tiket di-refund, QR sudah dinonaktifkan
CANCELLED  → Dibatalkan (event cancel atau order cancel)
TRANSFERRED → Tiket ditransfer ke user lain (QR lama invalid, QR baru di-generate)
```

### 2.4 High-Level Flow Pembelian

```
1. Customer buka halaman event
2. Pilih kategori tiket & jumlah
3. Isi data pemegang tiket (nama per tiket jika > 1)
4. Submit order → sistem cek stok di Redis (atomic DECR)
5. Jika stok ada → buat Order (PENDING) → hit Midtrans → dapat payment URL
6. Customer bayar di Midtrans
7. Midtrans webhook → update Order → PAID
8. BullMQ trigger: generate QR + PDF per tiket → upload ke R2
9. BullMQ trigger: kirim email + WA ke customer
10. Customer bisa download tiket dari dashboard "My Tickets"
```

---

## 3. Fitur Detail

---

### 3.1 Pembelian Tiket (Order Flow)

#### 3.1.1 Form Pembelian

| Field | Tipe | Validasi | Keterangan |
|---|---|---|---|
| categoryId | hidden | Wajib, valid category | Dari URL atau pilihan di halaman event |
| quantity | number | Min 1, max `maxPerOrder` dari kategori | Default: 1 |
| holderNames | string[] | Wajib, satu nama per tiket | Nama orang yang akan masuk. Tampil di tiket PDF |
| holderEmails | string[] | Email valid per tiket, opsional | Jika diisi: tiket dikirim juga ke email pemegang |
| holderPhones | string[] | Format Indonesia, opsional | Untuk kirim WA per pemegang tiket |
| referralCode | string | Opsional, validasi jika diisi | Kode referral dari teman atau affiliate link |
| idempotencyKey | uuid | Wajib, dari frontend | UUID unik per percobaan checkout (anti double-click) |

> **Penting:** `holderNames` adalah nama yang tertera di tiket dan yang akan diverifikasi petugas di gate. Harus diisi untuk semua tiket dalam order.

#### 3.1.2 Validasi Sebelum Order Dibuat

Backend melakukan semua validasi ini **sebelum** mengurangi stok:

1. Event status harus `SALE_OPEN`
2. TicketCategory status harus `ACTIVE`
3. `saleStartAt` ≤ now ≤ `saleEndAt`
4. quantity ≤ `maxPerOrder`
5. Total tiket kategori ini yang dimiliki user (sudah bayar) + quantity ≤ `maxPerAccount`
6. Cek idempotency key — jika sudah ada order dengan key ini, return order yang lama
7. Stok cukup (dicek via Redis DECR — lihat Bagian 3.2)

#### 3.1.3 Order API

```typescript
// POST /api/orders
// Auth: Customer (harus login)
// Rate limit: 3 request per 30 detik per user, 10 per menit per IP

// Request:
{
  categoryId: string,
  quantity: number,            // 1-4 (sesuai maxPerOrder)
  holders: [
    {
      name: string,            // Wajib
      email?: string,          // Opsional
      phone?: string,          // Opsional
    }
    // ...satu objek per tiket
  ],
  referralCode?: string,
  idempotencyKey: string,      // UUID v4 dari frontend
}

// Response 201 — Order berhasil dibuat:
{
  orderId: string,
  status: "PENDING",
  totalAmount: number,         // Dalam Rupiah
  discountAmount: number,      // Jika ada referral/promo
  finalAmount: number,
  expiredAt: string,           // ISO 8601, 15 menit dari sekarang
  paymentToken: string,        // Midtrans Snap token (langsung bisa dipakai)
  paymentUrl: string,          // Midtrans hosted payment URL
}

// Response 409 — Idempotency key sudah ada:
{
  orderId: string,             // Order yang sudah ada
  status: "PENDING" | "PAID" | ...,
  paymentToken: string,
}

// Error cases:
// 400: VALIDATION_ERROR
// 400: SALE_NOT_OPEN — event belum atau sudah tutup penjualan
// 400: EXCEEDED_MAX_PER_ORDER — quantity melebihi batas per transaksi
// 400: EXCEEDED_MAX_PER_ACCOUNT — user sudah punya terlalu banyak tiket ini
// 409: TICKET_SOLD_OUT — stok habis (dari Redis)
// 429: RATE_LIMIT_EXCEEDED
```

#### 3.1.4 Order Expiry (15 Menit)

```typescript
// Saat order dibuat:
// 1. Simpan ke PostgreSQL (status: PENDING)
// 2. Set BullMQ delayed job: expire_order (delay: 15 menit)
// 3. Job ini akan: cancel order + INCRBY stok di Redis kembali

// Jika user bayar sebelum 15 menit:
// → Midtrans webhook masuk → update order PAID → cancel expire job

// Jika tidak bayar:
// → BullMQ expire job jalan
// → Update order.status = EXPIRED
// → Redis: INCRBY tiket_quota:{categoryId} {quantity}
// → Log audit

// Frontend: tampilkan countdown timer 15:00 → 00:00
// Jika habis: tampil modal "Waktu habis, silakan ulangi pembelian"
```

---

### 3.2 War Tiket — High Concurrency

War tiket adalah kondisi ribuan user membeli tiket secara bersamaan. Ini adalah tantangan teknis utama modul ini.

#### 3.2.1 Layer Proteksi

**Layer 1 — Rate Limiting (Edge)**
- Cloudflare WAF + rate limit global
- Per IP: max 10 req/detik pada endpoint order
- Per User: max 3 percobaan order per 30 detik
- Turnstile CAPTCHA invisible (aktif saat traffic tinggi)

**Layer 2 — Virtual Waiting Room**

```typescript
// Aktif saat: concurrent_orders_per_second > 100 (configurable)
// Implementasi: Redis Sorted Set + Socket.io

// Saat user masuk antrian:
// ZADD waiting_room:{categoryId} {timestamp} {userId}

// Proses antrian (setiap 500ms):
// 1. ZRANGE waiting_room:{categoryId} 0 49  → ambil 50 user pertama
// 2. Untuk setiap user: ijinkan akses checkout
// 3. ZREM waiting_room:{categoryId} {userId}

// Push ke user via Socket.io:
// { type: "QUEUE_POSITION", position: 247, estimatedWait: 148 }
// { type: "QUEUE_READY", checkoutToken: "..." }  ← saat giliran tiba
```

**Layer 3 — Redis Atomic Stock Lock**

```typescript
// Saat event dipublish atau saleStart:
// SET tiket_quota:{categoryId} {quota}  ← quota awal

// Saat order dibuat (atomic, tidak bisa race condition):
const remaining = await redis.decrby(`tiket_quota:${categoryId}`, quantity);

if (remaining < 0) {
  // Stok tidak cukup — rollback
  await redis.incrby(`tiket_quota:${categoryId}`, quantity);
  throw new AppError('TICKET_SOLD_OUT', 409);
}
// remaining >= 0: stok berhasil dikurangi, lanjut buat order

// Saat order expire/cancel:
await redis.incrby(`tiket_quota:${categoryId}`, quantity);

// Saat order PAID: stok sudah dikurangi secara permanen, tidak perlu apa-apa
// Update DB: category.sold += quantity (untuk laporan)
```

**Layer 4 — Idempotency Key**

```typescript
// Frontend generate UUID v4 saat halaman checkout dibuka
// Jika user klik "Beli" 2x cepat:
// - Request pertama: buat order baru, simpan key di Redis (TTL 1 jam)
// - Request kedua: key sudah ada → return order yang sama
// Tidak akan pernah ada 2 order dari 1 sesi checkout
```

**Layer 5 — Database Protection**

- PgBouncer connection pooling (max 100 koneksi ke PostgreSQL)
- Index pada `orders(status, expiredAt)` untuk cleanup job
- Partisi tabel `tickets` per event_id jika volume besar

#### 3.2.2 Target Performa War Tiket

| Metrik | Target | Cara Ukur |
|---|---|---|
| Concurrent users | 10.000+ simultan | k6 load test |
| Throughput order | 1.000 order/detik | Prometheus metrics |
| API response time | < 200ms (P95) | Sentry Performance |
| Oversell incidents | 0 (nol) | Redis atomic DECR |
| Duplicate order rate | < 0.01% | Idempotency key |

---

### 3.3 Tiket Digital — QR Code Generation

Setiap tiket memiliki QR code unik yang terenkripsi. QR ini adalah satu-satunya cara masuk ke venue.

#### 3.3.1 Payload QR Code

```typescript
// Data yang di-encode ke QR (sebelum enkripsi):
interface QrPayload {
  tid: string;      // ticketId (cuid)
  eid: string;      // eventId
  cid: string;      // categoryId
  uid: string;      // userId (pemilik tiket)
  hn:  string;      // holderName (nama di tiket)
  iat: number;      // issued at (unix timestamp)
  sig: string;      // HMAC-SHA256 signature untuk verifikasi cepat
}

// Proses enkripsi:
// 1. JSON.stringify(payload)
// 2. Encrypt dengan AES-256-GCM (key dari env QR_ENCRYPTION_KEY)
// 3. Base64url encode hasil enkripsi
// 4. Generate QR image (format PNG, 300x300px, error correction L)
// 5. Upload QR image ke R2: /qr/{ticketId}.png
// 6. Simpan encrypted payload ke tickets.qrPayload

// Proses dekripsi (saat scan di gate):
// 1. Scan QR → dapat base64url string
// 2. Decrypt dengan AES-256-GCM
// 3. Parse JSON → dapat QrPayload
// 4. Verify HMAC signature (cepat, tanpa DB lookup)
// 5. Cek ticket status di DB (atau IndexedDB jika offline)
```

#### 3.3.2 Security Properties QR

- **Tidak bisa dipalsukan**: payload dienkripsi dengan AES-256-GCM, tidak ada key = tidak bisa decrypt
- **Tidak bisa di-replay**: setelah di-scan sekali, status ticket berubah jadi `USED` — scan kedua ditolak
- **Offline-verifiable**: signature HMAC bisa diverifikasi tanpa internet
- **Unique per tiket**: setiap tiket punya payload berbeda (termasuk `iat`)
- **Tidak boleh di-screenshot dan dibagi**: sistem mendeteksi scan duplikat

```typescript
// Helper functions (apps/api/src/lib/qr.ts):

import crypto from 'crypto';
import QRCode from 'qrcode';

const QR_KEY = Buffer.from(process.env.QR_ENCRYPTION_KEY!, 'hex'); // 32 bytes
const HMAC_SECRET = process.env.QR_HMAC_SECRET!;

export function encryptQrPayload(payload: QrPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', QR_KEY, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(12) + tag(16) + encrypted
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptQrPayload(encoded: string): QrPayload {
  const buf = Buffer.from(encoded, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', QR_KEY, iv);
  decipher.setAuthTag(tag);
  const json = decipher.update(encrypted) + decipher.final('utf8');
  return JSON.parse(json);
}

export function signPayload(payload: Omit<QrPayload, 'sig'>): string {
  return crypto.createHmac('sha256', HMAC_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex')
    .substring(0, 16); // 16 char signature
}

export async function generateQrImage(encoded: string): Promise<Buffer> {
  return QRCode.toBuffer(encoded, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' }
  });
}
```

---

### 3.4 Template Tiket PDF

Setiap tiket di-generate sebagai file PDF yang bisa didownload dan dicetak.

#### 3.4.1 Dua Mode Template

**Mode A — Template Default Sistem**

Sistem menggunakan template standar TiketPro dengan layout yang bersih dan profesional.

```
Layout template default:
┌─────────────────────────────────────────┐
│  [LOGO TIKETPRO]      [LOGO EO]         │
├─────────────────────────────────────────┤
│                                         │
│  MALIQ & D'ESSENTIALS                   │
│  SENANDUNG JAKARTA 2025                 │
│                                         │
│  📅 Sabtu, 15 Agustus 2025             │
│  🕕 19:00 WIB - Selesai                │
│  📍 Istora Senayan, Jakarta             │
│                                         │
├─────────────────────────────────────────┤
│  Kategori:  VIP                         │
│  Holder:    BUDI SANTOSO                │
│  Order ID:  TP-2025-08-001234           │
│  Ticket ID: TKT-ABCD1234               │
├──────────────────────┬──────────────────┤
│                      │  [QR CODE]       │
│  ⚠️  Tunjukkan       │                  │
│  tiket ini di gate   │  300x300px       │
│  beserta KTP         │                  │
│                      │                  │
└──────────────────────┴──────────────────┘
│  Syarat & Ketentuan (ringkas)           │
└─────────────────────────────────────────┘
```

**Mode B — Template Custom EO**

EO upload file PDF template dengan area kosong (placeholder) untuk QR code.

```typescript
// Spesifikasi template custom:
// - Format: PDF, A4 atau ticket size (210x99mm untuk tiket konser umumnya)
// - Area QR: persegi minimal 100x100px, background putih, tidak ada konten
// - EO menandai area QR dengan metadata: placeholder di koordinat (x, y, width, height)
// - Sistem inject QR ke koordinat tersebut menggunakan pdf-lib

// Saat EO upload template:
// 1. Validasi format PDF
// 2. Cek ada area placeholder yang bisa di-inject (via metadata atau koordinat manual)
// 3. Generate preview tiket contoh dengan QR dummy
// 4. Upload ke R2: /templates/{categoryId}.pdf
// 5. Simpan koordinat placeholder: templateMeta = { x, y, width, height, page }
```

#### 3.4.2 PDF Generation Flow

```typescript
// Worker: apps/api/src/workers/ticket-pdf.worker.ts
// Dipanggil oleh BullMQ setelah order PAID

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

async function generateTicketPdf(ticketId: string): Promise<Buffer> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { order: { include: { event: { include: { venue: true } } } }, category: true }
  });

  if (ticket.category.templateType === 'custom') {
    return generateCustomPdf(ticket);
  } else {
    return generateDefaultPdf(ticket);
  }
}

async function generateDefaultPdf(ticket: TicketWithRelations): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4

  // Isi konten: nama event, tanggal, venue, kategori, holder, ticket ID
  // Inject QR code image ke pojok kanan bawah
  const qrBuffer = await generateQrImage(ticket.qrEncrypted);
  const qrImage = await pdfDoc.embedPng(qrBuffer);
  page.drawImage(qrImage, { x: 400, y: 80, width: 150, height: 150 });

  return Buffer.from(await pdfDoc.save());
}

async function generateCustomPdf(ticket: TicketWithRelations): Promise<Buffer> {
  const templateBytes = await downloadFromR2(ticket.category.templateUrl!);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const meta = ticket.category.templateMeta as { x: number, y: number, width: number, height: number, page: number };
  const pages = pdfDoc.getPages();
  const page = pages[meta.page - 1];

  const qrBuffer = await generateQrImage(ticket.qrEncrypted);
  const qrImage = await pdfDoc.embedPng(qrBuffer);
  page.drawImage(qrImage, { x: meta.x, y: meta.y, width: meta.width, height: meta.height });

  return Buffer.from(await pdfDoc.save());
}
```

---

### 3.5 Tiket Internal / Complimentary

EO Staff bisa membuat tiket gratis untuk keperluan internal: undangan media, tiket panitia, tiket artis & kru.

#### 3.5.1 Rules Tiket Internal

- Hanya bisa dibuat oleh EO Admin atau EO Staff dari event yang sama
- Tidak perlu payment — langsung status `PAID` dan `FULFILLED`
- Tiket internal tidak termasuk dalam kalkulasi revenue
- Ditandai dengan badge "COMPLIMENTARY" di UI scan gate
- Kuota tiket internal diatur terpisah (`isInternal: true` di TicketCategory)
- Maksimal jumlah complimentary diatur oleh EO per kategori internal
- Audit log semua pembuatan tiket internal

#### 3.5.2 Internal Ticket API

```typescript
// POST /api/tickets/internal
// Auth: EO_ADMIN atau EO_STAFF yang memiliki event

{
  categoryId: string,           // Harus kategori dengan isInternal: true
  holders: [
    {
      name: string,             // Wajib
      email?: string,
      phone?: string,
      role?: string,            // "MEDIA", "PANITIA", "ARTIS", "VIP_TAMU", dll
      notes?: string,           // Catatan internal
    }
  ],
}

// Response 201:
{
  tickets: [
    {
      id: string,
      ticketCode: string,
      holderName: string,
      qrUrl: string,            // URL QR image
      pdfUrl: string,           // URL PDF tiket
    }
  ]
}

// Backend flow:
// 1. Validasi: category.isInternal === true
// 2. Validasi: staff adalah member EO yang memiliki event ini
// 3. Buat Order dengan status PAID (tanpa payment)
// 4. Buat Ticket records (status ACTIVE)
// 5. Langsung trigger generate QR + PDF (sync, tidak via queue)
// 6. Kirim ke email/WA jika diisi
// 7. Catat di audit log: staffId, jumlah tiket, tujuan
```

---

### 3.6 Pengiriman Tiket

Tiket dikirim via email dan WhatsApp secara otomatis setelah order PAID.

#### 3.6.1 Email Tiket

```typescript
// Template email: "Tiket Anda Siap!"
// Library: Resend + React Email
// Trigger: BullMQ job setelah PDF berhasil di-generate

// Isi email:
// - Subject: "🎵 Tiket MALIQ Senandung Jakarta 2025 — Budi Santoso"
// - Header: nama event, tanggal, venue
// - Per tiket: nama pemegang, kategori, ticket ID
// - QR code image di-embed (bukan attachment) untuk preview langsung
// - Tombol "Download PDF" (link ke R2)
// - Tombol "Lihat di My Tickets" (link ke dashboard)
// - Catatan: "Simpan email ini, jangan screenshot dan bagikan QR kepada orang lain"
// - Attachment: PDF tiket (satu PDF per tiket jika multiple)

// Jika 1 order = 3 tiket:
// → 3 email terpisah ke holderEmail masing-masing (jika diisi)
// → 1 email summary ke buyerEmail dengan semua tiket
```

#### 3.6.2 WhatsApp Tiket

```typescript
// Library: Fonnte API
// Template pesan WA:

const waMessage = `
🎟️ *Tiket Anda Siap!*

Halo ${holderName}! 👋

Berikut detail tiket Anda:
📅 *${eventTitle}*
🗓️ ${formattedDate}
📍 ${venueName}, ${city}
🎫 Kategori: ${categoryName}
👤 Pemegang: ${holderName}
🔢 Kode Tiket: ${ticketCode}

Silakan download tiket Anda di link berikut:
${pdfUrl}

_Jangan berikan QR code kepada orang lain. Tiket hanya berlaku untuk 1 orang._

Sampai jumpa di venue! 🎉
`;

// Kirim ke nomor buyer DAN holderPhone (jika berbeda)
// Jika ada gambar QR: kirim sebagai media + caption (bukan hanya teks)
```

#### 3.6.3 Resend Logic

- Jika email gagal: retry 3x dengan backoff (1 menit, 5 menit, 15 menit)
- Jika WA gagal: retry 2x, log error, tidak block delivery email
- Customer bisa trigger resend manual dari "My Tickets" (max 3x per 24 jam)
- Admin bisa trigger resend dari panel admin

---

### 3.7 My Tickets — Dashboard Customer

Halaman `/my-tickets` menampilkan semua tiket yang dimiliki customer.

#### 3.7.1 Sections Dashboard

| Section | Konten | Filter | Keterangan |
|---|---|---|---|
| Tiket Aktif | Tiket untuk event yang belum berlangsung, status ACTIVE | – | Tampil paling atas |
| Tiket Digunakan | Tiket yang sudah di-scan di gate (status USED) | – | Kenangan event masa lalu |
| Tiket Pending | Order yang sudah dibuat tapi belum dibayar | – | Dengan countdown & tombol bayar |
| Tiket Kedaluwarsa | Order yang expire sebelum dibayar | – | Bisa sembunyi |
| Semua Tiket | Semua tiket dengan filter & search | Event, Tanggal, Status | Untuk history lengkap |

#### 3.7.2 Detail Tiket

Setiap tiket card menampilkan:
- Nama event, tanggal, venue
- Kategori & nama pemegang
- Ticket code (format: `TP-XXXX-XXXX`)
- QR code preview (di-blur default, klik untuk tampil jelas)
- Tombol "Download PDF"
- Tombol "Kirim Ulang ke Email/WA"
- Tombol "Transfer Tiket" (jika event belum berlangsung)
- Status badge (ACTIVE / USED / REFUNDED / CANCELLED)

#### 3.7.3 My Tickets API

```typescript
// GET /api/tickets/mine
// Auth: Customer
// Query: ?status=ACTIVE&page=1&limit=20

// Response:
{
  tickets: [
    {
      id: string,
      ticketCode: string,
      status: string,
      holderName: string,
      categoryName: string,
      categoryColor: string,
      event: {
        title: string,
        startDate: string,
        posterUrl: string,
        venue: { name: string, city: string }
      },
      pdfUrl: string,
      qrImageUrl: string,       // Blurred by default di frontend
      usedAt?: string,          // Kapan di-scan
    }
  ],
  total: number,
  page: number,
}

// GET /api/tickets/:ticketId
// Auth: Customer (hanya pemilik tiket)
// Response: detail lengkap tiket + QR payload (tanpa decrypt)

// POST /api/tickets/:ticketId/resend
// Auth: Customer (pemilik tiket)
// Rate limit: 3x per 24 jam per ticketId
// Body: { channel: "email" | "whatsapp" | "both" }
```

---

### 3.8 Transfer Tiket

Customer bisa mentransfer tiket ke user lain sebelum event berlangsung.

#### 3.8.1 Rules Transfer

- Hanya tiket dengan status `ACTIVE` yang bisa ditransfer
- Hanya bisa dilakukan sebelum `eventStartDate`
- Penerima harus punya akun TiketPro yang terverifikasi
- Setelah transfer: QR lama langsung invalid, QR baru di-generate untuk penerima
- Maksimal 1x transfer per tiket (tidak bisa transfer-balik kecuali penerima transfer lagi)
- Transfer tidak bisa dibatalkan setelah dikonfirmasi penerima
- EO bisa menonaktifkan fitur transfer di setting event

#### 3.8.2 Transfer Flow

```typescript
// Step 1: Pengirim inisiasi transfer
// POST /api/tickets/:ticketId/transfer/initiate
// Auth: Customer (pemilik tiket)
{
  recipientEmail: string,   // Email akun TiketPro penerima
  message?: string,         // Pesan opsional ke penerima
}
// Response: { transferId, recipientName, expiredAt (24 jam) }
// Email dikirim ke penerima: "Ada tiket untukmu! Klik untuk konfirmasi"

// Step 2: Penerima konfirmasi
// POST /api/tickets/transfer/:transferId/accept
// Auth: Penerima (harus login)
// Response: { ticket (dengan QR baru) }

// Backend saat accept:
// 1. Invalidate QR lama (update tickets.qrEncrypted = null, status masih ACTIVE)
// 2. Generate QR baru dengan userId penerima
// 3. Update ticket.userId = recipientId
// 4. Update ticket.holderName = recipientName (atau biarkan nama asli, setting EO)
// 5. Generate PDF baru dengan QR baru
// 6. Kirim tiket ke penerima via email + WA
// 7. Notif pengirim: "Tiket berhasil ditransfer"
// 8. Log audit transfer

// Step 3: Penerima tolak (opsional)
// POST /api/tickets/transfer/:transferId/decline
// Auth: Penerima
// Tiket tetap di pengirim, tidak ada perubahan

// Transfer expired jika penerima tidak respon 24 jam:
// BullMQ job: expire_transfer → tiket kembali ke pengirim
```

---

### 3.9 Refund & Pembatalan Tiket

#### 3.9.1 Refund Policy

Setiap event punya refund policy yang diset oleh EO:

| Policy Type | Deskripsi |
|---|---|
| NO_REFUND | Tidak ada refund setelah tiket dibeli |
| FULL_REFUND_UNTIL | Full refund jika diminta sebelum X hari sebelum event |
| PARTIAL_REFUND | Refund sebagian (%) tergantung kapan diminta |
| EVENT_CANCELLED | Selalu full refund jika event dibatalkan EO |

```typescript
// Contoh refund policy (disimpan di tabel refund_policies):
[
  { daysBeforeEvent: 30, refundPercent: 100 },  // > 30 hari: full refund
  { daysBeforeEvent: 7,  refundPercent: 50  },  // 7-30 hari: 50% refund
  { daysBeforeEvent: 0,  refundPercent: 0   },  // < 7 hari: no refund
]
```

#### 3.9.2 Refund Request Flow

```typescript
// POST /api/refunds
// Auth: Customer (pemilik tiket)
{
  ticketIds: string[],      // Bisa refund 1 atau semua tiket dari 1 order
  reason: string,           // Wajib
  bankName?: string,        // Jika payment via transfer bank
  bankAccount?: string,
  bankHolder?: string,
}

// Backend:
// 1. Cek apakah tiket bisa di-refund (policy check)
// 2. Hitung refund amount berdasarkan policy
// 3. Buat RefundRequest (status: PENDING_REVIEW)
// 4. Notif EO Admin: ada refund request baru
// 5. EO Admin approve/reject dari dashboard

// Jika approved:
// 6. Trigger Midtrans Refund API (jika payment via Midtrans)
//    ATAU kirim transfer manual + konfirmasi
// 7. Update ticket.status = REFUNDED
// 8. Update order.status = REFUNDED atau PARTIAL_REFUND
// 9. Invalidate QR code
// 10. Kirim konfirmasi ke customer

// GET /api/refunds/mine
// Auth: Customer
// Response: list semua refund request user

// PATCH /api/admin/refunds/:refundId/approve
// Auth: EO_ADMIN atau SUPER_ADMIN
// { processingNote?: string }

// PATCH /api/admin/refunds/:refundId/reject
// Auth: EO_ADMIN atau SUPER_ADMIN
// { reason: string }
```

---

### 3.10 Resale Prevention & Anti-Scalping

#### 3.10.1 Rules Anti-Scalping

| Rule | Implementasi |
|---|---|
| Max tiket per akun per event | Setting `maxPerAccount` di TicketCategory |
| Max tiket per transaksi | Setting `maxPerOrder` di TicketCategory |
| Verifikasi identitas | Holder name di tiket harus sesuai KTP (gate staff verifikasi) |
| Device fingerprinting | Deteksi multi-akun dari 1 device (browser fingerprint) |
| Satu akun = satu email terverifikasi | Tidak bisa daftar dengan email palsu |
| Cooldown antar order | Tidak bisa beli kategori yang sama < 5 menit dari order terakhir |

#### 3.10.2 Deteksi Suspicious Activity

```typescript
// Flag order sebagai suspicious jika:
// - 1 IP membeli > 5 tiket berbeda dalam 10 menit
// - Device fingerprint sama dengan akun yang sudah di-suspend
// - Nama pemegang semua tiket sama persis (beli banyak untuk dijual)
// - Pola pembelian mirip bot (terlalu cepat, no-think-time)

// Aksi saat suspicious:
// - Flag order untuk manual review
// - Tahan fulfillment (jangan kirim tiket dulu)
// - Notif admin untuk review dalam 24 jam
// - Jika tidak di-review: auto-release dan kirim tiket
```

---

## 4. Database Schema — Prisma

```prisma
model Order {
  id                String      @id @default(cuid())
  userId            String
  eventId           String
  idempotencyKey    String      @unique
  status            OrderStatus @default(PENDING)
  totalAmount       Int                           // Gross dalam Rupiah
  discountAmount    Int         @default(0)
  finalAmount       Int                           // Total yang harus dibayar
  referralCodeUsed  String?
  affiliateId       String?
  midtransOrderId   String?     @unique
  midtransToken     String?                       // Snap token
  paymentMethod     String?                       // "BANK_TRANSFER", "GOPAY", dll
  paidAt            DateTime?
  expiredAt         DateTime                      // PENDING order expire
  fulfilledAt       DateTime?                     // Semua tiket sudah di-generate
  isSuspicious      Boolean     @default(false)
  suspiciousReason  String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  user              User        @relation(fields: [userId], references: [id])
  event             Event       @relation(fields: [eventId], references: [id])
  items             OrderItem[]
  tickets           Ticket[]
  refundRequests    RefundRequest[]

  @@index([userId, status])
  @@index([eventId, status])
  @@index([status, expiredAt])        // Untuk expire job
  @@index([midtransOrderId])
}

enum OrderStatus {
  PENDING PAID FULFILLED REFUNDED PARTIAL_REFUND EXPIRED CANCELLED
}

model OrderItem {
  id          String         @id @default(cuid())
  orderId     String
  categoryId  String
  quantity    Int
  unitPrice   Int            // Harga saat beli (bisa berbeda dari current price)
  subtotal    Int
  order       Order          @relation(fields: [orderId], references: [id])
  category    TicketCategory @relation(fields: [categoryId], references: [id])
}

model Ticket {
  id           String       @id @default(cuid())
  orderId      String
  categoryId   String
  userId       String                          // Pemilik tiket saat ini
  ticketCode   String       @unique            // Format: TP-XXXX-XXXX (human readable)
  status       TicketStatus @default(PENDING)
  holderName   String
  holderEmail  String?
  holderPhone  String?
  holderRole   String?                         // Untuk tiket internal: "MEDIA", "PANITIA"
  isInternal   Boolean      @default(false)
  qrEncrypted  String?      @db.Text           // Encrypted QR payload
  qrImageUrl   String?                         // R2 URL gambar QR
  pdfUrl       String?                         // R2 URL PDF tiket
  emailSentAt  DateTime?
  waSentAt     DateTime?
  usedAt       DateTime?                       // Kapan di-scan di gate
  usedGateId   String?
  transferCount Int         @default(0)        // Berapa kali sudah ditransfer
  generatedAt  DateTime?
  createdAt    DateTime     @default(now())

  order        Order        @relation(fields: [orderId], references: [id])
  category     TicketCategory @relation(fields: [categoryId], references: [id])
  user         User         @relation(fields: [userId], references: [id])
  scanLogs     ScanLog[]
  transfers    TicketTransfer[] @relation("TransferredTicket")

  @@index([userId, status])
  @@index([orderId])
  @@index([ticketCode])
  @@index([status, categoryId])
}

enum TicketStatus {
  PENDING ACTIVE USED REFUNDED CANCELLED TRANSFERRED
}

model TicketTransfer {
  id            String   @id @default(cuid())
  ticketId      String
  fromUserId    String
  toUserId      String
  toEmail       String
  message       String?
  status        TransferStatus @default(PENDING)
  initiatedAt   DateTime @default(now())
  respondedAt   DateTime?
  expiredAt     DateTime                      // 24 jam dari initiatedAt
  ticket        Ticket   @relation("TransferredTicket", fields: [ticketId], references: [id])

  @@index([ticketId])
  @@index([toEmail, status])
}

enum TransferStatus { PENDING ACCEPTED DECLINED EXPIRED }

model RefundRequest {
  id              String        @id @default(cuid())
  orderId         String
  userId          String
  ticketIds       String[]                    // Array ticketId yang di-refund
  reason          String        @db.Text
  refundAmount    Int                         // Total yang akan di-refund
  refundPercent   Float                       // Persentase berdasarkan policy
  status          RefundStatus  @default(PENDING_REVIEW)
  bankName        String?
  bankAccount     String?
  bankHolder      String?
  adminNote       String?       @db.Text
  processedAt     DateTime?
  midtransRefundId String?
  createdAt       DateTime      @default(now())

  order           Order         @relation(fields: [orderId], references: [id])

  @@index([orderId])
  @@index([status, createdAt])
}

enum RefundStatus {
  PENDING_REVIEW APPROVED REJECTED PROCESSING COMPLETED FAILED
}

model RefundPolicy {
  id                String  @id @default(cuid())
  eventId           String
  daysBeforeEvent   Int                       // H berapa sebelum event
  refundPercent     Float                     // 0.0 - 1.0 (0% - 100%)
  @@unique([eventId, daysBeforeEvent])
}

model TicketResendLog {
  id        String   @id @default(cuid())
  ticketId  String
  userId    String
  channel   String   // "email" | "whatsapp" | "both"
  sentAt    DateTime @default(now())

  @@index([ticketId, sentAt])
}
```

---

## 5. API Endpoints Lengkap

### 5.1 Order Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/orders` | Customer | Buat order baru — war tiket flow |
| `GET` | `/api/orders/mine` | Customer | List semua order milik user |
| `GET` | `/api/orders/:orderId` | Customer (pemilik) | Detail order + status payment |
| `DELETE` | `/api/orders/:orderId` | Customer (pemilik) | Cancel order (hanya jika PENDING) |
| `GET` | `/api/orders/:orderId/tickets` | Customer (pemilik) | List tiket dalam order |

### 5.2 Ticket Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/tickets/mine` | Customer | List tiket milik user, dengan filter status |
| `GET` | `/api/tickets/:ticketId` | Customer (pemilik) | Detail tiket termasuk QR URL |
| `GET` | `/api/tickets/:ticketId/download` | Customer (pemilik) | Redirect ke R2 PDF URL (pre-signed) |
| `POST` | `/api/tickets/:ticketId/resend` | Customer (pemilik) | Kirim ulang tiket via email/WA |
| `POST` | `/api/tickets/internal` | EO_ADMIN / EO_STAFF | Buat tiket internal/complimentary |
| `GET` | `/api/tickets/validate/:qrEncrypted` | Gate Staff | Validasi QR code tiket |

### 5.3 Transfer Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/tickets/:ticketId/transfer/initiate` | Customer (pemilik) | Inisiasi transfer tiket |
| `POST` | `/api/tickets/transfer/:transferId/accept` | Customer (penerima) | Terima transfer |
| `POST` | `/api/tickets/transfer/:transferId/decline` | Customer (penerima) | Tolak transfer |
| `DELETE` | `/api/tickets/transfer/:transferId` | Customer (pengirim) | Batalkan transfer (sebelum accepted) |
| `GET` | `/api/tickets/transfers/mine` | Customer | List transfer yang melibatkan user ini |

### 5.4 Refund Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/refunds` | Customer | Ajukan refund request |
| `GET` | `/api/refunds/mine` | Customer | List refund request milik user |
| `GET` | `/api/refunds/:refundId` | Customer / EO | Detail refund request |
| `PATCH` | `/api/admin/refunds/:refundId/approve` | EO_ADMIN / SUPER_ADMIN | Approve refund |
| `PATCH` | `/api/admin/refunds/:refundId/reject` | EO_ADMIN / SUPER_ADMIN | Reject refund dengan alasan |
| `GET` | `/api/eo/events/:eventId/refunds` | EO_ADMIN | List refund requests untuk event ini |

### 5.5 Admin Ticket Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/admin/orders` | SUPER_ADMIN | List semua order dengan filter |
| `GET` | `/api/admin/orders/:orderId` | SUPER_ADMIN | Detail order lengkap |
| `PATCH` | `/api/admin/orders/:orderId/flag` | SUPER_ADMIN | Flag/unflag order sebagai suspicious |
| `POST` | `/api/admin/orders/:orderId/fulfill` | SUPER_ADMIN | Force fulfill order (darurat) |
| `GET` | `/api/eo/events/:eventId/orders` | EO_ADMIN | List order untuk event ini |
| `GET` | `/api/eo/events/:eventId/tickets` | EO_ADMIN | List tiket untuk event ini |

---

## 6. QR Code — Spesifikasi Teknis

### 6.1 Format Ticket Code

```
Format: TP-{EVENT_CODE}-{RANDOM}
Contoh: TP-MALIQ25-A7K3P9

- TP: prefix TiketPro
- EVENT_CODE: 6 karakter dari slug event (huruf kapital)
- RANDOM: 6 karakter alphanumeric acak (crypto.randomBytes)
- Total: 16 karakter + 2 dash = 18 karakter

// Generator:
function generateTicketCode(eventSlug: string): string {
  const eventCode = eventSlug.replace(/-/g, '').toUpperCase().substring(0, 6);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TP-${eventCode}-${random}`;
}
```

### 6.2 QR Validation saat Scan

```typescript
// POST /api/tickets/validate/:qrEncrypted
// Auth: Gate Staff (dengan session token)
// Dipanggil oleh Gate App saat scan QR

// Backend flow:
async function validateQr(qrEncrypted: string, gateId: string, staffId: string) {
  // 1. Decrypt QR payload
  let payload: QrPayload;
  try {
    payload = decryptQrPayload(qrEncrypted);
  } catch {
    return { valid: false, reason: 'INVALID_QR' };
  }

  // 2. Verify HMAC signature (tanpa DB lookup — cepat)
  const expectedSig = signPayload({ ...payload, sig: '' });
  if (payload.sig !== expectedSig) {
    return { valid: false, reason: 'TAMPERED_QR' };
  }

  // 3. Cek tiket di DB
  const ticket = await db.ticket.findUnique({ where: { id: payload.tid } });
  if (!ticket) return { valid: false, reason: 'TICKET_NOT_FOUND' };

  // 4. Cek status tiket
  if (ticket.status === 'USED')      return { valid: false, reason: 'ALREADY_USED', usedAt: ticket.usedAt };
  if (ticket.status === 'REFUNDED')  return { valid: false, reason: 'TICKET_REFUNDED' };
  if (ticket.status === 'CANCELLED') return { valid: false, reason: 'TICKET_CANCELLED' };
  if (ticket.status !== 'ACTIVE')    return { valid: false, reason: 'TICKET_INACTIVE' };

  // 5. Cek gate access (apakah kategori tiket ini bisa masuk gate ini)
  const gate = await db.gate.findUnique({ where: { id: gateId }, include: { allowedCategories: true } });
  const allowed = gate.allowedCategories.some(c => c.id === ticket.categoryId);
  if (!allowed) return { valid: false, reason: 'WRONG_GATE', allowedGates: [...] };

  // 6. Update ticket status → USED
  await db.ticket.update({ where: { id: ticket.id }, data: { status: 'USED', usedAt: new Date(), usedGateId: gateId } });

  // 7. Buat scan log
  await db.scanLog.create({ data: { ticketId: ticket.id, gateId, staffId, result: 'VALID', scannedAt: new Date() } });

  return {
    valid: true,
    ticket: {
      holderName: ticket.holderName,
      categoryName: '...',
      isInternal: ticket.isInternal,
      ticketCode: ticket.ticketCode,
    }
  };
}
```

---

## 7. BullMQ Workers — Job Queue

Semua operasi yang memakan waktu (generate PDF, kirim email, kirim WA) dijalankan async via BullMQ agar API response tetap cepat.

### 7.1 Daftar Queue & Workers

| Queue Name | Trigger | Worker File | Deskripsi |
|---|---|---|---|
| `ticket:generate` | Order PAID | `ticket-generate.worker.ts` | Generate QR + PDF per tiket |
| `ticket:email` | Setelah PDF berhasil dibuat | `ticket-email.worker.ts` | Kirim email tiket ke buyer & holders |
| `ticket:whatsapp` | Setelah PDF berhasil dibuat | `ticket-wa.worker.ts` | Kirim WA tiket via Fonnte |
| `order:expire` | Order dibuat (delayed 15 mnt) | `order-expire.worker.ts` | Expire order + kembalikan stok Redis |
| `transfer:expire` | Transfer dibuat (delayed 24 jam) | `transfer-expire.worker.ts` | Expire transfer yang tidak dikonfirmasi |
| `refund:process` | Refund approved | `refund-process.worker.ts` | Hit Midtrans Refund API + update status |

### 7.2 Worker Flow: ticket:generate

```typescript
// apps/api/src/workers/ticket-generate.worker.ts

ticketGenerateQueue.process(async (job) => {
  const { orderId } = job.data;

  // 1. Ambil order + semua tiket (status PENDING)
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { tickets: true, event: { include: { venue: true } }, items: { include: { category: true } } }
  });

  // 2. Untuk setiap tiket:
  for (const ticket of order.tickets) {
    // a. Generate QR payload + encrypt
    const payload: QrPayload = {
      tid: ticket.id,
      eid: order.eventId,
      cid: ticket.categoryId,
      uid: ticket.userId,
      hn: ticket.holderName,
      iat: Math.floor(Date.now() / 1000),
      sig: '',
    };
    payload.sig = signPayload(payload);
    const qrEncrypted = encryptQrPayload(payload);

    // b. Generate QR image (PNG 300x300)
    const qrImageBuffer = await generateQrImage(qrEncrypted);

    // c. Upload QR image ke R2
    const qrImageUrl = await uploadToR2(`qr/${ticket.id}.png`, qrImageBuffer, 'image/png');

    // d. Generate PDF tiket
    const pdfBuffer = await generateTicketPdf(ticket, order, qrImageBuffer);

    // e. Upload PDF ke R2
    const pdfUrl = await uploadToR2(`tickets/${ticket.id}.pdf`, pdfBuffer, 'application/pdf');

    // f. Update ticket di DB
    await db.ticket.update({
      where: { id: ticket.id },
      data: { status: 'ACTIVE', qrEncrypted, qrImageUrl, pdfUrl, generatedAt: new Date() }
    });
  }

  // 3. Update order status → FULFILLED
  await db.order.update({ where: { id: orderId }, data: { status: 'FULFILLED', fulfilledAt: new Date() } });

  // 4. Trigger email + WA jobs
  await ticketEmailQueue.add('send-tickets', { orderId });
  await ticketWaQueue.add('send-tickets', { orderId });
});
```

### 7.3 Retry Config

```typescript
// Config untuk semua queue:
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 },  // 1 mnt, 2 mnt, 4 mnt
  removeOnComplete: { age: 86400 },                  // Hapus job sukses setelah 24 jam
  removeOnFail: false,                               // Simpan job gagal untuk debug
};

// Queue-specific:
// order:expire → attempts: 1 (tidak perlu retry)
// ticket:generate → attempts: 5 (critical)
// refund:process → attempts: 3, alert admin jika semua gagal
```

---

## 8. Rencana Pengerjaan — Step by Step

> **Konteks:**
> - Fase 1 (Auth) ✅ dan Fase 2 (Event) ✅ sudah selesai
> - Redis, BullMQ, dan Cloudflare R2 sudah tersetup
> - Midtrans sandbox sudah dikonfigurasi (digunakan bersama modul Payment)
> - **AI Agent**: semua logika kompleks, kriptografi, queue, integrasi
> - **Junior Developer**: UI, form, testing, email template, Postman

---

### 8.1 Fase 3A — Schema & Core Backend (Hari 1-3)

| Task ID | Task | File | Siapa | Est. |
|---|---|---|---|---|
| T-01 | Tambahkan model Order, OrderItem, Ticket, TicketTransfer, RefundRequest, RefundPolicy, TicketResendLog ke schema.prisma | `packages/db/schema.prisma` | AI Agent | 1.5 jam |
| T-02 | `prisma migrate dev --name add_ticket_module` | Terminal | AI Agent | 10 mnt |
| T-03 | Seed: 20 order dummy (berbagai status) + tiket terkait untuk event yang sudah ada | `packages/db/seed.ts` | AI Agent | 1 jam |
| T-04 | Lib: `encryptQrPayload()`, `decryptQrPayload()`, `signPayload()`, `generateQrImage()` | `apps/api/src/lib/qr.ts` | AI Agent | 1 jam |
| T-05 | Lib: `generateTicketCode(eventSlug)` — format TP-XXXXX-XXXXXX | `apps/api/src/lib/ticket-code.ts` | AI Agent | 15 mnt |
| T-06 | Lib: `generateDefaultPdf(ticket)` — template sistem dengan pdf-lib | `apps/api/src/lib/pdf-default.ts` | AI Agent | 2 jam |
| T-07 | Lib: `generateCustomPdf(ticket)` — inject QR ke template EO | `apps/api/src/lib/pdf-custom.ts` | AI Agent | 1 jam |
| T-08 | Service: `checkRefundEligibility(ticketId)` — hitung refund berdasarkan policy | `apps/api/src/services/refund.service.ts` | AI Agent | 1 jam |
| T-09 | Unit test: encryptQrPayload, decryptQrPayload, signPayload, generateTicketCode | `apps/api/src/lib/*.test.ts` | AI Agent | 1 jam |
| T-10 | Unit test: checkRefundEligibility dengan berbagai policy scenario | `apps/api/src/services/refund.service.test.ts` | AI Agent | 45 mnt |

### 8.2 Fase 3B — Order Flow & War Tiket (Hari 3-5)

| Task ID | Task | File | Siapa | Est. |
|---|---|---|---|---|
| T-11 | Redis helper: `decrStock(categoryId, qty)`, `incrStock(categoryId, qty)`, `getStock(categoryId)` | `apps/api/src/lib/redis-stock.ts` | AI Agent | 45 mnt |
| T-12 | Redis: Virtual Waiting Room — `enqueueUser()`, `dequeueUsers()`, `getQueuePosition()` | `apps/api/src/lib/waiting-room.ts` | AI Agent | 1.5 jam |
| T-13 | Route: `POST /api/orders` — full war tiket flow: validasi, Redis DECR, buat order, hit Midtrans | `apps/api/src/routes/orders/create.ts` | AI Agent | 2 jam |
| T-14 | Route: `GET /api/orders/mine` — list order user dengan paginasi | `apps/api/src/routes/orders/list.ts` | AI Agent | 30 mnt |
| T-15 | Route: `GET /api/orders/:orderId` — detail order | `apps/api/src/routes/orders/detail.ts` | AI Agent | 20 mnt |
| T-16 | Route: `DELETE /api/orders/:orderId` — cancel order PENDING + Redis INCR | `apps/api/src/routes/orders/cancel.ts` | AI Agent | 30 mnt |
| T-17 | BullMQ Queue: `order:expire` worker — expire PENDING order + kembalikan stok | `apps/api/src/workers/order-expire.worker.ts` | AI Agent | 45 mnt |
| T-18 | Socket.io: emit queue position updates ke waiting room users | `apps/api/src/socket/waiting-room.socket.ts` | AI Agent | 1 jam |
| T-19 | Load test k6: simulasi 500 user beli serentak, verifikasi 0 oversell | `tests/k6/war-ticket.test.js` | AI Agent | 1 jam |
| T-20 | Fix dari load test + tuning PgBouncer config | Config files | AI Agent + Jr | 1 jam |
| T-21 | Test order flow di Postman (happy path + error cases + war tiket scenario) | Postman | Junior Dev | 2 jam |

### 8.3 Fase 3C — Generate Tiket & Delivery (Hari 5-7)

| Task ID | Task | File | Siapa | Est. |
|---|---|---|---|---|
| T-22 | BullMQ Queue: `ticket:generate` worker — QR + PDF per tiket + upload R2 | `apps/api/src/workers/ticket-generate.worker.ts` | AI Agent | 2 jam |
| T-23 | BullMQ Queue: `ticket:email` worker — kirim email tiket (Resend) | `apps/api/src/workers/ticket-email.worker.ts` | AI Agent | 1 jam |
| T-24 | BullMQ Queue: `ticket:whatsapp` worker — kirim WA via Fonnte | `apps/api/src/workers/ticket-wa.worker.ts` | AI Agent | 45 mnt |
| T-25 | Email template: "Tiket Anda Siap!" — React Email component | `apps/api/src/emails/ticket-ready.tsx` | Junior Dev | 2 jam |
| T-26 | Email template: "Transfer Tiket Menunggu Konfirmasi" | `apps/api/src/emails/transfer-request.tsx` | Junior Dev | 1 jam |
| T-27 | Email template: "Refund Diproses" + "Refund Ditolak" | `apps/api/src/emails/refund-*.tsx` | Junior Dev | 1 jam |
| T-28 | Route: `GET /api/tickets/mine` — list tiket dengan filter | `apps/api/src/routes/tickets/list.ts` | AI Agent | 30 mnt |
| T-29 | Route: `GET /api/tickets/:id` + `GET /api/tickets/:id/download` (R2 pre-signed URL) | `apps/api/src/routes/tickets/detail.ts` | AI Agent | 30 mnt |
| T-30 | Route: `POST /api/tickets/:id/resend` — dengan rate limit 3x/24jam | `apps/api/src/routes/tickets/resend.ts` | AI Agent | 30 mnt |
| T-31 | Route: `POST /api/tickets/internal` — tiket complimentary EO | `apps/api/src/routes/tickets/internal.ts` | AI Agent | 1 jam |
| T-32 | Route: `POST /api/tickets/validate/:qrEncrypted` — validasi QR di gate | `apps/api/src/routes/tickets/validate.ts` | AI Agent | 1 jam |
| T-33 | Test generate + delivery flow: buat order → simulasi webhook PAID → cek tiket terbuat | Postman + Script | Junior Dev | 1.5 jam |

### 8.4 Fase 3D — Transfer & Refund (Hari 7-9)

| Task ID | Task | File | Siapa | Est. |
|---|---|---|---|---|
| T-34 | Route: `POST /api/tickets/:id/transfer/initiate` + validasi rules | `apps/api/src/routes/tickets/transfer.ts` | AI Agent | 1 jam |
| T-35 | Route: `POST /api/tickets/transfer/:transferId/accept` — generate QR baru | `apps/api/src/routes/tickets/transfer.ts` | AI Agent | 1 jam |
| T-36 | Route: `POST /api/tickets/transfer/:transferId/decline` | `apps/api/src/routes/tickets/transfer.ts` | AI Agent | 20 mnt |
| T-37 | Route: `DELETE /api/tickets/transfer/:transferId` — batalkan transfer | `apps/api/src/routes/tickets/transfer.ts` | AI Agent | 20 mnt |
| T-38 | BullMQ Queue: `transfer:expire` — expire transfer 24 jam | `apps/api/src/workers/transfer-expire.worker.ts` | AI Agent | 30 mnt |
| T-39 | Route: `POST /api/refunds` — ajukan refund dengan policy check | `apps/api/src/routes/refunds/create.ts` | AI Agent | 1 jam |
| T-40 | Route: `GET /api/refunds/mine` + `GET /api/refunds/:id` | `apps/api/src/routes/refunds/list.ts` | AI Agent | 30 mnt |
| T-41 | Route: `PATCH /api/admin/refunds/:id/approve` + `/reject` | `apps/api/src/routes/admin/refunds.ts` | AI Agent | 1 jam |
| T-42 | BullMQ Queue: `refund:process` — hit Midtrans Refund API | `apps/api/src/workers/refund-process.worker.ts` | AI Agent | 1 jam |
| T-43 | CRUD RefundPolicy untuk EO: set policy per event | `apps/api/src/routes/eo/refund-policy.ts` | Junior Dev | 45 mnt |
| T-44 | Test transfer flow + refund flow di Postman | Postman | Junior Dev | 2 jam |

### 8.5 Fase 3E — Admin & EO Dashboard Backend (Hari 9-10)

| Task ID | Task | File | Siapa | Est. |
|---|---|---|---|---|
| T-45 | Route: `GET /api/admin/orders` + `GET /api/eo/events/:id/orders` | `apps/api/src/routes/admin/orders.ts` | AI Agent | 45 mnt |
| T-46 | Route: `GET /api/eo/events/:id/tickets` — list tiket event | `apps/api/src/routes/eo/tickets.ts` | AI Agent | 30 mnt |
| T-47 | Route: `PATCH /api/admin/orders/:id/flag` — flag suspicious | `apps/api/src/routes/admin/orders.ts` | AI Agent | 20 mnt |
| T-48 | Route: `GET /api/eo/events/:id/refunds` — list refund per event | `apps/api/src/routes/eo/refunds.ts` | AI Agent | 20 mnt |
| T-49 | Anti-scalping: middleware deteksi suspicious order | `apps/api/src/middleware/anti-scalping.ts` | AI Agent | 1 jam |

### 8.6 Fase 3F — Frontend (Hari 10-14)

| Task ID | Task | File | Siapa | Est. |
|---|---|---|---|---|
| F-01 | Hook: `useOrders()`, `useTickets()`, `useOrder(id)` | `apps/web/src/hooks/ticket.hooks.ts` | AI Agent | 30 mnt |
| F-02 | Halaman `/checkout/[categoryId]` — form beli tiket: jumlah, nama pemegang, referral code | `apps/web/src/app/checkout/[categoryId]/page.tsx` | Junior Dev | 3 jam |
| F-03 | Komponen `OrderCountdown` — countdown 15 menit dengan progress bar | `apps/web/src/components/OrderCountdown.tsx` | Junior Dev | 1 jam |
| F-04 | Komponen `WaitingRoom` — posisi antrian realtime via Socket.io | `apps/web/src/components/WaitingRoom.tsx` | AI Agent | 1.5 jam |
| F-05 | Integrasi Midtrans Snap popup di halaman checkout | `apps/web/src/app/checkout/[categoryId]/page.tsx` | AI Agent | 1 jam |
| F-06 | Halaman `/checkout/success` — konfirmasi order berhasil + animasi | `apps/web/src/app/checkout/success/page.tsx` | Junior Dev | 1 jam |
| F-07 | Halaman `/my-tickets` — daftar tiket customer dengan filter | `apps/web/src/app/my-tickets/page.tsx` | Junior Dev | 2.5 jam |
| F-08 | Komponen `TicketCard` — card tiket dengan QR blur, download, resend, transfer | `apps/web/src/components/TicketCard.tsx` | Junior Dev | 2 jam |
| F-09 | Halaman `/my-tickets/[ticketId]` — detail tiket + QR besar + actions | `apps/web/src/app/my-tickets/[ticketId]/page.tsx` | Junior Dev | 1.5 jam |
| F-10 | Modal "Transfer Tiket" — input email penerima, preview, konfirmasi | `apps/web/src/components/TransferModal.tsx` | Junior Dev | 1.5 jam |
| F-11 | Halaman `/my-tickets/transfers` — incoming transfer dengan tombol accept/decline | `apps/web/src/app/my-tickets/transfers/page.tsx` | Junior Dev | 1 jam |
| F-12 | Modal "Ajukan Refund" — pilih tiket, alasan, info bank | `apps/web/src/components/RefundModal.tsx` | Junior Dev | 1.5 jam |
| F-13 | Halaman `/eo/events/[id]/tickets` — list tiket dengan filter + export CSV | `apps/web/src/app/eo/events/[id]/tickets/page.tsx` | Junior Dev | 2 jam |
| F-14 | Halaman `/eo/events/[id]/refunds` — list refund requests + approve/reject | `apps/web/src/app/eo/events/[id]/refunds/page.tsx` | Junior Dev | 1.5 jam |
| F-15 | Form buat tiket internal/complimentary (EO Staff) | `apps/web/src/app/eo/events/[id]/complimentary/page.tsx` | Junior Dev | 1.5 jam |
| F-16 | Halaman `/admin/orders` — semua order dengan filter & flag suspicious | `apps/web/src/app/admin/orders/page.tsx` | Junior Dev | 1.5 jam |
| F-17 | Responsive test semua halaman: 375px, 768px, 1280px | Browser | Junior Dev | 1.5 jam |
| F-18 | E2E test Playwright: beli tiket → cek my-tickets → download PDF | `apps/web/e2e/ticket.spec.ts` | AI Agent | 2 jam |

---

## 9. Acceptance Criteria & Definition of Done

### 9.1 Acceptance Criteria per Fitur

| Fitur | Acceptance Criteria (semua harus PASS) |
|---|---|
| Order Flow | ✓ Tidak bisa beli lebih dari `maxPerOrder`<br>✓ Tidak bisa beli lebih dari `maxPerAccount` total<br>✓ Double-click tidak membuat 2 order (idempotency key bekerja)<br>✓ Order expire tepat 15 menit, stok dikembalikan ke Redis<br>✓ Countdown timer tampil di frontend dan redirect saat habis |
| War Tiket | ✓ Load test 500 concurrent: 0 oversell<br>✓ Waiting room tampil saat traffic tinggi<br>✓ Posisi antrian update realtime via Socket.io<br>✓ Setelah antrian: user bisa checkout normal |
| QR Code | ✓ QR payload terenkripsi, tidak bisa dibaca tanpa key<br>✓ HMAC signature verifiable tanpa DB lookup<br>✓ Scan pertama: VALID, scan kedua: ALREADY_USED<br>✓ QR invalid setelah tiket di-refund atau di-transfer |
| PDF Tiket | ✓ Template default tampil dengan semua info event<br>✓ Template custom EO: QR ter-inject di koordinat yang benar<br>✓ PDF bisa dibuka di mobile PDF viewer<br>✓ PDF size < 1MB per tiket |
| Delivery | ✓ Email terkirim dalam 2 menit setelah order PAID<br>✓ WA terkirim dalam 2 menit setelah order PAID<br>✓ Resend manual berfungsi (rate limit 3x/24 jam)<br>✓ Jika email gagal: retry 3x, log error tapi tidak block WA |
| Transfer | ✓ QR lama langsung invalid setelah transfer accepted<br>✓ QR baru ter-generate untuk penerima<br>✓ Transfer expire 24 jam jika tidak dikonfirmasi<br>✓ Tiket kembali ke pengirim jika penerima decline atau expire |
| Refund | ✓ Policy check: persentase benar berdasarkan hari sebelum event<br>✓ QR invalid setelah refund approved<br>✓ Notifikasi email ke customer setelah approve/reject<br>✓ Midtrans Refund API dipanggil untuk payment gateway transactions |
| Tiket Internal | ✓ Tidak perlu payment, langsung FULFILLED<br>✓ QR + PDF terbuat saat itu juga (sync, tidak queue)<br>✓ Ditandai badge COMPLIMENTARY di scan app<br>✓ Audit log tercatat dengan detail |

### 9.2 Performance Requirements

| Endpoint | Target | Strategi |
|---|---|---|
| `POST /api/orders` | < 200ms (P95) | Redis DECR atomic + async generate via queue |
| `GET /api/tickets/mine` | < 100ms (P95) | Index pada userId + status, paginasi |
| `GET /api/tickets/:id/download` | < 50ms (P95) | Redirect ke R2 pre-signed URL (tidak stream file) |
| `POST /api/tickets/validate/:qr` | < 100ms (P95) | Decrypt + DB lookup + update 1 row |
| Ticket generate worker | < 10 detik per tiket | AES encrypt + pdf-lib + R2 upload |
| Email delivery | < 2 menit | BullMQ queue dengan immediate processing |

---

## 10. Error Codes — Ticket Module

| HTTP | Error Code | Kapan Terjadi |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input tidak valid (quantity < 1, holderNames kurang, dll) |
| 400 | `SALE_NOT_OPEN` | Event belum buka penjualan atau sudah tutup |
| 400 | `EXCEEDED_MAX_PER_ORDER` | Quantity melebihi batas maxPerOrder kategori |
| 400 | `EXCEEDED_MAX_PER_ACCOUNT` | User sudah melebihi batas kepemilikan tiket kategori ini |
| 400 | `INVALID_REFERRAL_CODE` | Referral code tidak ditemukan atau sudah expired |
| 400 | `TRANSFER_NOT_ALLOWED` | Transfer dinonaktifkan EO untuk event ini |
| 400 | `TRANSFER_AFTER_EVENT` | Tidak bisa transfer setelah event dimulai |
| 400 | `TICKET_ALREADY_TRANSFERRED` | Tiket sudah ditransfer sebelumnya |
| 400 | `TICKET_NOT_TRANSFERABLE` | Status tiket bukan ACTIVE (sudah USED, REFUNDED, dll) |
| 400 | `REFUND_NOT_ELIGIBLE` | Policy refund: sudah melewati batas waktu refund |
| 400 | `REFUND_ALREADY_REQUESTED` | Sudah ada refund request untuk tiket ini yang masih pending |
| 400 | `ORDER_NOT_CANCELLABLE` | Order sudah PAID, tidak bisa di-cancel biasa (harus refund) |
| 400 | `RESEND_RATE_LIMIT` | Sudah kirim ulang 3x dalam 24 jam |
| 400 | `INTERNAL_TICKET_WRONG_CATEGORY` | Category bukan internal untuk buat complimentary |
| 403 | `NOT_TICKET_OWNER` | User mencoba akses tiket milik orang lain |
| 404 | `ORDER_NOT_FOUND` | Order ID tidak ditemukan |
| 404 | `TICKET_NOT_FOUND` | Ticket ID tidak ditemukan |
| 404 | `TRANSFER_NOT_FOUND` | Transfer ID tidak ditemukan |
| 409 | `TICKET_SOLD_OUT` | Stok habis (Redis DECR < 0) |
| 409 | `ORDER_ALREADY_EXISTS` | Idempotency key sudah dipakai, return existing order |
| 410 | `QR_ALREADY_USED` | QR code sudah pernah di-scan (tiket sudah digunakan) |
| 410 | `QR_INVALID` | QR tidak bisa di-decrypt atau signature tidak valid |
| 410 | `WRONG_GATE` | Kategori tiket tidak diizinkan masuk gate ini |
| 429 | `RATE_LIMIT_EXCEEDED` | Terlalu banyak request order dari IP/user ini |

---

## 11. Environment Variables

Tambahkan ke `.env` yang sudah ada (dari PRD User/Auth & Event).

```bash
# ═══ QR CODE ENCRYPTION ═══
QR_ENCRYPTION_KEY="64-hex-chars-32-bytes-for-aes-256-gcm"
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

QR_HMAC_SECRET="minimum-32-chars-random-string-for-hmac"

# ═══ ORDER SETTINGS ═══
ORDER_PENDING_TTL_MINUTES=15         # Waktu expire order pending
ORDER_SUSPICIOUS_IP_THRESHOLD=5      # Max tiket berbeda per IP per 10 menit
ORDER_SUSPICIOUS_COOLDOWN_MINUTES=5  # Cooldown beli kategori yang sama

# ═══ WAR TIKET / QUEUE ═══
WAITING_ROOM_THRESHOLD=100           # req/detik sebelum waiting room aktif
WAITING_ROOM_BATCH_SIZE=50           # Berapa user diproses per 500ms
WAITING_ROOM_TICK_MS=500             # Interval proses antrian

# ═══ TRANSFER ═══
TRANSFER_EXPIRY_HOURS=24             # Transfer expire jika tidak dikonfirmasi

# ═══ RESEND ═══
TICKET_RESEND_MAX_PER_DAY=3          # Max resend manual per tiket per 24 jam

# ═══ PDF GENERATION ═══
PDF_TICKET_QR_X=400                  # Koordinat default QR di template sistem
PDF_TICKET_QR_Y=80
PDF_TICKET_QR_SIZE=150

# ═══ QR IMAGE ═══
QR_IMAGE_SIZE=300                    # Pixel width/height QR image
QR_ERROR_CORRECTION="M"              # L, M, Q, H — M recommended

# ═══ ANTI-SCALPING ═══
ANTI_SCALPING_ENABLED="true"
DEVICE_FINGERPRINT_ENABLED="true"
```

---

*TiketPro — PRD Ticket Management v1.0 · April 2025 · Confidential*
