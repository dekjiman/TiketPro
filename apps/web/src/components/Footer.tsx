import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/">
              <span className="text-2xl font-bold text-white">TiketPro</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed">
              Platform terpercaya untuk cari event, beli tiket, dan kelola acara dengan mudah.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h3 className="text-white font-semibold mb-4">Explore</h3>
            <ul className="space-y-3">
              <li><Link href="/events" className="text-sm hover:text-emerald-400">Cari Event</Link></li>
              <li><Link href="/events?sort=newest" className="text-sm hover:text-emerald-400">Event Terbaru</Link></li>
              <li><Link href="/events?sort=popular" className="text-sm hover:text-emerald-400">Event Populer</Link></li>
              <li><Link href="/register" className="text-sm hover:text-emerald-400">Jadi Event Organizer</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-3">
              <li><Link href="/help" className="text-sm hover:text-emerald-400">Bantuan</Link></li>
              <li><Link href="/help/how-to-buy" className="text-sm hover:text-emerald-400">Cara Beli Tiket</Link></li>
              <li><Link href="/help/refund" className="text-sm hover:text-emerald-400">Refund Policy</Link></li>
              <li><Link href="/contact" className="text-sm hover:text-emerald-400">Hubungi Kami</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold mb-4">Legal</h3>
            <ul className="space-y-3">
              <li><Link href="/about" className="text-sm hover:text-emerald-400">Tentang Kami</Link></li>
              <li><Link href="/terms" className="text-sm hover:text-emerald-400">Syarat & Ketentuan</Link></li>
              <li><Link href="/privacy" className="text-sm hover:text-emerald-400">Kebijakan Privasi</Link></li>
            </ul>
          </div>
        </div>

        {/* SEO Text */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <p className="text-sm text-gray-500">
            Cari tiket konser, festival, seminar, workshop, dan berbagai event terbaik di Indonesia.
          </p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm">© 2026 TiketPro. All rights reserved.</p>
            <a href="mailto:support@tiketpro.com" className="text-sm hover:text-emerald-400">
              support@tiketpro.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}