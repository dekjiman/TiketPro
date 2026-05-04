Tentu, berikut adalah versi Markdown (.md) dari dokumen **PRD User & Auth Management TiketPro v1.0** tersebut:

---

# PRODUCT REQUIREMENTS DOCUMENT
## User & Auth Management
**TiketPro Platform — Siap dikerjakan AI Agent & Junior Developer**
[cite_start]*Versi 1.0 · April 2025 · Status: FINAL — READY TO BUILD* [cite: 1]

### Metadata
| Metadata | Detail |
| :--- | :--- |
| **Dokumen** | [cite_start]PRD — User & Auth Management [cite: 1] |
| **Sistem** | [cite_start]TiketPro — Platform Tiket Konser & Event [cite: 1] |
| **Versi** | [cite_start]1.0 Final [cite: 1] |
| **Author** | [cite_start]Product & Engineering Team [cite: 1] |
| **Status** | [cite_start]READY TO BUILD — Bisa langsung dikerjakan [cite: 1] |
| **Dikerjakan oleh** | [cite_start]AI Agent (logic & backend) + Junior Developer (UI & testing) [cite: 1] |
| **Target selesai** | [cite_start]Fase 0 + Fase 1 = 9 hari kerja [cite: 1] |

---

### 1. Overview & Tujuan
[cite_start]Modul User & Auth Management adalah fondasi dari seluruh platform TiketPro[cite: 1]. Semua fitur lain (beli tiket, affiliate, gate scan, gamifikasi) bergantung pada modul ini. [cite_start]Modul ini harus selesai PERTAMA sebelum modul apapun dikerjakan[cite: 1].

[cite_start]**Mengapa modul ini harus dikerjakan pertama?** [cite: 1]
1. [cite_start]Semua API endpoint lain membutuhkan JWT token dari auth system ini[cite: 1].
2. [cite_start]RBAC (Role-Based Access Control) menentukan siapa bisa akses apa di seluruh sistem[cite: 1].
3. [cite_start]Data user (id, role, referral_code) dipakai oleh semua modul lain[cite: 1].
4. [cite_start]Tanpa auth yang benar, testing modul lain tidak bisa dilakukan dengan benar[cite: 1].

#### 1.1 Scope Modul
| # | Fitur | Deskripsi Singkat | Prioritas |
| :--- | :--- | :--- | :--- |
| 1 | Landing Page | Halaman publik: hero, fitur, cara kerja, CTA daftar/masuk | P0 — Wajib |
| 2 | Registrasi | Daftar akun baru: Customer, EO, Affiliate dengan validasi lengkap | P0 — Wajib |
| 3 | Login / Logout | Login email+password, Google OAuth, remember me, logout semua sesi | P0 — Wajib |
| 4 | Verifikasi Email | OTP 6 digit via email, resend OTP, expiry 15 menit | P0 — Wajib |
| 5 | Lupa Password | Reset via email, token 1 jam, link sekali pakai | P0 — Wajib |
| 6 | Profil User | Edit nama, foto, HP, kota, preferensi notifikasi | P0 — Wajib |
| 7 | Manajemen Sesi | Lihat device aktif, logout sesi tertentu, deteksi login baru | P1 — Penting |
| 8 | Two-Factor Auth | 2FA via TOTP (Google Authenticator), backup codes | P1 — Penting |
| 9 | RBAC System | Role: Super Admin, EO Admin, Staff, Affiliate, Reseller, Customer | P0 — Wajib |
| 10 | Admin User Mgmt | Dashboard admin: list, filter, edit, suspend, ban, impersonate | P1 — Penting |
| 11 | Audit Log | Log semua aksi auth: login, logout, password reset, role change | P1 — Penting |
| 12 | Notifikasi Auth | Email & WA: selamat datang, login baru, reset password | P1 — Penting |
[cite_start][cite: 1]

---

### 2. User Roles & Permission Matrix
#### 2.1 Definisi Roles
| Role | Siapa | Cara Dapat Role | Level Akses |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Tim internal TiketPro | Di-set langsung di database seed | Full — semua fitur tanpa batas |
| **EO Admin** | Event Organizer / Promotor | Daftar sebagai EO, diapprove Super Admin | Kelola event, tiket, laporan, staff |
| **EO Staff** | Karyawan EO | Diundang oleh EO Admin via email | Scan gate, tiket internal, laporan terbatas |
| **Affiliate** | Influencer / Partner | Apply dari dashboard, diapprove EO/Admin | Dashboard komisi, link tracking, withdraw |
| **Reseller** | Mitra distribusi tiket | Apply + perjanjian + diapprove Admin | Beli tiket bulk, kelola stok reseller |
| **Customer** | Penonton / Pembeli | Daftar sendiri (self-register) | Beli tiket, referral, gamifikasi, profil |
[cite_start][cite: 1]

#### 2.2 Permission Matrix Lengkap
| Permission | Super Admin | EO Admin | EO Staff | Affiliate | Reseller | Customer |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Daftar & login akun | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit profil sendiri | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Beli tiket (personal) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ikut undian tiket | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pakai referral code | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Akses gamifikasi & XP | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Buat & publish event | ✓ | ✓ | – | – | – | – |
| CRUD tiket kategori | ✓ | ✓ | – | – | – | – |
| Generate tiket internal | ✓ | ✓ | ✓ | – | – | – |
| Scan gate (QR / RFID) | ✓ | ✓ | ✓ | – | – | – |
| Lihat laporan event | ✓ | ✓ | Terbatas | – | – | – |
| Kelola RFID / booth | ✓ | ✓ | ✓ | – | – | – |
| Dashboard affiliate | ✓ | – | – | ✓ | – | – |
| Withdraw komisi | ✓ | – | – | ✓ | – | – |
| Beli tiket bulk | ✓ | – | – | – | ✓ | – |
| Kelola stok reseller | ✓ | – | – | – | ✓ | – |
| Suspend / ban user | ✓ | – | – | – | – | – |
| Impersonate user | ✓ | – | – | – | – | – |
| Lihat audit log global | ✓ | – | – | – | – | – |
| Approve EO baru | ✓ | – | – | – | – | – |
| Approve affiliate baru | ✓ | ✓ | – | – | – | – |
| Kelola platform config | ✓ | – | – | – | – | – |
[cite_start][cite: 1]

---

### 3. Feature Flow Detail
#### 3.1 Landing Page
Halaman publik yang pertama dilihat user. [cite_start]Tujuan: konversi visitor menjadi registered user atau EO yang membuat event[cite: 1].

**3.1.1 Sections & Konten**
| Section | Konten | CTA | Catatan Dev |
| :--- | :--- | :--- | :--- |
| Navbar | Logo, menu: Events, Cara Kerja, EO, Affiliate \| Login \| Daftar | Login / Daftar | Sticky. Mobile: hamburger menu |
| Hero | Headline: "Beli Tiket Konser, Bebas War". Subheadline. Ilustrasi atau video loop event | Cari Event & Daftar Sekarang | Above the fold, CTA primary & secondary |
| Event Featured | Grid 4-6 event terdekat dari database, sortir by date | Lihat Semua Event | Fetch dari API /events?featured=true |
| Cara Kerja | 3 langkah: Pilih Event → Beli Tiket → Scan Masuk. Icon + teks singkat | – | Static content, no API |
| Statistik | Total event, tiket terjual, kota, pengguna aktif | – | Fetch dari /api/stats/public |
| Untuk EO | Ajakan buat event. Fitur: dashboard, affiliate, laporan real-time | Daftar sebagai EO | Route ke /register?role=eo |
| Testimonial | 3-5 kutipan dari EO / customer nyata | – | Static atau dari CMS |
| Footer | Link: Terms, Privacy, FAQ, Kontak, Sosmed | – | Link ke halaman statis |
[cite_start][cite: 1]

**3.1.2 API yang Dipakai Landing**
```javascript
// Landing Page API calls
GET /api/events?featured=true&limit=6   // Event unggulan
GET /api/events?city={city}&limit=12    // Event berdasarkan kota
GET /api/stats/public                   // Statistik platform

// Response /api/stats/public:
{
  "totalEvents": 248,
  "totalTicketsSold": 184729,
  "totalCities": 18,
  "activeUsers": 12847
}
```
[cite_start][cite: 1]

**3.1.3 Acceptance Criteria Landing**
* [cite_start]Navbar sticky saat scroll, highlight menu aktif[cite: 1].
* [cite_start]Hero section tampil < 1.5 detik (LCP)[cite: 1].
* [cite_start]Halaman mobile-responsive di 375px, 768px, 1280px[cite: 1].
* [cite_start]Featured events terupdate realtime (ISR 5 menit)[cite: 1].
* [cite_start]Semua link CTA mengarah ke halaman yang benar[cite: 1].
* [cite_start]SEO: meta title, description, OG image dinamis terpasang[cite: 1].
* [cite_start]Skor Lighthouse Performance > 85[cite: 1].
* [cite_start]Semua teks bahasa Indonesia, tidak ada placeholder lorem ipsum[cite: 1].

#### 3.2 Registrasi Akun
**3.2.1 Form Fields per Role**
| Field | Customer | EO Admin | Affiliate | Reseller | Tipe Input |
| :--- | :---: | :---: | :---: | :---: | :--- |
| Nama Lengkap | Wajib | Wajib | Wajib | Wajib | text, min 3 kar. |
| Email | Wajib | Wajib | Wajib | Wajib | email, lowercase, unik |
| Password | Wajib | Wajib | Wajib | Wajib | password, min 8 kar. |
| Konfirmasi Password | Wajib | Wajib | Wajib | Wajib | password, harus sama |
| Nomor HP | Wajib | Wajib | Wajib | Wajib | tel, format +62 |
| Nama Perusahaan / EO | – | Wajib | – | Wajib | text |
| Nama Akun Sosmed | – | – | Wajib | – | text, untuk verifikasi |
| Jumlah Follower | – | – | Opsional | – | select: <1K, 1K-10K, dll |
| Kota Operasional | – | Wajib | Opsional | Wajib | select dari list kota |
| Referral Code (jika ada) | Opsional | – | – | – | text, auto-fill dari URL |
| Setuju Terms & Privacy | Wajib | Wajib | Wajib | Wajib | checkbox |
[cite_start][cite: 1]

**3.2.2 Validasi Rules**
| Field | Rule | Pesan Error |
| :--- | :--- | :--- |
| Email | Format valid, lowercase, belum terdaftar di sistem | "Email sudah digunakan" / "Format email tidak valid" |
| Password | Min 8 karakter, harus ada: huruf besar, huruf kecil, angka | "Password minimal 8 karakter dengan huruf besar, kecil, dan angka" |
| Konfirmasi Password | Harus sama persis dengan password | "Konfirmasi password tidak cocok" |
| Nomor HP | Format Indonesia: 08xx atau +628xx, 10-13 digit | "Format nomor tidak valid, contoh: 08123456789" |
| Nama | Min 3 karakter, max 100, tidak boleh karakter spesial | "Nama minimal 3 karakter" |
| Terms | Wajib dicentang | "Anda harus menyetujui syarat & ketentuan" |
| Referral Code | Jika diisi: harus ada di database, belum expired | "Kode referral tidak valid atau sudah expired" |
[cite_start][cite: 1]

**3.2.3 Flow Registrasi**
```javascript
// Registration Flow
// Frontend: POST /api/auth/register
{
  "name": "string",
  "email": "string",
  "password": "string",          // di-hash Argon2 di backend
  "phone": "string?",
  "role": "CUSTOMER" | "EO_ADMIN" | "AFFILIATE" | "RESELLER",
  "referralCode": "string?",
  "eoData": { "companyName": "", "city": "" },
  "affiliateData": { "socialHandle": "", "followerRange": "" }
}

// Response sukses (201):
{
  "message": "Akun berhasil dibuat",
  "userId": "cuid...",
  "requiresVerification": true  // Selalu true untuk email baru
}

// Backend actions setelah register:
// 1. Hash password dengan Argon2id
// 2. Generate referral_code unik
// 3. Insert ke tabel users
// 4. Generate OTP 6 digit, simpan di Redis (TTL 15 menit)
// 5. Queue BullMQ: kirim email verifikasi (template: welcome + OTP)
// 6. Jika ada referral code: catat di referral_pending tabel
// 7. Return 201 (tidak auto-login, harus verifikasi dulu)
```
[cite_start][cite: 1]

**3.2.4 Acceptance Criteria Registrasi**
* [cite_start]Validasi real-time saat user mengetik (debounce 500ms)[cite: 1].
* [cite_start]Cek email duplikat: langsung saat field blur, bukan saat submit[cite: 1].
* [cite_start]Password strength indicator: Lemah / Sedang / Kuat[cite: 1].
* [cite_start]Tombol submit disabled sampai semua validasi passed[cite: 1].
* [cite_start]Loading state pada tombol saat request berlangsung[cite: 1].
* [cite_start]Email verifikasi terkirim dalam < 30 detik[cite: 1].
* [cite_start]Jika EO/Affiliate: tampil pesan "Akun dalam review" setelah daftar[cite: 1].
* [cite_start]Referral code dari URL (?ref=KODE) auto-populated di field[cite: 1].
* [cite_start]Error dari server ditampilkan di atas form (bukan alert browser)[cite: 1].
* [cite_start]Setelah sukses: redirect ke halaman /verify-email dengan instruksi[cite: 1].

#### 3.3 Verifikasi Email (OTP)
**3.3.1 Flow Verifikasi**
1. [cite_start]User masuk halaman `/verify-email` setelah registrasi[cite: 1].
2. [cite_start]Tampil form input 6 kotak OTP (satu digit per kotak)[cite: 1].
3. [cite_start]User input OTP dari email → klik Verifikasi[cite: 1].
4. [cite_start]Backend: cek OTP di Redis, expired? sudah dipakai? [cite: 1]
5. [cite_start]Jika valid: update `user.isVerified = true`, hapus OTP dari Redis[cite: 1].
6. [cite_start]Auto-login: generate JWT + refresh token, set ke cookies HttpOnly[cite: 1].
7. [cite_start]Redirect ke dashboard sesuai role[cite: 1].
8. [cite_start]Jika OTP salah 5x: akun di-lock sementara 30 menit[cite: 1].

**3.3.2 Resend OTP**
* [cite_start]Tombol "Kirim Ulang" muncul setelah countdown 60 detik[cite: 1].
* [cite_start]Maksimal 3x resend per sesi (setelah itu harus tunggu 30 menit)[cite: 1].
* [cite_start]OTP lama langsung invalid saat OTP baru di-generate[cite: 1].
* [cite_start]Log semua resend request untuk audit[cite: 1].

```javascript
// OTP Verification API
POST /api/auth/verify-email
{ "otp": "123456", "email": "user@email.com" }

// Sukses (200):
{
  "accessToken": "eyJ...",      // JWT 15 menit, di HttpOnly cookie
  "refreshToken": "...",         // 7 hari, di HttpOnly cookie
  "user": { "id": "", "name": "", "email": "", "role": "", "isVerified": true }
}

POST /api/auth/resend-otp
{ "email": "user@email.com" }
// 200: { "message": "OTP baru dikirim", "expiresIn": 900 }
// 429: { "error": "Terlalu banyak percobaan, tunggu 30 menit" }
```
[cite_start][cite: 1]

#### 3.4 Login
**3.4.1 Metode Login**
| Metode | Flow | Tersedia Untuk |
| :--- | :--- | :--- |
| **Email + Password** | Input email & password → validasi → JWT → redirect dashboard | Semua role |
| **Google OAuth 2.0** | Klik Google → OAuth consent → callback → upsert user → JWT | Customer (default role) |
| **Magic Link** | Input email → link login dikirim ke email → klik → JWT | Customer (P2) |
[cite_start][cite: 1]

**3.4.2 Login Flow (Email + Password)**
```javascript
// Login API
POST /api/auth/login
{
  "email": "string",
  "password": "string",
  "rememberMe": "boolean"   // true = 30 hari, false = 7 hari
}

// Sukses (200) — set cookies HttpOnly:
{
  "user": { "id": "", "name": "", "email": "", "role": "", "avatar": "", "isVerified": "", "has2FA": "" },
  "redirectTo": "/dashboard"
}

// Backend actions:
// 1. Cek email ada
// 2. Cek isVerified
// 3. Verify password dengan Argon2.verify()
// 4. Jika salah: increment failed_attempts (>= 5 lock 30 mnt)
// 5. Jika 2FA aktif: return requires2FA
// 6. Generate JWT (userId, role, sessionId)
// 7. Generate refresh token, simpan hash ke DB
// 8. Simpan session data (IP, device info)
// 9. Queue login notification jika device baru
```
[cite_start][cite: 1]

**3.4.3 Rate Limiting Login**
| Kondisi | Limit | Aksi Sistem |
| :--- | :--- | :--- |
| Login gagal per akun | 5x dalam 30 menit | Lock akun 30 menit + email peringatan |
| Login gagal per IP | 20x dalam 1 jam | Blokir IP 1 jam, log audit |
| Request login per IP | 30x per menit | HTTP 429 + CAPTCHA Turnstile |
[cite_start][cite: 1]

**3.4.4 Google OAuth Flow**
1. [cite_start]Frontend redirect: `GET /api/auth/google` → Google consent screen[cite: 1].
2. [cite_start]Google callback: `GET /api/auth/google/callback?code=...`[cite: 1].
3. Backend actions:
   - [cite_start]Exchange code → Google access token[cite: 1].
   - [cite_start]Fetch Google profile (email, name, picture)[cite: 1].
   - [cite_start]Cari user by email: [cite: 1]
     - [cite_start]Match: login langsung. [cite: 1]
     - [cite_start]Email beda googleId: link akun (minta konfirmasi)[cite: 1].
     - [cite_start]Tidak ada: buat akun baru (role=CUSTOMER, isVerified=true)[cite: 1].
   - [cite_start]Generate JWT + session dan redirect ke `/dashboard`[cite: 1].

**3.4.5 Acceptance Criteria Login**
* [cite_start]Show/hide password toggle[cite: 1].
* [cite_start]Remember Me: refresh token 30 hari[cite: 1].
* [cite_start]Link "Lupa Password" visible[cite: 1].
* [cite_start]Error spesifik: "Akun tidak ditemukan", "Password salah", "Belum diverifikasi"[cite: 1].
* [cite_start]Redirect ke intended destination setelah login[cite: 1].
* Sudah login? [cite_start]Akses `/login` redirect ke dashboard[cite: 1].
* [cite_start]Google OAuth button dengan icon resmi[cite: 1].

#### 3.5 Two-Factor Authentication (2FA)
**3.5.1 Setup 2FA**
1. [cite_start]Settings → Keamanan → Aktifkan 2FA[cite: 1].
2. [cite_start]Backend generate TOTP secret (otplib)[cite: 1].
3. [cite_start]Tampil QR code untuk app authenticator[cite: 1].
4. [cite_start]User input kode 6 digit untuk konfirmasi[cite: 1].
5. [cite_start]Backend simpan encrypted secret dan aktifkan 2FA[cite: 1].
6. [cite_start]Generate 8 backup codes (tampil sekali, wajib simpan)[cite: 1].

**3.5.2 Login dengan 2FA Aktif**
1. [cite_start]Login email + password berhasil[cite: 1].
2. [cite_start]Backend return `{ requires2FA: true, tempToken: "..." }`[cite: 1].
3. [cite_start]Frontend redirect ke `/auth/2fa`[cite: 1].
4. [cite_start]User input kode authenticator[cite: 1].
5. [cite_start]`POST /api/auth/2fa/verify` dengan tempToken + kode[cite: 1].
6. [cite_start]Jika valid → generate JWT penuh + session[cite: 1].
7. [cite_start]Jika salah 5x → invalidate tempToken, login ulang[cite: 1].

```javascript
// 2FA API Endpoints
POST /api/auth/2fa/setup      // { secret, qrCodeUrl, backupCodes }
POST /api/auth/2fa/activate   // { code }
POST /api/auth/2fa/verify     // { tempToken, code | backupCode }
DELETE /api/auth/2fa          // { password }
```
[cite_start][cite: 1]

#### 3.6 Lupa & Reset Password
**3.6.1 Flow Lengkap**
* **Request Reset**: `POST /api/auth/forgot-password`. [cite_start]Response selalu 200 (tidak reveal email)[cite: 1].
* [cite_start]**Backend**: Generate crypto token (TTL 1 jam), hash & simpan ke DB, kirim email link reset[cite: 1].
* **Reset**: User input password baru. [cite_start]Backend validasi (tidak boleh sama dengan 3 password terakhir), update DB, logout semua sesi, kirim email konfirmasi[cite: 1].

**3.6.2 Acceptance Criteria Reset Password**
* [cite_start]Link reset single-use[cite: 1].
* [cite_start]Link expired setelah 1 jam + error page jelas[cite: 1].
* [cite_start]Password baru != password sebelumnya[cite: 1].
* [cite_start]Semua sesi di-logout paksa setelah reset[cite: 1].
* [cite_start]Email konfirmasi terkirim otomatis[cite: 1].

#### 3.7 Profil & Pengaturan User
**3.7.1 Halaman Profil — Sections**
| Section | Field yang Bisa Diedit | Catatan |
| :--- | :--- | :--- |
| Info Dasar | Nama, foto profil, tgl lahir, kota, bio | Foto max 2MB (JPG/PNG), compress 400x400 |
| Kontak | Nomor HP (re-verify OTP), Email | HP berubah trigger OTP ke nomor baru |
| Keamanan | Ganti password, 2FA, sesi aktif | Ganti password butuh password lama |
| Notifikasi | Toggle: email, WA, push browser | Disimpan di tabel `user_preferences` |
| Referral | Referral code sendiri, statistik | Read only |
| Danger Zone | Hapus akun, export data (GDPR) | Hapus butuh password + email konfirmasi |
[cite_start][cite: 1]

**3.7.2 Upload Foto Profil**
* [cite_start]Backend validasi MIME type & size (max 2MB)[cite: 1].
* [cite_start]Resize dengan Sharp ke 400x400[cite: 1].
* [cite_start]Convert ke WebP, upload ke Cloudflare R2[cite: 1].
* [cite_start]Update DB `avatarUrl` dan invalidate CDN cache[cite: 1].

#### 3.8 Manajemen Sesi & Device
**3.8.1 Database Schema Sessions**
```prisma
model Session {
  id           String   @id @default(cuid())
  userId       String
  tokenHash    String   @unique  // Hash dari refresh token
  deviceName   String?           // "Chrome di Android"
  deviceType   String?           // "mobile" | "desktop"
  browser      String?
  os           String?
  ipAddress    String
  city         String?
  isActive     Boolean  @default(true)
  expiresAt    DateTime
  user         User     @relation(fields: [userId], references: [id])
}
```
[cite_start][cite: 1]

**3.8.2 Fitur Manajemen Sesi**
* [cite_start]Lihat list device login (browser, OS, kota, IP masked)[cite: 1].
* [cite_start]Logout sesi tertentu atau logout semua sesi (kecuali saat ini)[cite: 1].
* [cite_start]Deteksi login baru: kirim email otomatis jika device/IP baru login[cite: 1].
* [cite_start]Token refresh rotation: generate refresh_token baru tiap refresh, deteksi reuse[cite: 1].

---

### 3.9 Admin — User Management Dashboard
#### 3.9.1 Fitur Tabel User
* [cite_start]List user (paginasi 20/hal)[cite: 1].
* [cite_start]Search (nama, email, HP) & Filter (role, status, kota)[cite: 1].
* [cite_start]Bulk action: Suspend / Aktifkan / Verifikasi Email[cite: 1].
* [cite_start]Export CSV hasil filter[cite: 1].

#### 3.9.2 Detail User — Panel Samping
* [cite_start]**Info**: Profil, statistik order, XP, referral[cite: 1].
* [cite_start]**Permission**: Role based + override custom per-user[cite: 1].
* [cite_start]**Aktivitas**: Timeline 30 hari (login, pembelian, dll)[cite: 1].
* [cite_start]**Keamanan**: Risk score, device list, 2FA status, reset 2FA[cite: 1].
* [cite_start]**Catatan**: Log internal admin tentang user[cite: 1].

#### 3.9.3 Aksi Admin per User
* [cite_start]Suspend/Ban (wajib alasan + log audit)[cite: 1].
* [cite_start]Impersonate: login sebagai user (Super Admin only, banner merah, audit log)[cite: 1].
* [cite_start]Logout paksa semua sesi user[cite: 1].
* [cite_start]Soft delete akun (grace period 30 hari)[cite: 1].

#### 3.9.4 Impersonate Flow — Aturan Keamanan
1. [cite_start]Super Admin only + input alasan[cite: 1].
2. [cite_start]Banner merah "Anda sedang login sebagai [User]"[cite: 1].
3. [cite_start]Semua aksi di-log dengan flag `isImpersonated: true`[cite: 1].
4. [cite_start]Dilarang ganti password / hapus akun selama impersonate[cite: 1].
5. [cite_start]Sesi expire dalam 30 menit[cite: 1].

---

### 3.10 Audit Log Auth
| Event | Level | Data yang Disimpan |
| :--- | :--- | :--- |
| Register, Login | INFO | userId, IP, userAgent, city |
| Login Gagal | WARN | email, IP, reason, failCount |
| Password Reset/Change | INFO | userId, IP, timestamp |
| Account Suspend/Ban | WARN/ERROR | targetUserId, adminId, reason |
| Impersonate Start/End | WARN/INFO | adminId, targetUserId, reason |
[cite_start][cite: 1]

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  userId      String?
  actorId     String?           // Penindak (admin jika impersonate)
  event       String            // LOGIN_SUCCESS, dll
  level       String            // INFO | WARN | ERROR
  ipAddress   String
  meta        Json              // Data tambahan
  isImpersonated Boolean @default(false)
  createdAt   DateTime @default(now())
}
```
[cite_start][cite: 1]

---

### 4. Database Schema Lengkap (User Models)
```prisma
model User {
  id              String    @id @default(cuid())
  name            String
  email           String    @unique
  emailNormalized String    @unique
  phone           String?
  passwordHash    String?
  role            UserRole  @default(CUSTOMER)
  status          UserStatus @default(ACTIVE)
  isVerified      Boolean   @default(false)
  avatarUrl       String?
  referralCode    String    @unique
  twoFASecret     String?   // Encrypted AES-256
  twoFAEnabled    Boolean   @default(false)
  backupCodes     String[]  // Hashed
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum UserRole { SUPER_ADMIN EO_ADMIN EO_STAFF AFFILIATE RESELLER CUSTOMER }
enum UserStatus { ACTIVE INACTIVE SUSPENDED BANNED PENDING_APPROVAL }
```
[cite_start][cite: 1]

---

### 5. API Endpoints
#### 5.1 Auth Endpoints
| Method | Endpoint | Auth | Deskripsi |
| :--- | :--- | :--- | :--- |
| POST | /api/auth/register | Public | Daftar user baru |
| POST | /api/auth/login | Public | Login email + password |
| POST | /api/auth/verify-email | Public | Verifikasi OTP email |
| POST | /api/auth/forgot-password| Public | Request link reset password |
| POST | /api/auth/2fa/setup | Auth | Mulai setup 2FA |
[cite_start][cite: 1]

#### 5.2 User / Profile Endpoints
| Method | Endpoint | Auth | Deskripsi |
| :--- | :--- | :--- | :--- |
| GET | /api/users/me | Auth | Ambil profil sendiri |
| PATCH | /api/users/me | Auth | Update data profil |
| POST | /api/users/me/avatar | Auth | Upload foto profil |
| GET | /api/users/me/sessions | Auth | List semua sesi aktif |
[cite_start][cite: 1]

---

### 6. Email & Notifikasi Templates
* [cite_start]**Selamat Datang + OTP**: Nama, OTP 6 digit, masa berlaku 15 menit[cite: 1].
* [cite_start]**Login Baru**: Waktu, device, browser, kota, IP (masked), tombol "Bukan saya"[cite: 1].
* [cite_start]**Reset Password**: Link reset (berlaku 1 jam), peringatan keamanan[cite: 1].
* [cite_start]**Akun Disuspend**: Alasan, durasi, cara banding[cite: 1].

---

### 7. Security Requirements
#### 7.1 Password & Token Security
* [cite_start]**Password hashing**: Argon2id (memCost 65536, timeCost 3)[cite: 1].
* [cite_start]**JWT**: Access token 15 mnt, Refresh token (HttpOnly cookie)[cite: 1].
* [cite_start]**2FA secret**: Di-encrypt dengan AES-256-GCM sebelum masuk database[cite: 1].
* [cite_start]**CORS**: Hanya frontend domain yang diizinkan (tidak ada wildcard)[cite: 1].

#### 7.2 Input Validation
* [cite_start]**Email**: Normalize (lowercase), validasi regex RFC5321[cite: 1].
* [cite_start]**Upload**: Cek MIME type dari magic bytes, max size 2MB[cite: 1].
* [cite_start]**XSS**: Sanitize output HTML, terapkan CSP header[cite: 1].

---

### 9. Definition of Done
* [cite_start]**Backend**: Validasi Zod, Audit Log terpanggil, Rate limit aktif, Unit test Vitest passed[cite: 1].
* [cite_start]**Frontend**: Loading state (skeleton), Error state jelas, Responsive (mobile first), Toast notification[cite: 1].
* [cite_start]**Security Checklist**: No plain password in logs, tokens in HttpOnly cookies, no raw SQL[cite: 1].

---

### 10. Error Response Standard
```json
{
  "error": "Deskripsi error human-readable",
  "code": "ERROR_CODE_ENUM",
  "details": {}
}
```
[cite_start]*Contoh Kode*: `VALIDATION_ERROR`, `INVALID_OTP`, `ACCOUNT_LOCKED`, `RATE_LIMIT_EXCEEDED`[cite: 1].

---

### Lampiran: .env Variables
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/tiketpro_dev"
JWT_SECRET="min-32-karakter-random-secret"
GOOGLE_CLIENT_ID="your-id.apps.googleusercontent.com"
RESEND_API_KEY="re_xxxxxxxx"
R2_PUBLIC_URL="https://assets.tiketpro.id"
TWO_FA_ENCRYPTION_KEY="32-byte-hex-key"
```
[cite_start][cite: 1]

