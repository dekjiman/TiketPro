'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', variant = 'rectangular', width, height }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-slate-200 dark:bg-slate-700';
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
      <Skeleton height={120} className="mb-4" />
      <Skeleton variant="text" width="60%" height={20} className="mb-2" />
      <Skeleton variant="text" width="80%" height={16} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="30%" height={16} />
            <Skeleton variant="text" width="50%" height={14} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm() {
  return (
    <div className="space-y-4">
      <Skeleton variant="text" width="25%" height={16} />
      <Skeleton height={48} />
      <Skeleton variant="text" width="25%" height={16} />
      <Skeleton height={48} />
      <Skeleton variant="text" width="25%" height={16} />
      <Skeleton height={48} />
      <Skeleton height={48} className="mt-6" />
    </div>
  );
}