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
  { href: '/map', label: 'Opportunity map', short: 'Map' },
  { href: '/impact', label: 'Reform impact', short: 'Impact' },
  { href: '/compare', label: 'Compare', short: 'Compare' },
];

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between gap-2 px-3 sm:px-5">
            <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" /> BuildReady <span className="text-muted font-normal">PGH</span>
            </Link>
            <nav className="flex items-center gap-0.5 text-sm text-muted sm:gap-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-2.5 py-2 hover:bg-surface2 hover:text-fg sm:px-3 sm:py-1.5"><span className="sm:hidden">{n.short}</span><span className="hidden sm:inline">{n.label}</span></Link>
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
