import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      <div className="max-w-7xl mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div className="lg:col-span-1">
            <Link href="/">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">TiketPro</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed">
              Platform terpercaya untuk cari event, beli tiket, dan kelola acara dengan mudah.
            </p>
          </div>

          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold mb-4">Explore</h3>
            <ul className="space-y-3">
              <li><Link href="/events" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Cari Event</Link></li>
              <li><Link href="/events?sort=newest" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Event Terbaru</Link></li>
              <li><Link href="/events?sort=popular" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Event Populer</Link></li>
              <li><Link href="/register" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Jadi Event Organizer</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-3">
              <li><Link href="/help" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Bantuan</Link></li>
              <li><Link href="/help/how-to-buy" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Cara Beli Tiket</Link></li>
              <li><Link href="/help/refund" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Refund Policy</Link></li>
              <li><Link href="/contact" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Hubungi Kami</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold mb-4">Legal</h3>
            <ul className="space-y-3">
              <li><Link href="/about" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Tentang Kami</Link></li>
              <li><Link href="/terms" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Syarat & Ketentuan</Link></li>
              <li><Link href="/privacy" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">Kebijakan Privasi</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
          <div className="relative overflow-hidden rounded-2xl border border-emerald-200/70 dark:border-emerald-900/40 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 dark:from-emerald-950/30 dark:via-slate-950 dark:to-cyan-950/20 px-5 py-4 shadow-sm text-center">
            <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl dark:bg-emerald-500/20" />
            <p className="relative mx-auto max-w-4xl text-sm leading-7 text-slate-700 dark:text-slate-200">
              <span className="mr-2 inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                Explore
              </span>
              Cari tiket konser, festival, seminar, workshop, dan berbagai event terbaik di Indonesia.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm">© 2026 TiketPro. All rights reserved.</p>
            <a href="mailto:support@tiketpro.com" className="text-sm hover:text-emerald-600 dark:hover:text-emerald-400">
              support@tiketpro.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
