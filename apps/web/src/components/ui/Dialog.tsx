'use client';

import { createContext, useContext, ReactNode, cloneElement, isValidElement } from 'react';
import { X } from 'lucide-react';

interface DialogContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextType>({ open: false, setOpen: () => {} });

export function Dialog({ children, open, onOpenChange }: { children: ReactNode; open: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange || (() => {}) }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen } = useContext(DialogContext);
  if (asChild && isValidElement(children)) {
    const child = children as any;
    return cloneElement(child, {
      ...child.props,
      onClick: (e: any) => {
        child.props?.onClick?.(e);
        setOpen(true);
      },
    });
  }
  return <button type="button" onClick={() => setOpen(true)}>{children}</button>;
}

export function DialogContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { open, setOpen } = useContext(DialogContext);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className={`relative bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-lg shadow-xl max-w-lg w-full mx-4 ${className}`}>
        <button
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => setOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="p-6 pb-0">{children}</div>;
}

export function DialogTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-xl font-semibold text-[var(--text)] ${className}`}>{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--muted)] mt-2">{children}</p>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="p-6 pt-4 flex justify-end gap-2">{children}</div>;
}
