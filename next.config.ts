import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // PGlite (dev-only embedded Postgres) and the PDF/DOCX parsers ship native-ish assets that must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'unpdf', 'mammoth', 'ws'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  poweredByHeader: false,
  async headers() {
    const base = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ];
    // HSTS only makes sense on HTTPS production deployments.
    if (process.env.NODE_ENV === 'production') base.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
    return [{ source: '/:path*', headers: base }];
  },
};

export default config;
