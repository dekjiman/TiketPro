'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionContextType {
  open: string | null;
  setOpen: (value: string | null) => void;
}

const AccordionContext = createContext<AccordionContextType>({
  open: null,
  setOpen: () => {},
});

export function Accordion({ children, defaultOpen }: { children: ReactNode; defaultOpen?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpen || null);
  return (
    <AccordionContext.Provider value={{ open, setOpen }}>
      <div className="divide-y divide-slate-200">{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return <div>{children}</div>;
}

export function AccordionTrigger({
  value,
  children,
  className = '',
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { open, setOpen } = useContext(AccordionContext);
  const isOpen = open === value;

  return (
    <button
      type="button"
      onClick={() => setOpen(isOpen ? null : value)}
      className={`flex w-full items-center justify-between py-4 text-left font-medium text-slate-900 hover:text-[#065F46] transition ${className}`}
    >
      {children}
      <ChevronDown
        className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

export function AccordionContent({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open } = useContext(AccordionContext);
  if (!open) return null;
  return <div className={`pb-4 text-slate-600 ${className}`}>{children}</div>;
}