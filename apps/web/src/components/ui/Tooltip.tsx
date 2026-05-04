'use client';

import { createContext, useContext, ReactNode } from 'react';

interface TooltipContextType {
  children: ReactNode;
}

const TooltipContext = createContext<{ children: ReactNode } | null>(null);

export function TooltipProvider({ children }: TooltipContextType) {
  return (
    <TooltipContext.Provider value={{ children }}>
      {children}
    </TooltipContext.Provider>
  );
}

export function Tooltip({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function TooltipTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  return <>{children}</>;
}

export function TooltipContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}