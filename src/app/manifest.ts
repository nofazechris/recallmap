import type { MetadataRoute } from 'next';
import { SITE } from '../lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name, short_name: SITE.name, description: SITE.description,
    start_url: '/', display: 'standalone', background_color: '#FBFBF8', theme_color: '#FBFBF8', categories: ['education', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
