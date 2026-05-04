'use client';

const SNAP_SCRIPT_ID = 'midtrans-snap-script';

function getSnapScriptSrc() {
  return process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
}

function getClientKey() {
  return process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureMidtransSnap(timeoutMs = 10000) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const existingSnap = (window as any).snap;
  if (existingSnap?.pay) return existingSnap;

  let script = document.getElementById(SNAP_SCRIPT_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = SNAP_SCRIPT_ID;
    script.src = getSnapScriptSrc();
    script.async = true;

    const clientKey = getClientKey();
    if (clientKey) {
      script.setAttribute('data-client-key', clientKey);
    }

    document.head.appendChild(script);
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snap = (window as any).snap;
    if (snap?.pay) return snap;
    await sleep(50);
  }

  const snap = (window as any).snap;
  return snap?.pay ? snap : null;
}
