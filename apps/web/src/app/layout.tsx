import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/ui';
import { QueryProvider } from '@/lib/queryProvider';
import { AuthChecker } from '@/components/AuthChecker';
import Script from 'next/script';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TiketPro - Platform Tiket & Event Management',
  description: 'Platform penjualan tiket konser dan manajemen event',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark')
              } else {
                document.documentElement.classList.remove('dark')
              }
            `,
          }}
        />
        <Script
          id="midtrans-snap-script"
          src={process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === 'true'
            ? 'https://app.midtrans.com/snap/snap.js'
            : 'https://app.sandbox.midtrans.com/snap/snap.js'}
          data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
          strategy="afterInteractive"
        />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased transition-colors">
        <ThemeProvider>
          <ToastProvider>
            <QueryProvider>
              <AuthChecker>
                {children}
              </AuthChecker>
            </QueryProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
