'use client';

import { Button } from '@/components/ui';

interface ImpersonateBannerProps {
  userName: string;
  onStop: () => void;
}

export function ImpersonateBanner({ userName, onStop }: ImpersonateBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-4">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="font-medium">
        Sedang impersonate sebagai <strong>{userName}</strong>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onStop}
        className="bg-white/20 hover:bg-white/30 text-white border-0"
      >
        Stop
      </Button>
    </div>
  );
}