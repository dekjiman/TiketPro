'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={`w-4 h-4 rounded border-[var(--border)] bg-[var(--surface)] text-emerald-700 dark:text-emerald-400 focus:ring-emerald-500/40 ${className}`}
        {...props}
      />
    );
  }
);

Checkbox.displayName = 'Checkbox';
