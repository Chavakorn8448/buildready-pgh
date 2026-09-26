import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BuildReady PGH',
  description: 'Source-grounded development feasibility for City of Pittsburgh parcels. Decision support only.',
};

const NAV = [
  { href: '/map', label: 'Opportunity map' },
  { href: '/impact', label: 'Reform impact' },
  { href: '/compare', label: 'Compare' },
];

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-5">
            <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" /> BuildReady <span className="text-muted font-normal">PGH</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm text-muted">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-full px-3 py-1.5 hover:bg-surface2 hover:text-fg">{n.label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="no-print border-t border-line px-5 py-6 text-center text-xs leading-relaxed text-muted">
          Decision support only, not legal, financial, or zoning advice. Zoning determinations come from the City Zoning Administrator or Zoning Board of Adjustment.
        </footer>
      </body>
    </html>
  );
}
