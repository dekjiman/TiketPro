'use client';

import { forwardRef, HTMLAttributes } from 'react';

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`h-px bg-slate-200 ${className}`}
        {...props}
      />
    );
  }
);