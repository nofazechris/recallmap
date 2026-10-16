import type { MetadataRoute } from 'next';
import { SITE } from '../lib/seo';

/** Private, per-user and API routes are kept out of search. The public marketing and guide pages are open to everyone, AI assistants included. */
const PRIVATE = ['/api/', '/app/', '/auth', '/onboarding', '/study/', '/quiz/', '/join/', '/verify/', '/u/'];

const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'Googlebot', 'DuckDuckBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/', disallow: PRIVATE })),
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
