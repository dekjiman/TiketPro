'use client';

import { useState, useEffect } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'register';
}

export function AuthModal({ isOpen, onClose, defaultTab = 'login' }: AuthModalProps) {
  const [tab, setTab] = useState(defaultTab);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6">
          <div className="flex justify-center mb-6">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <button
                onClick={() => setTab('login')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition ${
                  tab === 'login'
                    ? 'bg-white dark:bg-slate-600 text-[#065F46] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Masuk
              </button>
              <button
                onClick={() => setTab('register')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition ${
                  tab === 'register'
                    ? 'bg-white dark:bg-slate-600 text-[#065F46] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Daftar
              </button>
            </div>
          </div>

          {tab === 'login' ? (
            <LoginForm onSuccess={() => onClose()} />
          ) : (
            <RegisterForm onSuccess={() => onClose()} />
          )}
        </div>
      </div>
    </div>
  );
}