'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={`w-4 h-4 rounded border-slate-300 text-[#065F46] focus:ring-[#065F46]/50 ${className}`}
        {...props}
      />
    );
  }
);

Checkbox.displayName = 'Checkbox';