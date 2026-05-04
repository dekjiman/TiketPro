'use client';

import { forwardRef, LabelHTMLAttributes } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`block text-sm font-medium text-slate-700 dark:text-slate-200 ${className}`}
        {...props}
      />
    );
  }
);

Label.displayName = 'Label';