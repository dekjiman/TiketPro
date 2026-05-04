'use client';

import { forwardRef, LabelHTMLAttributes } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`block text-sm font-medium text-[var(--text)] ${className}`}
        {...props}
      />
    );
  }
);

Label.displayName = 'Label';
