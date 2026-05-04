export const API_ERROR_CODES: Record<string, string> = {
  EMAIL_EXISTS: 'Email sudah terdaftar',
  INVALID_OTP: 'Kode OTP tidak valid',
  OTP_EXPIRED: 'Kode OTP sudah kadaluarsa',
  OTP_EXCEEDED: 'Terlalu banyak percobaan. Tunggu sebentar.',
  EMAIL_NOT_VERIFIED: 'Email belum diverifikasi',
  EMAIL_VERIFICATION_REQUIRED: 'Verifikasi email diperlukan',
  INVALID_CREDENTIALS: 'Email atau password salah',
  WRONG_PASSWORD: 'Password salah',
  ACCOUNT_LOCKED: 'Akun terkunci. Coba lagi dalam 30 menit.',
  ACCOUNT_SUSPENDED: 'Akun ditangguhkan',
  INVALID_TOKEN: 'Token tidak valid atau kadaluarsa',
  PASSWORD_REUSED: 'Password tidak boleh sama dengan yang lama',
  WEAK_PASSWORD: 'Password terlalu lemah',
  '2FA_NOT_ENABLED': '2FA belum diaktifkan',
  INVALID_2FA_CODE: 'Kode 2FA tidak valid',
  OAUTH_FAILED: 'Login dengan Google gagal',
  RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar.',
  NETWORK_ERROR: 'Koneksi internet bermasalah',
  SERVER_ERROR: 'Server sibuk. Coba lagi nanti.',
  UNKNOWN_ERROR: 'Terjadi kesalahan. Coba lagi.',
  AUTH_REQUIRED: 'Silakan login terlebih dahulu',
  PERMISSION_DENIED: 'Anda tidak memiliki akses',
  VERIFICATION_ERROR: 'Terjadi kesalahan saat verifikasi',
  LOGIN_ERROR: 'Terjadi kesalahan saat login',
};

export function getLocalizedError(code: string | undefined, fallback?: string): string {
  if (!code) return fallback || API_ERROR_CODES.UNKNOWN_ERROR;
  return API_ERROR_CODES[code] || fallback || code;
}

export function isAuthError(code: string | undefined): boolean {
  if (!code) return false;
  return [
    'AUTH_REQUIRED',
    'INVALID_TOKEN',
    'TOKEN_EXPIRED',
    'PERMISSION_DENIED',
  ].includes(code);
}

export function isRetryableError(code: string | undefined): boolean {
  if (!code) return true;
  return [
    'NETWORK_ERROR',
    'SERVER_ERROR',
    'RATE_LIMITED',
    'OTP_EXCEEDED',
  ].includes(code);
}