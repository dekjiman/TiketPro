# Panduan Alur Sistem Pemesanan Tiket (Order Flow Guide)

Dokumen ini adalah referensi sistem bagi AI Agent untuk memahami, memodifikasi, atau melakukan debugging pada fitur **Orders** di aplikasi TiketPro.

## 1. Aturan Bisnis Utama (Core Business Rules)

> [!IMPORTANT]
> **Aturan Kedaluwarsa 15 Menit:**
> Setiap pesanan tiket memiliki waktu tunggu 15 menit untuk dibayar. Jika pembayaran tidak diterima dalam kurun waktu tersebut, pesanan otomatis menjadi `EXPIRED` dan stok tiket dikembalikan (restored).

## 2. Model Database Terkait

Sistem pemesanan melibatkan 3 entitas utama dalam schema Prisma:
1.  **`Order`**: Mencatat transaksi pembayaran.
    *   **Status Order:** `PENDING` (menunggu pembayaran) -> `PAID` (sudah dibayar) -> `FULFILLED` (tiket sudah dibuat) ATAU `EXPIRED`/`CANCELLED` (batal/kedaluwarsa).
2.  **`OrderItem`**: Mencatat rincian kategori tiket dan kuantitas yang dibeli.
3.  **`Ticket`**: Representasi fisik/digital tiket untuk setiap individu.
    *   **Status Ticket:** `PENDING` (ter-booking tapi belum lunas) -> `ACTIVE` (lunas & PDF terbuat) ATAU `CANCELLED` (pesanan gagal/kedaluwarsa).

## 3. Alur Pemesanan (End-to-End Flow)

### Fase A: Checkout & Pembuatan Pesanan
1.  **Validasi Stok:** Pastikan stok tiket di Redis cukup. Gunakan fungsi `atomicDecrStock` untuk mengurangi stok secara aman dari *race condition*.
2.  **Atomicity (Transaksi DB):** Gunakan `prisma.$transaction` untuk membuat `Order`, `OrderItem`, dan `Ticket` secara bersamaan. Tiket yang baru dibuat diberi status `PENDING`.
3.  **Integrasi Payment (Midtrans):** 
    *   Buat transaksi ke API Midtrans.
    *   Ambil `token` dan `redirect_url` untuk dikirimkan ke frontend.
4.  **Penjadwalan Expiry Worker:**
    *   Tambahkan job ke antrean BullMQ `ORDER_EXPIRE`.
    *   Atur opsi `delay: 15 * 60 * 1000` (15 menit).

### Fase B: Penanganan Kedaluwarsa (15 Menit Tidak Dibayar)
Worker `order-expire.worker.ts` akan berjalan secara otomatis setelah 15 menit:
1.  **Pengecekan Status:** Jika `Order` masih berstatus `PENDING` dan waktu `expiredAt` telah terlewati.
2.  **Restorasi Stok:** Kembalikan kuota stok di Redis menggunakan `atomicIncrStock` dan kurangi kolom `sold` pada tabel `TicketCategory`.
3.  **Pembaruan Status DB:**
    *   Ubah status `Order` menjadi `EXPIRED`.
    *   Ubah status `Ticket` yang terkait menjadi `CANCELLED`.

### Fase C: Penanganan Pembayaran Berhasil (Webhook & Polling)
Ketika pengguna berhasil membayar (status dari Midtrans berubah menjadi `settlement` atau `capture`):
1.  **Pembaruan Status Order:** Ubah status `Order` menjadi `PAID`. Waktu pembayaran dicatat di `paidAt`.
2.  **Idempotency & Ticket Revival:**
    *   Jika pembayaran terlambat namun tetap berhasil (misal: masuk di menit ke-16 setelah worker berjalan), ubah kembali status `Ticket` yang tadinya `CANCELLED` menjadi `PENDING`.
3.  **Pemicu Pembuatan Tiket:**
    *   Tambahkan job ke antrean BullMQ `TICKET_GENERATE` untuk membuat PDF.

### Fase D: Pembuatan E-Tiket (Ticket Generation Worker)
Worker `ticket-generate.worker.ts` mengambil tugas dari antrean:
1.  **Generate Aset:** Buat QR Code yang dienkripsi dan template PDF (menggunakan `pdf-lib`).
2.  **Penyimpanan:** Simpan file PDF ke Cloudflare R2 (atau direktori `public` lokal sebagai fallback). Pastikan perhitungan `path` aman untuk dijalankan dari berbagai *working directory*.
3.  **Pembaruan Status Selesai:**
    *   Ubah status `Ticket` menjadi `ACTIVE` dan masukkan link PDF ke kolom `pdfUrl`.
    *   Jika semua tiket dalam pesanan sudah `ACTIVE`, ubah status `Order` menjadi `FULFILLED`.
4.  **Pemicu Notifikasi:** Masukkan job ke antrean `TICKET_WA` untuk mengirimkan tiket via WhatsApp.

## 4. Instruksi untuk AI Agent (Prompt Guidelines)

Jika Anda diminta untuk memodifikasi sistem pesanan, **patuhi aturan berikut:**
*   **Jangan gunakan `status: 'CANCELLED'` untuk pesanan secara sembarangan.** Bedakan antara `EXPIRED` (karena sistem/waktu habis) dan `CANCELLED` (dibatalkan sengaja oleh admin/pengguna).
*   **Selalu gunakan `prisma.$transaction`** ketika memperbarui status pesanan dan tiket bersamaan untuk menghindari data yang inkonsisten.
*   **Selalu sinkronkan stok DB dan Redis.** Jika pesanan kedaluwarsa, stok di Redis harus ditambah dan `sold` di DB harus dikurangi.
*   **Pertimbangkan Lingkungan Lokal (Localhost).** Webhook Midtrans seringkali tidak masuk di `localhost`. Selalu sediakan mekanisme *polling* manual (sinkronisasi dari *frontend* saat halaman sukses dimuat) dengan memanggil API `getTransactionStatus` Midtrans secara langsung.
