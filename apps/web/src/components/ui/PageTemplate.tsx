'use client';

import { useState, useCallback } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Skeleton } from '@/components/ui';
import { useToast } from '@/components/ui';

interface UseApiCallOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useApiCall<T>(fn: () => Promise<T>, options?: UseApiCallOptions<T>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const execute = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fn();
      options?.onSuccess?.(data);
      return data;
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.error);
      toast.showToast('error', apiError.error);
      options?.onError?.(apiError.error);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fn, options]);

  return { loading, error, execute };
}

interface PageLayoutProps {
  title: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

export function PageLayout({ title, loading, error, onRetry, children }: PageLayoutProps) {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Manrope' }}>
        {title}
      </h1>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center justify-between">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            {onRetry && (
              <button onClick={onRetry} className="text-sm text-[#065F46] hover:underline ml-4">
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
      <div className="h-24 bg-slate-200 rounded animate-pulse" />
      <div className="h-24 bg-slate-200 rounded animate-pulse" />
    </div>
  );
}

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

export function FormSection({ title, children }: FormSectionProps) {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

interface FormActionsProps {
  loading?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  variant?: 'primary' | 'outline' | 'danger';
}

export function FormActions({ 
  loading, 
  onSubmit, 
  submitLabel = 'Simpan',
  onCancel,
  variant = 'primary'
}: FormActionsProps) {
  return (
    <div className="flex gap-3 pt-4">
      <Button
        type={onSubmit ? 'submit' : 'button'}
        onClick={onSubmit}
        loading={loading}
        disabled={loading}
        variant={variant === 'outline' ? 'outline' : variant === 'danger' ? 'danger' : 'primary'}
      >
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}