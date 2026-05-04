'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

type EoEvent = {
  id: string;
  title: string;
};

type Gate = {
  id: string;
  name: string;
};

type ScanResponse =
  | { status: 'VALID'; name: string; category: string; message: string }
  | { status: 'CHECKIN' | 'USED'; message: string }
  | { status: 'INVALID'; message: string };

function canUseBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

function isProbablyInsecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
}

function getCameraErrorMessage(err: any): string {
  if (isProbablyInsecureContext()) {
    return 'Kamera hanya bisa dipakai di HTTPS. Buka aplikasi via https:// (bukan http://) atau pakai domain + SSL.';
  }

  const name = String(err?.name || '').toLowerCase();
  if (name.includes('notallowed') || name.includes('permissiondenied')) {
    return 'Izin kamera ditolak. Aktifkan di Chrome: Site settings → Camera → Allow, lalu refresh halaman.';
  }
  if (name.includes('notfound') || name.includes('devicenotfound')) {
    return 'Kamera tidak ditemukan di perangkat ini.';
  }
  if (name.includes('notreadable') || name.includes('aborterror') || name.includes('trackstart')) {
    return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain yang memakai kamera lalu coba lagi.';
  }
  if (name.includes('overconstrained')) {
    return 'Kamera tidak cocok dengan konfigurasi yang diminta. Coba lagi (akan fallback otomatis).';
  }
  if (name.includes('securityerror')) {
    return 'Akses kamera diblokir karena halaman tidak dianggap aman (HTTPS diperlukan).';
  }

  return err?.message || 'Gagal mengakses kamera';
}

async function playBeep(freq: number, durationMs: number) {
  try {
    // @ts-expect-error web audio
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, durationMs);
  } catch {
  }
}

export default function CheckinScannerPage() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { user, _hasHydrated } = useAuthStore();

  const [events, setEvents] = useState<EoEvent[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedGateId, setSelectedGateId] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualQr, setManualQr] = useState('');

  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaTrackRef = useRef<MediaStreamTrack | null>(null);
  const resetTimerRef = useRef<any>(null);
  const warnedSelectGateRef = useRef(false);

  const detector = useMemo(() => {
    if (!canUseBarcodeDetector()) return null;
    // @ts-expect-error BarcodeDetector is not in TS lib by default
    return new BarcodeDetector({ formats: ['qr_code'] });
  }, []);

  const canAccess = useMemo(() => {
    if (!user) return false;
    return user.role === 'EO_ADMIN' || user.role === 'EO_STAFF' || user.role === 'SUPER_ADMIN';
  }, [user]);

  const cleanupCamera = async () => {
    try {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    } catch {
    }
    try {
      mediaTrackRef.current?.stop();
    } catch {
    }
    try {
      mediaStreamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {
    }
    mediaTrackRef.current = null;
    mediaStreamRef.current = null;
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user) {
      const redirectTo = pathname || '/checkin';
      router.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`);
      return;
    }
    if (!canAccess) {
      toast.showToast('error', 'Access denied');
      router.replace('/dashboard');
    }
  }, [_hasHydrated, user, canAccess, router]);

  useEffect(() => {
    if (!_hasHydrated || !canAccess) return;
    let mounted = true;

    const loadEvents = async () => {
      setLoadingEvents(true);
      try {
        const res = await api.get<{ data: EoEvent[] }>('/api/eo/events?limit=100&page=1');
        if (!mounted) return;
        setEvents(res.data?.data || []);
      } catch (err) {
        if (!mounted) return;
        toast.showToast('error', getApiError(err).error || 'Gagal memuat event');
      } finally {
        if (mounted) setLoadingEvents(false);
      }
    };

    loadEvents();
    return () => {
      mounted = false;
    };
    // Intentionally not depending on `toast` object to avoid ref churn re-running effects.
  }, [_hasHydrated, canAccess]);

  useEffect(() => {
    if (!_hasHydrated || !canAccess) return;
    if (!selectedEventId) {
      setGates([]);
      setSelectedGateId('');
      return;
    }

    let mounted = true;
    const loadGates = async () => {
      try {
        const res = await api.get<{ data: Gate[] }>(`/api/eo/events/${selectedEventId}/gates`);
        if (!mounted) return;
        setGates(res.data?.data || []);
        setSelectedGateId('');
      } catch (err) {
        if (!mounted) return;
        toast.showToast('error', getApiError(err).error || 'Gagal memuat gate');
        setGates([]);
        setSelectedGateId('');
      }
    };

    loadGates();
    return () => {
      mounted = false;
    };
    // Intentionally not depending on `toast` object to avoid ref churn re-running effects.
  }, [_hasHydrated, canAccess, selectedEventId]);

  const startCamera = async () => {
    setCameraError(null);
    setScanError(null);
    await cleanupCamera();
    try {
      if (typeof navigator === 'undefined') return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Browser tidak mendukung akses kamera (getUserMedia).');
        return;
      }
      if (isProbablyInsecureContext()) {
        setCameraError(getCameraErrorMessage({ name: 'SecurityError' }));
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (firstErr: any) {
        if (String(firstErr?.name || '').toLowerCase().includes('overconstrained')) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }

      if (!stream) throw new Error('Gagal mengakses kamera');
      mediaStreamRef.current = stream;
      const track = stream.getVideoTracks()[0] || null;
      mediaTrackRef.current = track;
      try {
        const caps: any = (track as any)?.getCapabilities ? (track as any).getCapabilities() : {};
        setTorchSupported(!!caps?.torch);
      } catch {
        setTorchSupported(false);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError(getCameraErrorMessage(err));
      setCameraActive(false);
    }
  };

  const setTorch = async (on: boolean) => {
    const track = mediaTrackRef.current;
    if (!track) return;
    // Some devices expose torch capability only on https / PWA context
    const caps: any = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
    if (!caps?.torch) return;
    try {
      await (track as any).applyConstraints({ advanced: [{ torch: on }] });
      setTorchOn(on);
    } catch {
    }
  };

  const handleResult = async (res: ScanResponse) => {
    setResult(res);
    setProcessing(false);
    if (res.status === 'VALID') {
      await playBeep(880, 120);
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    } else if (res.status === 'CHECKIN' || res.status === 'USED') {
      await playBeep(420, 140);
      if (navigator.vibrate) navigator.vibrate(60);
    } else {
      await playBeep(220, 180);
      if (navigator.vibrate) navigator.vibrate([90, 50, 90]);
    }

    resetTimerRef.current = setTimeout(() => {
      setResult(null);
    }, 2500);
  };

  const submitScan = async (qr: string) => {
    if (processing) return;
    setProcessing(true);
    setScanError(null);
    try {
      const payload = selectedGateId ? { qr, checkInPointId: selectedGateId } : { qr };
      const res = await api.post<ScanResponse>('/api/checkin/scan', payload);
      await handleResult(res.data);
    } catch (err: any) {
      const apiErr = getApiError(err);
      await handleResult({ status: 'INVALID', message: apiErr.error || 'Tiket tidak valid' });
    }
  };

  useEffect(() => {
    if (!_hasHydrated || !canAccess) return;
    if (scanEnabled) {
      startCamera();
    } else {
      cleanupCamera();
      setScanError(null);
    }
    return () => {
      cleanupCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, canAccess, scanEnabled]);

  useEffect(() => {
    if (!scanEnabled) return;
    if (!detector) return;
    if (!videoRef.current) return;
    if (cameraError) return;

    let stopped = false;
    let lastValue = '';
    warnedSelectGateRef.current = false;
    setScanError(null);
    const tick = async () => {
      if (stopped) return;
      if (processing || result) return;
      const videoEl = videoRef.current;
      if (!videoEl || videoEl.readyState < 2) return;
      try {
        const codes = await detector.detect(videoEl);
        const value = codes?.[0]?.rawValue || '';
        if (value && value !== lastValue) {
          lastValue = value;
          if (selectedGateId) {
            warnedSelectGateRef.current = false;
            submitScan(value);
          } else {
            setManualQr(value);
            warnedSelectGateRef.current = false;
            submitScan(value);
          }
        }
      } catch (err: any) {
        if (!stopped) {
          setScanError(err?.message || 'Gagal mendeteksi QR. Coba dekatkan QR atau tambah pencahayaan.');
        }
      }
    };

    const interval = setInterval(tick, 140);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [scanEnabled, detector, processing, result, cameraError, selectedGateId]);

  if (!_hasHydrated || !user || !canAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--text)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  const showOverlay = !!result;
  const overlay =
    result?.status === 'VALID'
      ? { bg: 'bg-emerald-600', title: 'CHECKIN', subtitle: result.message }
      : result?.status === 'CHECKIN' || result?.status === 'USED'
        ? { bg: 'bg-amber-500', title: 'CHECKIN', subtitle: result.message }
        : result?.status === 'INVALID'
          ? { bg: 'bg-rose-600', title: 'INVALID', subtitle: result.message }
          : null;

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div className="absolute inset-0">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      </div>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/10 to-black/70" />
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[74vw] max-w-[320px] lg:top-1/2 lg:max-w-[380px] aspect-square rounded-[1.5rem] lg:rounded-[2rem] border-[3px] border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[74vw] max-w-[320px] lg:top-1/2 lg:max-w-[380px] aspect-square rounded-[1.5rem] lg:rounded-[2rem] border border-white/20" />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:inset-auto lg:left-6 lg:top-6 lg:bottom-auto lg:w-[440px] lg:p-0">
        <div className="mx-auto w-full max-w-md space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:max-w-none lg:space-y-3 lg:rounded-3xl lg:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold tracking-tight lg:text-lg" style={{ fontFamily: 'Manrope' }}>
                Check-in / QR Scanner
              </div>
              <div className="text-[11px] text-[var(--muted-text)] lg:text-xs">
                {processing ? 'Memvalidasi...' : result ? '-' : 'Siap scan'}
              </div>
            </div>
            <div className="shrink-0 flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-50 lg:text-sm"
                onClick={() => setScanEnabled((enabled) => !enabled)}
              >
                {scanEnabled ? 'Scan OFF' : 'Scan ON'}
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-50 lg:text-sm"
                onClick={() => setTorch(!torchOn)}
                disabled={!cameraActive || !mediaTrackRef.current || !torchSupported}
              >
                {torchOn ? 'Flash ON' : 'Flash OFF'}
              </button>
              {result ? (
                <button
                  type="button"
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] lg:text-sm"
                  onClick={() => {
                    setResult(null);
                    setProcessing(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={loadingEvents}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60 lg:rounded-2xl lg:px-4 lg:py-3"
          >
            <option value="">Pilih event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-[var(--surface)] text-[var(--text)]">
                {ev.title}
              </option>
            ))}
          </select>

          <select
            value={selectedGateId}
            onChange={(e) => setSelectedGateId(e.target.value)}
            disabled={!selectedEventId || gates.length === 0}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60 lg:rounded-2xl lg:px-4 lg:py-3"
          >
            <option value="">
              {!selectedEventId ? 'Gate opsional' : gates.length === 0 ? 'Tanpa gate' : 'Gate opsional'}
            </option>
            {gates.map((g) => (
              <option key={g.id} value={g.id} className="bg-[var(--surface)] text-[var(--text)]">
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {cameraError ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 lg:rounded-2xl lg:p-4">
            <div className="text-sm font-semibold">Kamera tidak tersedia</div>
            <div className="mt-1 text-xs text-[var(--muted-text)]">{cameraError}</div>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => {
                setScanEnabled(true);
                startCamera();
              }}>
                Coba Lagi
              </Button>
            </div>
          </div>
        ) : null}

        {!detector || !!cameraError ? (
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 lg:space-y-3 lg:rounded-2xl lg:p-4">
            <div className="text-sm font-semibold">Mode Manual</div>
            <div className="text-xs text-[var(--muted-text)]">
              {!detector
                ? 'Browser ini belum mendukung scan QR otomatis. Paste isi QR (JSON atau ticketCode) lalu tekan Scan.'
                : 'Kamera tidak bisa dipakai. Paste isi QR (JSON atau ticketCode) lalu tekan Scan.'}
            </div>
            <textarea
              value={manualQr}
              onChange={(e) => setManualQr(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] lg:rounded-2xl lg:px-4 lg:py-3"
              placeholder='Contoh: {"ticketCode":"TCK-123"} atau TCK-123'
            />
            <Button disabled={!manualQr.trim() || processing} loading={processing} onClick={() => submitScan(manualQr)}>
              Scan
            </Button>
          </div>
        ) : (
          <div className="space-y-1 text-xs text-[var(--muted-text)]">
            <div>
              {!scanEnabled
                ? 'Scanner mati. Tekan Scan ON untuk menyalakan kamera.'
                : selectedGateId
                  ? 'Arahkan QR ke dalam frame.'
                  : 'Arahkan QR ke frame. Gate opsional.'}
            </div>
            {scanError ? <div className="text-[11px] text-amber-200/90">{scanError}</div> : null}
          </div>
        )}
        </div>
      </div>

      {showOverlay && overlay ? (
        <div className={`absolute inset-0 z-20 ${overlay.bg}`}>
          <div className="h-full w-full flex items-center justify-center p-6">
            <div className="w-full max-w-md text-center space-y-3">
              <div className="text-4xl font-extrabold tracking-wide">{overlay.title}</div>
              <div className="text-lg font-semibold">{overlay.subtitle}</div>
              {result?.status === 'VALID' ? (
                <div className="pt-2 space-y-1">
                  <div className="text-2xl font-bold">{result.name}</div>
                  <div className="text-base opacity-90">{result.category}</div>
                </div>
              ) : null}
              <div className="text-sm opacity-80 pt-4">Kembali ke scanner otomatis...</div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
