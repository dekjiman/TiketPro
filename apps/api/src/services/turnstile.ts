import { env } from '../config/env.js';

export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  // If no secret key is provided or it's a testing key, always return true in development
  if (!env.TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY.startsWith('1x00000')) {
    if (env.NODE_ENV === 'development') {
      console.log('[TURNSTILE] Development mode: skipping verification');
      return true;
    }
  }

  try {
    const formData = new FormData();
    formData.append('secret', env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (ip) formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });

    const outcome = await result.json() as any;
    
    if (!outcome.success) {
      console.warn('[TURNSTILE] Verification failed:', outcome['error-codes']);
    }

    return outcome.success;
  } catch (error) {
    console.error('[TURNSTILE] Error during verification:', error);
    return false;
  }
}
