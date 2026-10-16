import type { Metadata } from 'next';

/** One source of truth for what search engines and AI assistants are told about RecallMap. */
export const SITE = {
  name: 'RecallMap',
  url: (process.env.NEXT_PUBLIC_APP_URL ?? 'https://recallmap.top').replace(/\/$/, ''),
  tagline: 'Make learning something you can prove.',
  title: 'RecallMap: Active Recall Study App with Proof on Arc',
  description: 'Turn your notes into AI flashcards and quizzes, study with spaced repetition, and earn mastery badges anyone can verify on the Arc blockchain.',
  repo: 'https://github.com/nofazechris/recallmap',
  arc: {
    chainId: 5042,
    contract: '0xd14aca8cd7331d4d5d2b91a7a3afd0edef0b7369',
    explorer: 'https://explorer.arc.io',
    sampleTx: '0x6ff7995291baa84a9d22b4120ef68e5a3421571816f957f49973217c9b8fef5a',
  },
} as const;

export const arcContractUrl = `${SITE.arc.explorer}/address/${SITE.arc.contract}`;
export const arcSampleTxUrl = `${SITE.arc.explorer}/tx/${SITE.arc.sampleTx}`;

export const keywords = [
  'RecallMap', 'active recall app', 'spaced repetition', 'AI flashcards', 'study app', 'quiz generator from PDF',
  'verifiable credentials', 'blockchain credentials', 'Arc blockchain', 'Arc mainnet', 'on-chain credentials', 'learning badges', 'concept map',
];

/** Metadata for an indexable content page. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  const url = `${SITE.url}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'article', url, title: `${title} | ${SITE.name}`, description, siteName: SITE.name, images: ['/og.png'] },
    twitter: { card: 'summary_large_image', title: `${title} | ${SITE.name}`, description, images: ['/og.png'] },
  };
}

/** Schema.org graph for a content page: the article itself plus its breadcrumb trail. */
export function articleLd(path: string, headline: string, description: string, type: 'Article' | 'TechArticle' = 'Article') {
  const url = `${SITE.url}${path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': type, '@id': `${url}#article`, headline, description, url, inLanguage: 'en',
        mainEntityOfPage: url,
        author: { '@id': `${SITE.url}/#organization` }, publisher: { '@id': `${SITE.url}/#organization` },
        image: `${SITE.url}/og.png`, dateModified: '2026-10-16',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url },
          { '@type': 'ListItem', position: 2, name: headline, item: url },
        ],
      },
    ],
  };
}

/** Pages that should be crawled and listed in the sitemap. */
export const publicPages: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/how-it-works', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/arc', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/active-recall', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];
