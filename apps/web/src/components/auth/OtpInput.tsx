'use client';

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { Button } from '@/components/ui';

interface OtpInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  loading?: boolean;
  error?: string;
  onResend?: () => void;
  resendCooldown?: number;
}

export function OtpInput({ 
  length = 6, 
  onComplete, 
  loading, 
  error,
  onResend,
  resendCooldown = 60 
}: OtpInputProps) {
  const [otp, setOtp] = useState<string[]>(new Array(length).fill(''));
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    const allFilled = otp.every((digit) => digit !== '');
    if (allFilled) {
      onComplete(otp.join(''));
    }
  }, [otp, onComplete]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    const newOtp = [...otp];
    
    for (let i = 0; i < length; i++) {
      newOtp[i] = pastedData[i] || '';
    }
    setOtp(newOtp);
    
    const lastFilledIndex = pastedData.length - 1;
    if (lastFilledIndex < length) {
      inputRefs.current[Math.min(lastFilledIndex, length - 1)]?.focus();
    }
  };

  const handleResend = () => {
    if (cooldown > 0 || !onResend) return;
    onResend();
    setCooldown(resendCooldown);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center gap-2">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={loading}
            className={`
              w-12 h-14 text-center text-xl font-bold rounded-lg border-2 transition-all
              focus:outline-none focus:ring-2 focus:ring-[#065F46]/50 focus:border-[#065F46]
              ${error ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 dark:border-slate-600'}
              ${digit ? 'border-[#065F46] bg-emerald-50 dark:bg-emerald-900/20' : ''}
              bg-white dark:bg-slate-800
            `}
          />
        ))}
      </div>

      {error && (
        <p className="text-center text-sm text-red-500">{error}</p>
      )}

      <div className="text-center">
        {cooldown > 0 ? (
          <p className="text-sm text-slate-500">
            Kirim ulang dalam {cooldown} detik
          </p>
        ) : onResend ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="text-sm text-[#065F46] hover:underline disabled:opacity-50"
          >
            Kirim ulang kode
          </button>
        ) : null}
      </div>
    </div>
  );
}