'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SelectContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
  setValue: (value: string) => void;
}

const SelectContext = createContext<SelectContextType>({
  open: false,
  setOpen: () => {},
  value: '',
  setValue: () => {},
});

export function Select({ children, value, onValueChange }: { children: ReactNode; value?: string; onValueChange?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  
  return (
    <SelectContext.Provider value={{ open, setOpen, value: value || '', setValue: onValueChange || (() => {}) }}>
      {children}
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className = '', children }: { className?: string; children?: ReactNode }) {
  const { open, setOpen, value } = useContext(SelectContext);
  
  return (
    <button
      type="button"
      className={`flex items-center justify-between w-full px-3 py-2 border rounded-md bg-white ${className}`}
      onClick={() => setOpen(!open)}
    >
      <span className="text-gray-600">{value || 'Pilih...'}</span>
      <ChevronDown className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useContext(SelectContext);
  return <span>{value || placeholder || 'Pilih...'}</span>;
}

export function SelectContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { open, setOpen, value, setValue } = useContext(SelectContext);
  
  if (!open) return null;
  
  return (
    <div className="absolute top-full left-0 right-0 mt-1 border rounded-md bg-white shadow-lg z-50 overflow-hidden">
      {Array.isArray(children) ? (
        children.map((child, i) => (
          <div
            key={i}
            className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
            onClick={() => {
              setValue((child as any).props?.value || '');
              setOpen(false);
            }}
          >
            {child}
          </div>
        ))
      ) : children}
    </div>
  );
}

export function SelectItem({ value, children, className = '' }: { value: string; children: ReactNode; className?: string }) {
  const { value: selectedValue, setValue, setOpen } = useContext(SelectContext);
  const isSelected = value === selectedValue;
  
  return (
    <div
      className={`px-3 py-2 cursor-pointer flex items-center justify-between ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        setValue(value);
        setOpen(false);
      }}
    >
      {children}
      {isSelected && <Check className="w-4 h-4" />}
    </div>
  );
}