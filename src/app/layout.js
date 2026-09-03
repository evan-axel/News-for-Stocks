import './globals.css';
import Link from 'next/link';
import { BookMarked, Plus, Radar } from 'lucide-react';

export const metadata = {
  title: 'Thesis Journal',
  description: 'Pre-registered investment theses, falsifiers and value-investing checklists',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-indigo-600" />
              <span className="text-lg font-semibold tracking-tight">Thesis Journal</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/scanner" className="btn-secondary">
                <Radar size={16} />
                Scanner
              </Link>
              <Link href="/thesis/new" className="btn-primary">
                <Plus size={16} />
                New thesis
              </Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
