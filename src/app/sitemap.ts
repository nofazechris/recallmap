import type { MetadataRoute } from 'next';
import { SITE, publicPages } from '../lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-10-16');
  return publicPages.map((p) => ({ url: `${SITE.url}${p.path === '/' ? '' : p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
