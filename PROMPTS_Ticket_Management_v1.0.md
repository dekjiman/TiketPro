# Prompt Collection — Ticket Management Module
# TiketPro Platform · Versi 1.0

---

## Petunjuk Penggunaan

File ini berisi prompt siap pakai untuk:
- **AI Agent** (Claude Sonnet/Haiku, GPT-4o, dsb) — mengerjakan logika backend yang kompleks
- **Junior Developer** — panduan mengerjakan UI, testing, dan tugas yang lebih sederhana

### Cara pakai prompt ini:
1. Copy seluruh konten prompt (mulai dari `---PROMPT START---` sampai `---PROMPT END---`)
2. Paste ke chat AI Agent atau bagikan ke Junior Dev sebagai task
3. Sertakan file context yang disebutkan di prompt (PRD, schema.prisma yang sudah ada, dsb)

---

## INDEX PROMPT

### Backend (AI Agent)
- [P-T-01] Setup Prisma Schema — Ticket Module
- [P-T-02] QR Code Library — Encrypt, Decrypt, Sign, Generate Image
- [P-T-03] Ticket Code Generator
- [P-T-04] PDF Generator — Template Default Sistem
- [P-T-05] PDF Generator — Template Custom EO (inject QR)
- [P-T-06] Redis Stock Helper — Atomic DECR/INCR
- [P-T-07] Virtual Waiting Room — Redis + Socket.io
- [P-T-08] Route: POST /api/orders — Full War Tiket Flow
- [P-T-09] BullMQ Worker: ticket:generate
- [P-T-10] BullMQ Worker: ticket:email
- [P-T-11] BullMQ Worker: ticket:whatsapp
- [P-T-12] BullMQ Worker: order:expire
- [P-T-13] Route: Ticket CRUD (mine, detail, download, resend)
- [P-T-14] Route: POST /api/tickets/internal
- [P-T-15] Route: POST /api/tickets/validate/:qrEncrypted
- [P-T-16] Route: Transfer Flow (initiate, accept, decline, cancel)
- [P-T-17] BullMQ Worker: transfer:expire
- [P-T-18] Route: Refund (create, list, approve, reject)
- [P-T-19] BullMQ Worker: refund:process (Midtrans Refund API)
- [P-T-20] Anti-Scalping Middleware
- [P-T-21] Load Test k6 — War Tiket Simulation

### Frontend (Junior Dev + AI Agent)
- [P-T-22] Halaman Checkout
- [P-T-23] Komponen WaitingRoom (Socket.io)
- [P-T-24] Halaman My Tickets
- [P-T-25] Komponen TicketCard
- [P-T-26] Modal Transfer Tiket
- [P-T-27] Modal Ajukan Refund
- [P-T-28] Halaman EO — Tiket & Refund Management
- [P-T-29] Halaman Admin Orders

---

# BACKEND PROMPTS (AI AGENT)

---

## [P-T-01] Setup Prisma Schema — Ticket Module

```
---PROMPT START---
Kamu adalah backend engineer senior. Tugasmu menambahkan model-model untuk modul Ticket Management ke file schema.prisma yang sudah ada.

## Context
- Project: TiketPro — platform tiket konser
- Framework: Fastify + Prisma + PostgreSQL
- File yang dimodifikasi: packages/db/schema.prisma

## Schema yang sudah ada (jangan ubah):
- User, EoProfile, Session, AuditLog (dari modul Auth)
- Event, EventVenue, EventLineup, EventRundown, TicketCategory, EventGenre, EventTag (dari modul Event)

## Tambahkan model-model berikut:

### 1. Order
Fields: id (cuid), userId, eventId, idempotencyKey (unique), status (enum: PENDING/PAID/FULFILLED/REFUNDED/PARTIAL_REFUND/EXPIRED/CANCELLED), totalAmount (Int rupiah), discountAmount (default 0), finalAmount, referralCodeUsed?, affiliateId?, midtransOrderId? (unique), midtransToken?, paymentMethod?, paidAt?, expiredAt, fulfilledAt?, isSuspicious (default false), suspiciousReason?, createdAt, updatedAt
Relations: User, Event, OrderItem[], Ticket[], RefundRequest[]
Index: (userId, status), (eventId, status), (status, expiredAt), midtransOrderId

### 2. OrderItem
Fields: id, orderId, categoryId, quantity, unitPrice (Int), subtotal (Int)
Relations: Order, TicketCategory

### 3. Ticket
Fields: id, orderId, categoryId, userId, ticketCode (unique, format TP-XXXXX-XXXXXX), status (enum: PENDING/ACTIVE/USED/REFUNDED/CANCELLED/TRANSFERRED), holderName, holderEmail?, holderPhone?, holderRole?, isInternal (default false), qrEncrypted? (Text), qrImageUrl?, pdfUrl?, emailSentAt?, waSentAt?, usedAt?, usedGateId?, transferCount (default 0), generatedAt?, createdAt
Relations: Order, TicketCategory, User, ScanLog[], TicketTransfer[]
Index: (userId, status), orderId, ticketCode, (status, categoryId)

### 4. TicketTransfer
Fields: id, ticketId, fromUserId, toUserId, toEmail, message?, status (enum: PENDING/ACCEPTED/DECLINED/EXPIRED), initiatedAt, respondedAt?, expiredAt
Relations: Ticket
Index: ticketId, (toEmail, status)

### 5. RefundRequest
Fields: id, orderId, userId, ticketIds (String[]), reason (Text), refundAmount (Int), refundPercent (Float), status (enum: PENDING_REVIEW/APPROVED/REJECTED/PROCESSING/COMPLETED/FAILED), bankName?, bankAccount?, bankHolder?, adminNote? (Text), processedAt?, midtransRefundId?, createdAt
Relations: Order
Index: orderId, (status, createdAt)

### 6. RefundPolicy
Fields: id, eventId, daysBeforeEvent (Int), refundPercent (Float)
Unique: [eventId, daysBeforeEvent]

### 7. TicketResendLog
Fields: id, ticketId, userId, channel (String), sentAt
Index: (ticketId, sentAt)

## Output yang diharapkan:
- Tambahan di schema.prisma (model + enum + relation)
- Pastikan semua @@relation dan @relation sudah benar dan konsisten 2 arah
- Tambahkan juga relasi balik di model TicketCategory: items OrderItem[], tickets Ticket[]
- Pastikan onDelete: Cascade untuk OrderItem dan Ticket ke Order
- Jangan ubah model yang sudah ada, hanya tambah baru

## Setelah schema selesai, tuliskan juga:
- Command untuk run migration: prisma migrate dev --name add_ticket_module
- Pastikan tidak ada circular dependency di relations
---PROMPT END---
```

---

## [P-T-02] QR Code Library — Encrypt, Decrypt, Sign, Generate Image

```
---PROMPT START---
Kamu adalah backend engineer senior yang ahli di kriptografi. Buat file library untuk QR code tiket yang aman.

## File yang dibuat: apps/api/src/lib/qr.ts

## Requirements:

### Interface QrPayload:
{
  tid: string    // ticketId
  eid: string    // eventId
  cid: string    // categoryId
  uid: string    // userId
  hn:  string    // holderName
  iat: number    // issued at (unix timestamp detik)
  sig: string    // HMAC-SHA256 signature (16 char prefix)
}

### Function yang dibutuhkan:

1. signPayload(payload: Omit<QrPayload, 'sig'>): string
   - HMAC-SHA256 dari JSON.stringify(payload) menggunakan process.env.QR_HMAC_SECRET
   - Return 16 karakter pertama dari hex digest
   - Gunakan crypto built-in Node.js, bukan library eksternal

2. encryptQrPayload(payload: QrPayload): string
   - Enkripsi: AES-256-GCM
   - Key: Buffer.from(process.env.QR_ENCRYPTION_KEY!, 'hex') — 32 bytes
   - IV: crypto.randomBytes(12) — fresh IV setiap enkripsi
   - Format output bytes: iv(12 bytes) + authTag(16 bytes) + ciphertext
   - Return: Buffer.concat([iv, tag, encrypted]).toString('base64url')

3. decryptQrPayload(encoded: string): QrPayload
   - Reverse dari encryptQrPayload
   - Throw AppError('INVALID_QR', 410) jika gagal decrypt
   - Parse JSON hasil decrypt ke QrPayload

4. generateQrImage(encoded: string): Promise<Buffer>
   - Generate QR code PNG dari encoded string
   - Library: npm package 'qrcode'
   - Options: errorCorrectionLevel: 'M', width: 300, margin: 2
   - Color: dark '#000000', light '#FFFFFF'
   - Return Buffer PNG

5. verifyQrSignature(payload: QrPayload): boolean
   - Re-compute signature dari payload (tanpa field sig)
   - Bandingkan dengan payload.sig menggunakan crypto.timingSafeEqual
   - Return true jika valid

## Tech stack:
- Node.js built-in crypto (bukan library external untuk enkripsi)
- npm package 'qrcode' untuk generate image
- TypeScript strict mode
- Semua function harus diekspor

## Error handling:
- Gunakan class AppError yang sudah ada di project (extends Error, punya code dan httpStatus)
- Jika decryptQrPayload gagal: throw new AppError('INVALID_QR', 'QR code tidak valid atau sudah dimodifikasi', 410)

## Unit test (tulis juga di file qr.test.ts):
- Test encrypt → decrypt roundtrip
- Test signature valid
- Test signature invalid (tampered)
- Test decrypt string invalid (throw error)
- Test QR image terbuat dan merupakan Buffer PNG
---PROMPT END---
```

---

## [P-T-03] Ticket Code Generator

```
---PROMPT START---
Buat file: apps/api/src/lib/ticket-code.ts

## Function: generateTicketCode(eventSlug: string): string

Format output: TP-{EVENT_CODE}-{RANDOM}

Rules:
- TP = prefix tetap
- EVENT_CODE = ambil dari eventSlug: hapus semua karakter non-alphanumeric, uppercase, ambil 6 karakter pertama
  - Contoh: "maliq-senandung-jakarta-2025" → "MALIQSE"... ambil 6 → "MALIQ S" → "MALIQSE"... → hapus spasi → "MALIQSE" → 6 char → "MALIQSE"... Sebenarnya: hapus dash, ambil 6 karakter alphanum uppercase → "MALIQSE"... tunggu, mari kita tepat:
  - eventSlug.replace(/-/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6)
  - Jika eventSlug terlalu pendek (< 6 char setelah processing): pad dengan 'X'
- RANDOM = crypto.randomBytes(3).toString('hex').toUpperCase() → 6 karakter hex uppercase

Contoh:
- eventSlug "maliq-senandung-jakarta-2025" → "MALIQSE"... → "MALIQ S" → "MALIQSE" (ambil 6) = "MALIQSE"... sebenarnya: "MALIQSENANDUNGJAK..." ambil 6 → "MALIQ S"... hmm, proses: "maliqsenandungjakarta2025" → uppercase "MALIQSENANDUNGJAKARTA2025" → ambil 6 → "MALIQSE"... tunggu itu 7... ambil 6 → "MALIQ S" — tidak, substring(0,6) → "MALIQ " — tidak ada spasi karena sudah hapus dash. Jadi: "MALIQSENANDUNGJAKARTA2025".substring(0,6) = "MALIQSE"... itu 8... substring(0,6) = "MALIQ" + "S" = 6 karakter = "MALIQSE"... 

Oke, buat saja function ini dengan logika:
1. Remove semua bukan huruf dan angka dari slug
2. Uppercase
3. Ambil 6 karakter pertama, pad dengan 'X' jika kurang
4. Random: crypto.randomBytes(3).toString('hex').toUpperCase() = 6 char

Output contoh: "TP-MALIQ1-A7K3P9"

## Juga buat fungsi: isValidTicketCode(code: string): boolean
- Regex: /^TP-[A-Z0-9]{6}-[A-F0-9]{6}$/
- Return true jika format valid

## Unit test:
- Generate 100 ticket code dari slug yang sama → semua unik
- isValidTicketCode untuk code valid dan invalid
- Edge case: slug sangat pendek (1 karakter)
---PROMPT END---
```

---

## [P-T-04] PDF Generator — Template Default Sistem

```
---PROMPT START---
Kamu adalah backend engineer. Buat PDF generator untuk tiket dengan template default TiketPro.

## File: apps/api/src/lib/pdf-default.ts

## Library yang digunakan:
- pdf-lib (sudah di package.json)
- Semua font menggunakan StandardFonts dari pdf-lib (Helvetica dan Helvetica-Bold)
- Jangan tambah font custom untuk menghindari dependency masalah

## Function: generateDefaultPdf(ticket, order, qrImageBuffer): Promise<Buffer>

## Parameter types (TypeScript):
```typescript
interface TicketForPdf {
  id: string;
  ticketCode: string;
  holderName: string;
  holderEmail?: string;
  isInternal: boolean;
  category: { name: string; colorHex?: string };
  order: {
    id: string;
    event: {
      title: string;
      startDate: Date;
      endDate: Date;
      city: string;
      venue?: { name: string; address: string };
    };
    eo: { companyName: string; logoUrl?: string };
  };
}
```

## Layout yang diharapkan (A4: 595x842 points):

**Header area (y: 780-842):**
- Background: warna navy #1E3A5F, full width
- Teks "TiketPro" kiri, nama perusahaan EO kanan
- Ukuran font 12pt, warna putih

**Event info area (y: 600-780):**
- Nama event: Helvetica-Bold, 20pt, centered, warna navy
- Tanggal: format "Sabtu, 15 Agustus 2025 · 19:00 WIB", 12pt
- Venue: nama venue + kota, 11pt, abu-abu

**Divider garis tipis**

**Ticket info area (y: 400-590):**
- 2 kolom:
  - Kiri: "Kategori:", "Pemegang:", "Order ID:", "Ticket ID:"
  - Kanan: nilai masing-masing (dari ticket data)
- Jika isInternal: tampilkan badge "COMPLIMENTARY" dengan background amber

**QR area (y: 80-380):**
- Kiri (200px): teks instruksi "Tunjukkan tiket ini kepada petugas di pintu masuk"
- Kanan (150x150px di pojok kanan): QR code image dari qrImageBuffer

**Footer (y: 20-80):**
- Garis tipis atas
- Teks: "Tiket ini hanya untuk 1 orang. Jangan bagikan QR code kepada orang lain."
- Ukuran 8pt, abu-abu, centered

## Notes:
- Semua koordinat dalam PDF points (72 points = 1 inch)
- Origin pdf-lib adalah pojok kiri bawah
- Return Buffer dari pdfDoc.save()
- Inject qrImageBuffer sebagai PNG ke PDF menggunakan pdfDoc.embedPng()

## Error handling:
- Jika qrImageBuffer kosong/null: throw error
- Wrap dalam try/catch, log error detail sebelum throw
---PROMPT END---
```

---

## [P-T-05] PDF Generator — Template Custom EO

```
---PROMPT START---
Buat PDF generator untuk tiket dengan template custom yang diupload EO.

## File: apps/api/src/lib/pdf-custom.ts

## Library: pdf-lib

## Konsep:
EO mengupload PDF template kosong dengan area khusus untuk QR code.
Koordinat area QR disimpan di database sebagai JSON di field templateMeta:
{ x: number, y: number, width: number, height: number, page: number }

## Function: generateCustomPdf(ticket, order, qrImageBuffer): Promise<Buffer>

## Parameter:
- ticket: TicketForPdf (sama seperti P-T-04)
- order: OrderForPdf  
- qrImageBuffer: Buffer (PNG image)

## Logic:
1. Download template PDF dari R2 menggunakan `downloadFromR2(ticket.category.templateUrl)`
   - Function downloadFromR2 sudah ada di apps/api/src/lib/r2.ts
2. Load template dengan `PDFDocument.load(templateBytes)`
3. Parse templateMeta dari ticket.category.templateMeta (JSON field)
4. Inject QR image ke halaman dan koordinat yang ditentukan:
   ```
   const pages = pdfDoc.getPages();
   const targetPage = pages[meta.page - 1];  // 1-based page index
   const qrImage = await pdfDoc.embedPng(qrImageBuffer);
   targetPage.drawImage(qrImage, {
     x: meta.x,
     y: meta.y,
     width: meta.width,
     height: meta.height,
   });
   ```
5. Tidak menambah konten lain ke template (EO sudah desain sendiri)
6. Save dan return Buffer

## Error handling:
- Jika templateUrl null/undefined: fallback ke generateDefaultPdf
- Jika templateMeta invalid JSON: fallback ke generateDefaultPdf
- Jika halaman yang ditentukan tidak ada: log warning, gunakan halaman 1
- Semua error harus dilog dengan detail (ticketId, error message)

## Juga buat function: validatePdfTemplate(templateBuffer: Buffer, metaCoordinates: object): Promise<{ valid: boolean, errors: string[] }>
- Check apakah PDF valid (bisa diload pdf-lib)
- Check apakah page yang ditentukan exist
- Check apakah koordinat dalam bounds halaman
- Return validation result — dipakai saat EO upload template
---PROMPT END---
```

---

## [P-T-06] Redis Stock Helper — Atomic DECR/INCR

```
---PROMPT START---
Buat file helper untuk manajemen stok tiket di Redis. Ini adalah komponen KRITIS untuk war tiket.

## File: apps/api/src/lib/redis-stock.ts

## Redis client sudah ada di: apps/api/src/plugins/redis.ts (ioredis client)

## Functions yang dibutuhkan:

### 1. initStock(categoryId: string, quota: number): Promise<void>
- SET tiket_quota:{categoryId} {quota}
- Dipanggil saat event dipublish atau kategori diaktifkan
- Jika key sudah ada: JANGAN overwrite (gunakan SET ... NX)
- Log: "Stock initialized: categoryId={}, quota={}"

### 2. decrStock(categoryId: string, quantity: number): Promise<{ success: boolean, remaining: number }>
- DECRBY tiket_quota:{categoryId} {quantity}
- Jika hasil DECRBY < 0: INCRBY kembali (rollback atomically)
  - Cara atomis: gunakan Lua script di Redis
  - Script Lua:
    ```lua
    local current = redis.call('DECRBY', KEYS[1], ARGV[1])
    if current < 0 then
      redis.call('INCRBY', KEYS[1], ARGV[1])
      return {0, redis.call('GET', KEYS[1])}
    end
    return {1, current}
    ```
  - Return {success: false, remaining: current_stock} jika rollback
  - Return {success: true, remaining: current_after_decr} jika berhasil

### 3. incrStock(categoryId: string, quantity: number): Promise<number>
- INCRBY tiket_quota:{categoryId} {quantity}
- Dipanggil saat order expire atau cancel
- Return nilai stok setelah increment
- Pastikan tidak melebihi quota awal (gunakan GET sebelum INCR dan cap di maxQuota)
  - Untuk ini, simpan juga: SET tiket_quota_max:{categoryId} {quota} saat init
  - Setelah INCR, jika > max: SET kembali ke max dan log warning

### 4. getStock(categoryId: string): Promise<number>
- GET tiket_quota:{categoryId}
- Return number, atau -1 jika key tidak ada

### 5. syncStockFromDb(categoryId: string): Promise<void>
- Query DB: SELECT quota, sold FROM ticket_categories WHERE id = categoryId
- Hitung available = quota - sold
- SET tiket_quota:{categoryId} {available}
- Digunakan untuk recovery atau reconciliation

## Error handling:
- Semua Redis operation wrap dalam try/catch
- Jika Redis tidak available: throw AppError('SERVICE_UNAVAILABLE', 503)
- Log semua error dengan context (categoryId, operation)

## Unit test (tulis di redis-stock.test.ts):
- Mock ioredis
- Test decrStock berhasil
- Test decrStock dengan stok < quantity (rollback)
- Test incrStock
- Test race condition simulation (gunakan Promise.all dengan banyak decrStock)
---PROMPT END---
```

---

## [P-T-07] Virtual Waiting Room — Redis + Socket.io

```
---PROMPT START---
Buat sistem waiting room untuk war tiket menggunakan Redis Sorted Set dan Socket.io.

## Files:
- apps/api/src/lib/waiting-room.ts — business logic
- apps/api/src/socket/waiting-room.socket.ts — Socket.io handler

## Konsep:
Saat traffic tinggi (> threshold), user dimasukkan ke antrian.
Server memproses antrian setiap 500ms dan memberi token checkout ke user yang sudah giliran.

## File 1: apps/api/src/lib/waiting-room.ts

### Config (dari env):
- WAITING_ROOM_THRESHOLD = 100 (req/detik sebelum aktif)
- WAITING_ROOM_BATCH_SIZE = 50 (user diproses per tick)
- WAITING_ROOM_TICK_MS = 500 (interval proses)

### Functions:

1. isWaitingRoomActive(categoryId: string): Promise<boolean>
   - Cek Redis key: waiting_room_active:{categoryId}
   - Return true jika aktif

2. activateWaitingRoom(categoryId: string): Promise<void>
   - SET waiting_room_active:{categoryId} 1 EX 3600 (1 jam)
   - Log audit

3. deactivateWaitingRoom(categoryId: string): Promise<void>
   - DEL waiting_room_active:{categoryId}

4. enqueueUser(categoryId: string, userId: string): Promise<number>
   - ZADD waiting_room:{categoryId} NX {Date.now()} {userId}
   - Return posisi user (ZRANK + 1)

5. getQueuePosition(categoryId: string, userId: string): Promise<number | null>
   - ZRANK waiting_room:{categoryId} {userId}
   - Return rank + 1 (1-based), atau null jika tidak di antrian

6. processQueue(categoryId: string): Promise<string[]>
   - ZRANGE waiting_room:{categoryId} 0 {BATCH_SIZE-1} → ambil user pertama
   - Untuk setiap userId: generate checkoutToken (JWT 10 menit)
   - ZREM waiting_room:{categoryId} ...userIds
   - Return array userId yang sudah diproses

7. generateCheckoutToken(userId: string, categoryId: string): string
   - JWT dengan payload: { userId, categoryId, type: 'CHECKOUT' }
   - Expire: 10 menit
   - Sign dengan JWT_SECRET

8. validateCheckoutToken(token: string): { userId: string, categoryId: string } | null
   - Verify JWT, return payload atau null

## File 2: apps/api/src/socket/waiting-room.socket.ts

### Socket events:

Server → Client:
- 'queue:position' → { position: number, estimatedWaitSeconds: number }
- 'queue:ready' → { checkoutToken: string }  ← user bisa checkout

Client → Server:
- 'queue:join' → { categoryId: string }  ← user ingin masuk antrian
- 'queue:leave' → { categoryId: string } ← user cancel

### Implementation:
- Saat user join: panggil enqueueUser, emit posisi
- Setiap 500ms: jalankan processQueue, emit 'queue:ready' ke user yang giliran
- Gunakan socket.to(userId).emit() untuk kirim ke user spesifik (room berdasarkan userId)
- Estimasi waktu tunggu: (position / BATCH_SIZE) * (TICK_MS / 1000) detik

## Integration:
- Di route POST /api/orders: cek isWaitingRoomActive → jika aktif, cek validateCheckoutToken
  - Jika tidak punya token atau token invalid: return 202 dengan { waitingRoom: true }
  - Jika punya token valid: lanjut proses order normal
---PROMPT END---
```

---

## [P-T-08] Route: POST /api/orders — Full War Tiket Flow

```
---PROMPT START---
Kamu adalah backend engineer senior. Buat route POST /api/orders yang menangani pembelian tiket dengan proteksi war tiket lengkap.

## File: apps/api/src/routes/orders/create.ts

## Dependencies yang sudah ada:
- apps/api/src/lib/redis-stock.ts (decrStock, incrStock)
- apps/api/src/lib/waiting-room.ts (isWaitingRoomActive, validateCheckoutToken)
- apps/api/src/plugins/redis.ts (Redis client)
- apps/api/src/plugins/db.ts (Prisma client)
- Midtrans integrasi: apps/api/src/lib/midtrans.ts (createTransaction) — kamu tidak perlu buat ini, hanya import

## Rate limiting (Fastify rate limit plugin):
- Per user: max 3 request per 30 detik
- Per IP: max 10 request per menit

## Request Schema (Zod):
```typescript
const CreateOrderSchema = z.object({
  categoryId: z.string().cuid(),
  quantity: z.number().int().min(1).max(10),
  holders: z.array(z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })).min(1).max(10),
  referralCode: z.string().optional(),
  idempotencyKey: z.string().uuid(),
});
```

## Alur yang harus diimplementasi (URUT):

1. **Validate request body** dengan Zod schema
2. **Idempotency check**: cek Redis key `idempotency:{key}`, jika ada → return existing order
3. **Cek waiting room**: jika aktif, validasi checkoutToken dari header `X-Checkout-Token`
4. **Load category**: dari DB, include event dan refund policies
5. **Validasi bisnis**:
   - event.status === 'SALE_OPEN'
   - category.status === 'ACTIVE'
   - now >= category.saleStartAt dan now <= category.saleEndAt
   - quantity <= category.maxPerOrder
   - holders.length === quantity (jumlah nama harus sama dengan jumlah tiket)
   - Cek maxPerAccount: query COUNT order PAID dari user ini untuk category ini
6. **Redis DECR stok**: panggil decrStock(categoryId, quantity)
   - Jika {success: false}: throw AppError('TICKET_SOLD_OUT', 409)
7. **Set idempotency key**: SET idempotency:{key} 'processing' EX 3600
8. **Hitung harga**: 
   - basePrice = category.price * quantity
   - Jika ada referralCode: query DB, hitung discount
   - finalAmount = basePrice - discountAmount
9. **Buat Order di DB** (dalam Prisma transaction):
   - Order: status PENDING, expiredAt = now + 15 menit
   - OrderItems: 1 item (categoryId, quantity, unitPrice, subtotal)
   - Tickets: satu record per holder (status PENDING, holderName dari holders array)
   - ticketCode untuk setiap tiket: panggil generateTicketCode(event.slug)
10. **Hit Midtrans**: createTransaction(order) → dapat snap_token dan payment_url
11. **Update Order**: simpan midtransToken dan midtransOrderId
12. **Update idempotency key**: SET idempotency:{key} {orderId} EX 3600
13. **Schedule expire job**: BullMQ add job 'order:expire' dengan delay 15 menit
14. **Log audit**: catat order creation
15. **Return response 201**

## Error handling:
- Jika step 9-13 gagal setelah Redis DECR: pastikan incrStock() dipanggil (rollback stok)
- Gunakan try/finally untuk pastikan rollback
- Jangan pernah leave stok dalam keadaan negatif

## Response 201:
```typescript
{
  orderId: string,
  status: 'PENDING',
  totalAmount: number,
  discountAmount: number,
  finalAmount: number,
  expiredAt: string,  // ISO 8601
  paymentToken: string,
  paymentUrl: string,
  tickets: [{ id, ticketCode, holderName }]
}
```

## Response 409 (idempotency hit):
```typescript
{
  orderId: string,
  status: string,
  paymentToken: string,
}
```
---PROMPT END---
```

---

## [P-T-09] BullMQ Worker: ticket:generate

```
---PROMPT START---
Buat BullMQ worker untuk generate QR code dan PDF tiket setelah order PAID.

## File: apps/api/src/workers/ticket-generate.worker.ts

## Dependencies:
- apps/api/src/lib/qr.ts (encryptQrPayload, generateQrImage, signPayload)
- apps/api/src/lib/pdf-default.ts (generateDefaultPdf)
- apps/api/src/lib/pdf-custom.ts (generateCustomPdf)
- apps/api/src/lib/r2.ts (uploadToR2) — function sudah ada
- apps/api/src/plugins/db.ts (Prisma)

## Job payload: { orderId: string }

## Flow:
1. Load order dari DB dengan include: tickets, event (include venue, eo), items.category
2. Validasi: order.status === 'PAID' (skip jika bukan)
3. Untuk setiap ticket dalam order.tickets (status masih PENDING):
   a. Build QrPayload:
      ```
      const rawPayload = { tid: ticket.id, eid: order.eventId, cid: ticket.categoryId, uid: ticket.userId, hn: ticket.holderName, iat: Math.floor(Date.now() / 1000), sig: '' }
      rawPayload.sig = signPayload(rawPayload)
      const qrEncrypted = encryptQrPayload(rawPayload)
      ```
   b. Generate QR PNG: `const qrBuffer = await generateQrImage(qrEncrypted)`
   c. Upload QR ke R2: `const qrImageUrl = await uploadToR2('qr/' + ticket.id + '.png', qrBuffer, 'image/png')`
   d. Generate PDF:
      - Jika category.templateType === 'custom' && category.templateUrl: generateCustomPdf
      - Else: generateDefaultPdf
   e. Upload PDF ke R2: `const pdfUrl = await uploadToR2('tickets/' + ticket.id + '.pdf', pdfBuffer, 'application/pdf')`
   f. Update ticket di DB:
      ```
      await db.ticket.update({
        where: { id: ticket.id },
        data: { status: 'ACTIVE', qrEncrypted, qrImageUrl, pdfUrl, generatedAt: new Date() }
      })
      ```
4. Update order: status → FULFILLED, fulfilledAt = now
5. Update category.sold: INCREMENT by quantity
6. Trigger next jobs:
   ```
   await ticketEmailQueue.add('send', { orderId }, defaultJobOptions)
   await ticketWaQueue.add('send', { orderId }, defaultJobOptions)
   ```
7. Log: "Tickets generated for order: {orderId}, count: {n}"

## Error handling:
- Jika satu tiket gagal: log error detail, lanjut ke tiket berikutnya (jangan stop semua)
- Jika semua tiket gagal: update order ke status FULFILLMENT_FAILED (tambah enum jika perlu)
- Kirim alert ke admin jika gagal (simple: log ke error monitoring)

## Worker config:
```typescript
const worker = new Worker('ticket:generate', processor, {
  connection: redis,
  concurrency: 5,    // Process 5 job paralel
});
worker.on('failed', (job, err) => { logger.error('ticket:generate failed', { jobId: job?.id, error: err.message }) });
```
---PROMPT END---
```

---

## [P-T-10] BullMQ Worker: ticket:email

```
---PROMPT START---
Buat BullMQ worker untuk kirim email tiket menggunakan Resend.

## File: apps/api/src/workers/ticket-email.worker.ts

## Dependencies:
- Resend SDK (import { Resend } from 'resend')
- React Email templates dari apps/api/src/emails/
- Prisma DB

## Job payload: { orderId: string }

## Flow:
1. Load order dengan tickets (status ACTIVE), event, user (buyer)
2. Kirim 1 email summary ke buyer (user.email):
   - Subject: "🎟️ Tiket {eventTitle} — {orderId}"
   - Template: TicketReadyEmail dengan semua tiket dalam order
   - Attach: PDF semua tiket sebagai attachment (download dari R2 URL, attach sebagai buffer)
3. Untuk setiap tiket yang holderEmail diisi DAN berbeda dari buyer email:
   - Kirim email individual ke holderEmail
   - Subject: "🎟️ Tiket {eventTitle} untuk {holderName}"
   - Template: IndividualTicketEmail
   - Attach: PDF tiket specific holder
4. Update ticket.emailSentAt = now untuk semua tiket yang berhasil dikirim
5. Log: email terkirim ke siapa saja

## Retry config:
- attempts: 3
- backoff: exponential, delay 60000 (1 menit → 2 menit → 4 menit)

## Error handling:
- Jika download PDF dari R2 gagal: kirim email tanpa attachment tapi dengan link download
- Jika Resend error: throw error agar BullMQ retry
- Log semua error dengan detail (orderId, recipientEmail, error)
---PROMPT END---
```

---

## [P-T-11] BullMQ Worker: ticket:whatsapp

```
---PROMPT START---
Buat BullMQ worker untuk kirim tiket via WhatsApp menggunakan Fonnte API.

## File: apps/api/src/workers/ticket-wa.worker.ts

## Fonnte API docs:
- Base URL: https://api.fonnte.com
- Endpoint kirim pesan: POST /send
- Headers: Authorization: {FONNTE_TOKEN}
- Body untuk kirim teks: { target: "628xxx", message: "..." }
- Body untuk kirim file: { target: "628xxx", message: "caption", file: "url_file" }

## Flow:
1. Load order dengan tickets, event, venue, user
2. Format nomor HP ke E.164 (+62...):
   - Jika mulai '08': ganti '0' dengan '+62'
   - Jika mulai '62': tambah '+'
   - Jika mulai '+62': sudah benar
3. Kirim ke buyer phone (jika ada):
   - Kirim pesan teks summary order
   - Include link download PDF (R2 URL)
4. Untuk setiap tiket dengan holderPhone berbeda dari buyer:
   - Kirim pesan individual
   - Format pesan (lihat PRD bagian 3.6.2)
5. Update ticket.waSentAt = now
6. Log hasil pengiriman

## Pesan template (ikuti PRD bagian 3.6.2):
```
🎟️ *Tiket Anda Siap!*

Halo {holderName}! 👋

{eventTitle}
🗓️ {formattedDate}  
📍 {venueName}, {city}
🎫 {categoryName}
👤 {holderName}
🔢 {ticketCode}

Download tiket: {pdfUrl}

_Jangan berikan QR code kepada orang lain._

Sampai jumpa di venue! 🎉
```

## Error handling:
- Jika Fonnte gagal: log error tapi JANGAN throw (WA bukan critical path)
- Retry hanya 2x untuk WA (berbeda dengan email yang 3x)
- Jika nomor tidak valid: skip dan log warning
---PROMPT END---
```

---

## [P-T-12] BullMQ Worker: order:expire

```
---PROMPT START---
Buat BullMQ worker untuk expire order yang tidak dibayar dalam 15 menit.

## File: apps/api/src/workers/order-expire.worker.ts

## Job payload: { orderId: string }
## Job adalah delayed job — di-add saat order dibuat dengan delay 15 menit

## Flow:
1. Load order dari DB
2. Jika order.status !== 'PENDING': stop (sudah dibayar atau di-cancel, tidak perlu expire)
3. Jika order.expiredAt > now: stop (waktu belum habis — seharusnya tidak terjadi tapi jaga-jaga)
4. Untuk setiap OrderItem: panggil incrStock(categoryId, quantity) untuk kembalikan stok
5. Update order.status = 'EXPIRED'
6. Update semua ticket.status = 'CANCELLED' untuk tiket di order ini
7. Log: "Order expired: {orderId}, items: [{categoryId, quantity}]"
8. (Opsional) Kirim email ke user: "Order Anda telah kedaluwarsa"

## Penting:
- Gunakan Prisma transaction untuk step 5 dan 6 (atomis)
- Pastikan incrStock dipanggil SEBELUM update DB (jika DB gagal, Redis sudah di-rollback)
- Jangan throw error di step 1 dan 2 (bukan error, hanya skip)

## Worker config:
- concurrency: 10
- attempts: 1 (tidak perlu retry — jika gagal, order tetap PENDING sampai cron cleanup)
---PROMPT END---
```

---

## [P-T-13] Route: Ticket CRUD (mine, detail, download, resend)

```
---PROMPT START---
Buat routes untuk customer mengakses tiket mereka.

## File: apps/api/src/routes/tickets/index.ts

## Routes yang dibuat:

### 1. GET /api/tickets/mine
Auth: Customer
Query params: status? (ACTIVE/USED/PENDING/EXPIRED), page (default 1), limit (default 20)

Response: paginasi tiket milik user dengan relasi event, category, venue

### 2. GET /api/tickets/:ticketId
Auth: Customer (validasi ownership: ticket.userId === request.user.id)
Response: detail tiket lengkap termasuk qrImageUrl dan pdfUrl
JANGAN return qrEncrypted payload langsung

### 3. GET /api/tickets/:ticketId/download
Auth: Customer (validasi ownership)
Logic:
- Cek tiket.pdfUrl ada
- Jika pdfUrl adalah R2 URL: generate pre-signed URL dengan TTL 1 jam
  - Gunakan fungsi getPresignedUrl dari apps/api/src/lib/r2.ts
- Return redirect 302 ke pre-signed URL
- Catat download event di log

### 4. POST /api/tickets/:ticketId/resend
Auth: Customer (validasi ownership)
Body: { channel: 'email' | 'whatsapp' | 'both' }

Rate limit: cek TicketResendLog — jika sudah 3x dalam 24 jam terakhir:
  throw AppError('RESEND_RATE_LIMIT', 400)

Logic:
- Validasi ticket.status === 'ACTIVE'
- Add job ke queue sesuai channel
- Insert ke TicketResendLog
- Return 200 { message: 'Tiket sedang dikirim ulang' }

## Error codes:
- 403: NOT_TICKET_OWNER
- 404: TICKET_NOT_FOUND
- 400: RESEND_RATE_LIMIT
- 400: TICKET_NOT_ACTIVE (untuk resend)
---PROMPT END---
```

---

## [P-T-14] Route: POST /api/tickets/internal

```
---PROMPT START---
Buat route untuk EO membuat tiket internal/complimentary tanpa payment.

## File: apps/api/src/routes/tickets/internal.ts

## Auth: EO_ADMIN atau EO_STAFF (yang terdaftar sebagai member EO yang memiliki event)

## Request Schema:
```typescript
{
  categoryId: z.string().cuid(),   // Harus isInternal: true
  holders: z.array(z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    role: z.string().optional(),   // "MEDIA", "PANITIA", "ARTIS", dsb
    notes: z.string().optional(),
  })).min(1).max(50),             // Max 50 tiket internal sekaligus
}
```

## Validasi:
1. category.isInternal === true (jika false: throw AppError('INTERNAL_TICKET_WRONG_CATEGORY', 400))
2. Staff adalah member EO yang memiliki event (query eoProfile.userId === staff.eoId)
3. Cek kuota internal tidak melebihi category.quota

## Flow (SYNC, tidak via queue — langsung generate):
1. Buat Order dengan status PAID (no payment)
2. Buat Ticket records dengan isInternal: true
3. Generate QR + PDF untuk setiap tiket (sync call, bukan queue)
4. Kirim ke email/WA jika diisi (async, tidak blocking response)
5. Catat di audit log: staffId, categoryId, count, reason (dari notes)
6. Return semua tiket yang dibuat

## Response 201:
```typescript
{
  tickets: [{
    id, ticketCode, holderName, holderRole?,
    qrImageUrl, pdfUrl, status: 'ACTIVE'
  }]
}
```

## Notes:
- Tiket internal tidak perlu idempotency key (EO bisa buat berulang kali)
- Tidak update Redis stock (stok internal terpisah dari stok publik)
- Badge 'COMPLIMENTARY' harus ada di data tiket untuk gate app
---PROMPT END---
```

---

## [P-T-15] Route: POST /api/tickets/validate/:qrEncrypted

```
---PROMPT START---
Buat route untuk validasi QR code tiket di gate. Ini dipakai oleh Gate App saat scan QR.

## File: apps/api/src/routes/tickets/validate.ts

## Auth: Gate Staff (token khusus gate, bukan JWT biasa)
- Header: Authorization: Bearer {gate_token}
- gate_token adalah JWT yang berisi: { staffId, gateId, eventId }

## URL params: :qrEncrypted (URL-encoded base64url string)

## Flow (implementasi PERSIS seperti di PRD Bagian 6.2):
1. Decrypt QR payload — jika gagal: return { valid: false, reason: 'INVALID_QR' }
2. Verify HMAC signature — jika gagal: return { valid: false, reason: 'TAMPERED_QR' }
3. Cek tiket di DB
4. Cek status tiket (USED, REFUNDED, CANCELLED, bukan ACTIVE)
5. Cek gate access (apakah kategori tiket diizinkan di gate ini)
6. Update ticket.status = 'USED', usedAt, usedGateId
7. Buat ScanLog record
8. Return success response

## Response format:
```typescript
// Success:
{
  valid: true,
  ticket: {
    holderName: string,
    categoryName: string,
    categoryColor?: string,
    isInternal: boolean,
    ticketCode: string,
    eventTitle: string,
  }
}

// Failure:
{
  valid: false,
  reason: 'INVALID_QR' | 'TAMPERED_QR' | 'TICKET_NOT_FOUND' | 'ALREADY_USED' | 'TICKET_REFUNDED' | 'TICKET_CANCELLED' | 'TICKET_INACTIVE' | 'WRONG_GATE',
  detail?: {
    usedAt?: string,     // Untuk ALREADY_USED
    allowedGates?: string[],  // Untuk WRONG_GATE
  }
}
```

## Performance requirements:
- Response time < 100ms (P95)
- Gunakan single DB query dengan join yang tepat
- Index sudah ada di ticket.id — query by primary key

## Notes:
- Route ini dipanggil dari Gate App saat scan — harus sangat cepat dan reliable
- Tidak perlu rate limiting khusus (gate app tidak abuse)
- Log semua scan (valid dan invalid) ke ScanLog table
---PROMPT END---
```

---

## [P-T-16] Route: Transfer Flow

```
---PROMPT START---
Buat routes untuk fitur transfer tiket antar user.

## File: apps/api/src/routes/tickets/transfer.ts

## 4 routes yang dibuat:

### 1. POST /api/tickets/:ticketId/transfer/initiate
Auth: Customer (pemilik tiket)
Body: { recipientEmail: string, message?: string }

Validasi:
- ticket.status === 'ACTIVE'
- ticket.userId === request.user.id
- event.startDate > now (tidak bisa transfer setelah event mulai)
- ticket.transferCount < 3 (max 3x transfer per tiket — configurable)
- Cari user penerima by email: harus ada dan isVerified
- Tidak ada TicketTransfer PENDING untuk tiket ini

Flow:
- Buat TicketTransfer record (status: PENDING, expiredAt: +24 jam)
- Kirim email ke penerima: "Ada tiket untukmu!" dengan link konfirmasi
- Return: { transferId, recipientName, expiredAt }

### 2. POST /api/tickets/transfer/:transferId/accept
Auth: Customer (penerima — user.email === transfer.toEmail)

Flow:
1. Load transfer + ticket + order
2. Invalidate QR lama: update ticket.qrEncrypted = null, qrImageUrl = null, pdfUrl = null
3. Update ticket: userId = request.user.id, holderName = request.user.name, transferCount += 1
4. Generate QR baru (sync):
   - Build payload baru dengan uid baru
   - Encrypt, generate image, upload ke R2
5. Generate PDF baru (sync)
6. Update ticket: status tetap ACTIVE, qrEncrypted baru, pdfUrl baru
7. Update TicketTransfer: status = ACCEPTED, respondedAt = now
8. Kirim tiket baru ke penerima (email + WA jika ada)
9. Kirim notif ke pengirim: "Tiket berhasil ditransfer"

Return: { ticket: { id, ticketCode, qrImageUrl, pdfUrl } }

### 3. POST /api/tickets/transfer/:transferId/decline
Auth: Customer (penerima)

Flow:
- Update TicketTransfer status = DECLINED
- Kirim notif ke pengirim
- Return 200

### 4. DELETE /api/tickets/transfer/:transferId
Auth: Customer (pengirim — transfer.fromUserId === request.user.id)
Constraint: hanya bisa cancel jika status PENDING

Flow:
- Update TicketTransfer status = EXPIRED (gunakan EXPIRED untuk cancel manual juga)
- Return 200

## Notes:
- Semua DB operations untuk accept menggunakan Prisma transaction
- Jika generate QR/PDF gagal di step accept: rollback semua, return 500
---PROMPT END---
```

---

## [P-T-21] Load Test k6 — War Tiket Simulation

```
---PROMPT START---
Buat load test script menggunakan k6 untuk mensimulasikan war tiket.

## File: tests/k6/war-ticket.test.js

## Setup yang dibutuhkan sebelum test:
- 1 event dengan status SALE_OPEN
- 1 TicketCategory dengan quota: 100
- Redis stock sudah di-init: SET tiket_quota:{categoryId} 100
- 500 user akun test sudah ada di DB

## Test scenario:

### Scenario 1: 500 user serentak beli tiket (quota 100)
```javascript
export const options = {
  scenarios: {
    war_tiket: {
      executor: 'constant-arrival-rate',
      rate: 500,        // 500 request per detik
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 600,
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],           // Error rate < 1%
    http_req_duration: ['p(95)<500'],         // 95th percentile < 500ms
    'ticket_sold_out': ['count>0'],           // Harus ada yang kena sold out
  }
};
```

### Metrics yang harus di-track:
- Total request
- Berhasil buat order (HTTP 201)
- Sold out (HTTP 409 TICKET_SOLD_OUT)
- Error lain (HTTP 4xx/5xx selain 409)
- Response time P50, P95, P99

### Verifikasi setelah test:
- Script harus verifikasi bahwa total order PAID tidak melebihi quota (100)
- Cek via API: GET /api/admin/events/{eventId}/dashboard/summary → totalSold <= 100
- Jika totalSold > 100: FAIL test (oversell terjadi)

### Data setup:
- Buat function setup() yang:
  - Login 500 user test dan simpan tokens
  - Reset Redis stock ke 100
  - Return { tokens: [...], categoryId, eventId }

### Request function:
- Setiap VU: pilih token random dari pool
- POST /api/orders dengan body valid
- Record hasilnya

## Output yang diharapkan:
- Summary: X berhasil (201), Y sold out (409), Z error
- Verifikasi anti-oversell: PASS/FAIL
- Screenshot terminal dari k6 output
---PROMPT END---
```

---

# FRONTEND PROMPTS (JUNIOR DEV + AI AGENT)

---

## [P-T-22] Halaman Checkout

```
---PROMPT START---
Buat halaman checkout untuk pembelian tiket.

## File: apps/web/src/app/checkout/[categoryId]/page.tsx

## Tech stack:
- Next.js 14 App Router
- Tailwind CSS + shadcn/ui
- react-hook-form + zod untuk form validation
- TanStack Query untuk data fetching
- Midtrans Snap untuk payment popup

## Data yang perlu di-fetch:
1. Detail kategori tiket: GET /api/events/{eventId}/ticket-categories → filter by categoryId
2. Detail event: GET /api/events/{slug}
3. Stok real-time: GET /api/events/{slug}/ticket-availability (polling 30 detik)

## Layout halaman:

### Section kiri (60%): Form Pembelian
- **Jumlah Tiket**: number input (1 sampai maxPerOrder), default 1
- **Data Pemegang Tiket**: muncul saat quantity > 0
  - Untuk setiap tiket: input Nama (wajib), Email (opsional), WhatsApp (opsional)
  - Expandable accordion per tiket
  - Tiket ke-1 auto-fill dari data user yang login
- **Kode Referral**: input opsional, auto-fill dari URL ?ref=xxx
  - Saat blur: call API untuk validasi kode dan tampilkan discount
- **Summary Order**: tabel nama pemegang, kategori, subtotal per tiket

### Section kanan (40%): Order Summary Card (sticky)
- Nama event + tanggal
- Kategori: {nama} - Rp {harga}
- Quantity: {n} tiket
- Subtotal
- Discount (jika ada referral)
- **Total Bayar** (bold, besar)
- Countdown Timer 15 menit (mulai saat form siap, bukan saat order dibuat)
  - ⚠️ Ini hanya countdown display — order belum dibuat sampai user klik Beli
- Tombol **"Lanjut Bayar"**

### Waiting Room Overlay:
- Jika server return { waitingRoom: true }: tampilkan fullscreen overlay
- Komponen WaitingRoom (diambil dari P-T-23)

## Submit flow:
1. User klik "Lanjut Bayar"
2. Generate idempotencyKey = uuid() (simpan di state, gunakan untuk semua retry)
3. Disable tombol + loading state
4. POST /api/orders
5. Jika 201: dapat paymentToken → buka Midtrans Snap popup
6. Jika 409 (sold out): tampilkan modal "Maaf, tiket habis"
7. Jika 202 (waiting room): tampilkan WaitingRoom overlay
8. Jika 409 (idempotency): ambil orderId dari response → lanjut ke payment

### Midtrans Snap:
```javascript
// Load snap.js di useEffect:
const script = document.createElement('script');
script.src = 'https://app.sandbox.midtrans.com/snap/snap.js'; // atau production
script.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY);
document.head.appendChild(script);

// Buka popup:
window.snap.pay(paymentToken, {
  onSuccess: (result) => router.push('/checkout/success?orderId=' + orderId),
  onPending: (result) => router.push('/my-tickets'),
  onError: (result) => { /* tampilkan error */ },
  onClose: () => { /* user tutup popup, tampilkan pesan */ }
});
```

## Acceptance criteria:
- Form validation realtime (react-hook-form + zod)
- Tombol disabled jika form invalid
- Countdown tampil jelas
- Error dari API tampil di atas tombol
- Mobile responsive
- Loading state saat submit
---PROMPT END---
```

---

## [P-T-24] Halaman My Tickets

```
---PROMPT START---
Buat halaman "My Tickets" untuk customer melihat semua tiket mereka.

## File: apps/web/src/app/my-tickets/page.tsx

## Tech stack: Next.js 14, Tailwind, shadcn/ui, TanStack Query

## Layout:

### Header:
- Judul "Tiket Saya"
- Tab bar: Aktif | Digunakan | Pending Bayar | Semua

### Tab "Aktif":
- Grid 2 kolom (desktop) / 1 kolom (mobile)
- TicketCard per tiket (komponen terpisah — lihat P-T-25)
- Empty state: ilustrasi + "Belum ada tiket aktif. Cari event →"

### Tab "Pending Bayar":
- List order PENDING
- Setiap order: nama event, total, countdown (dari expiredAt), tombol "Selesaikan Bayar"
- Tombol bayar: buka Midtrans Snap dengan token yang tersimpan

### Tab "Semua":
- Tabel dengan filter (status, event, tanggal)
- Kolom: Nama Event, Tanggal, Kategori, Status, Aksi

## Data fetching:
- GET /api/tickets/mine?status=ACTIVE → tab Aktif
- GET /api/orders/mine?status=PENDING → tab Pending
- GET /api/tickets/mine → tab Semua (dengan paginasi)

## Notes:
- Polling tidak diperlukan (halaman ini static, refresh manual)
- Infinite scroll atau load more untuk tab Semua
- Skeleton loading saat fetch pertama
---PROMPT END---
```

---

## [P-T-25] Komponen TicketCard

```
---PROMPT START---
Buat komponen TicketCard yang menampilkan tiket individual.

## File: apps/web/src/components/TicketCard.tsx

## Props:
```typescript
interface TicketCardProps {
  ticket: {
    id: string;
    ticketCode: string;
    status: 'ACTIVE' | 'USED' | 'REFUNDED' | 'CANCELLED' | 'TRANSFERRED';
    holderName: string;
    isInternal: boolean;
    category: { name: string; colorHex?: string };
    event: {
      title: string;
      startDate: string;
      posterUrl?: string;
      venue?: { name: string; city: string };
    };
    pdfUrl?: string;
    qrImageUrl?: string;
    usedAt?: string;
  };
  onDownload?: () => void;
  onResend?: () => void;
  onTransfer?: () => void;
  onRefund?: () => void;
}
```

## Layout TicketCard:

```
┌─────────────────────────────────────────┐
│ [Poster kecil] [Nama Event]             │
│               [Tanggal · Venue, Kota]   │
├─────────────────────────────────────────┤
│ Kategori: [badge warna]                 │
│ Pemegang: Budi Santoso                  │
│ Kode: TP-MALIQ1-A7K3P9    [Status badge]│
│ [COMPLIMENTARY badge jika isInternal]   │
├─────────────────────────────────────────┤
│ [QR Code — blur default]                │
│ [Klik untuk tampilkan QR]              │
├─────────────────────────────────────────┤
│ [Download PDF] [Kirim Ulang] [Transfer] │
└─────────────────────────────────────────┘
```

## Behavior:
- QR code di-blur (CSS filter: blur(8px)) secara default
- Klik QR: toggle blur off + tampilkan full screen modal QR
- Modal QR: QR besar (300x300), tombol download image, close button
- Status badge: ACTIVE=hijau, USED=abu, REFUNDED=merah, CANCELLED=merah

## Actions:
- "Download PDF": hit endpoint download, buka di tab baru
- "Kirim Ulang": buka dialog pilih channel (email/WA/keduanya)
- "Transfer": buka TransferModal (komponen terpisah)
- "Refund": buka RefundModal (komponen terpisah)
- Semua tombol diberi tooltip

## States:
- Jika status USED: disable Transfer + Refund, tampilkan "Digunakan: {tanggal}"
- Jika status REFUNDED: semua aksi disabled, tampilkan "Sudah di-refund"
- Jika isInternal: tidak tampilkan tombol Refund
---PROMPT END---
```

---

## [P-T-26] Modal Transfer Tiket

```
---PROMPT START---
Buat modal untuk transfer tiket ke user lain.

## File: apps/web/src/components/TransferModal.tsx

## Props: { ticketId: string, isOpen: boolean, onClose: () => void, onSuccess: () => void }

## Step 1 — Form Transfer:
- Input email penerima
- Saat blur email: call GET /api/users/check-email?email={email}
  - Jika ada: tampilkan nama user ("Kirim ke: Rina Kusuma")
  - Jika tidak ada: "Email tidak terdaftar di TiketPro"
- Input pesan opsional (textarea, max 200 char)
- Tombol "Kirim Permintaan Transfer"
- Warning: "Tiket tidak bisa dikembalikan setelah transfer dikonfirmasi penerima"

## Step 2 — Konfirmasi:
- Tampilkan summary: kirim ke siapa, nama penerima
- Konfirmasi sekali lagi
- Tombol "Ya, Transfer Sekarang"

## Step 3 — Sukses:
- Tampilkan: "Permintaan transfer dikirim ke {nama penerima}"
- Info: "Penerima punya 24 jam untuk menerima transfer"
- Tombol tutup

## API call:
POST /api/tickets/:ticketId/transfer/initiate
{ recipientEmail, message }

## Error handling:
- Email tidak terdaftar → inline error di field email
- API error → error message di bottom modal
- Loading state saat submit
---PROMPT END---
```

---

Selesai untuk prompt kunci. Total ada 21 backend prompt + 8 frontend prompt = 29 prompt siap pakai.

---

*TiketPro — Prompt Collection: Ticket Management v1.0 · April 2025*
