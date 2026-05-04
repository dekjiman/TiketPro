# TiketPro

## Catatan akses kamera (Scanner)

Fitur scanner di `apps/web/src/app/checkin/page.tsx` membutuhkan konteks aman:

- Production: wajib `https://` (kalau dibuka via `http://` di HP, kamera tidak akan muncul).
- Local testing dari HP: gunakan tunnel HTTPS (mis. ngrok/cloudflared) atau jalankan web dengan HTTPS.
