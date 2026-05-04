import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
      <div className="hidden lg:flex flex-1 bg-[#065F46] items-center justify-center p-16">
        <div className="text-white text-center">
          <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: 'Manrope' }}>
            TiketPro
          </h1>
          <p className="text-xl text-emerald-100" style={{ fontFamily: 'Inter' }}>
            Platform Tiket #1 di Indonesia
          </p>
        </div>
      </div>
    </div>
  );
}