export const validateEmail = (email: string): string | null => {
  if (!email) return 'Email wajib diisi';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return 'Format email tidak valid';
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) return 'Password wajib diisi';
  if (password.length < 8) return 'Password minimal 8 karakter';
  if (!/[A-Z]/.test(password)) return 'Password harus ada huruf besar';
  if (!/[a-z]/.test(password)) return 'Password harus ada huruf kecil';
  if (!/[0-9]/.test(password)) return 'Password harus ada angka';
  return null;
};

export const validateName = (name: string): string | null => {
  if (!name) return 'Nama wajib diisi';
  if (name.length < 3) return 'Nama minimal 3 karakter';
  if (name.length > 100) return 'Nama maksimal 100 karakter';
  if (!/^[a-zA-Z\s']+$/.test(name)) return 'Nama tidak boleh karakter spesial';
  return null;
};

export const validatePhone = (phone: string): string | null => {
  if (!phone) return 'Nomor HP wajib diisi';
  const re = /^(\+62|62|0)[0-9]{9,12}$/;
  const cleaned = phone.replace(/\s/g, '');
  if (!re.test(cleaned)) return 'Format nomor tidak valid (contoh: 08123456789)';
  return null;
};

export const validateConfirmPassword = (password: string, confirm: string): string | null => {
  if (!confirm) return 'Konfirmasi password wajib diisi';
  if (password !== confirm) return 'Konfirmasi password tidak cocok';
  return null;
};

export const getPasswordStrength = (password: string): { score: number; label: string; color: string } => {
  if (!password) return { score: 0, label: '', color: '' };
  
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Lemah', color: 'red' };
  if (score <= 4) return { score, label: 'Sedang', color: 'yellow' };
  return { score, label: 'Kuat', color: 'green' };
};