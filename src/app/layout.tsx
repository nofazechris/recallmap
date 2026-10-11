import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { connection } from 'next/server';
import Providers from '../components/Providers';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';

export const metadata: Metadata = {
  title: 'RecallMap — Learn consistently. Prove your progress.',
  description: 'RecallMap turns your notes into active recall, builds study habits, and keeps a record of progress you can prove.',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { themeColor: '#FBFBF8', width: 'device-width', initialScale: 1 };

/**
 * Rendering is per-request so the Content-Security-Policy nonce (see proxy.ts) can be stamped onto Next.js's own scripts.
 * Static pre-rendering can't carry a per-request nonce.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
