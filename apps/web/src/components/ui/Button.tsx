'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  asChild?: boolean;
}

const variants = {
  primary: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]',
  secondary: 'bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-400',
  outline: 'border border-[var(--border)] text-[var(--text)] bg-[var(--surface)] hover:bg-slate-100 dark:hover:bg-slate-800',
  ghost: 'text-[var(--text)] hover:bg-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-base',
  lg: 'px-6 py-3 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, asChild, className = '', children, disabled, ...props }, ref) => {
    const baseClassName = `
      inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40
      disabled:opacity-50 disabled:cursor-not-allowed
      ${variants[variant]}
      ${sizes[size]}
      ${fullWidth ? 'w-full' : ''}
      ${className}
    `;

    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={baseClassName}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={baseClassName}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
