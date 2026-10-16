import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { connection } from 'next/server';
import Providers from '../components/Providers';
import { SITE, keywords } from '../lib/seo';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: '%s | RecallMap' },
  description: SITE.description,
  applicationName: SITE.name,
  keywords,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  category: 'education',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', url: SITE.url, siteName: SITE.name, locale: 'en_US',
    title: SITE.title, description: SITE.description,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'RecallMap: make learning something you can prove' }],
  },
  twitter: { card: 'summary_large_image', title: SITE.title, description: SITE.description, images: ['/og.png'] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
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
