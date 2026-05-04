'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-4 py-3 border rounded-lg 
            focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 focus:outline-none transition
            bg-[var(--surface)]
            text-[var(--text)]
            placeholder:text-[var(--muted)]
            disabled:bg-slate-100 dark:disabled:bg-slate-800
            disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' : 'border-[var(--border)]'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-500 mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
