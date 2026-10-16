import JsonLd from '../components/JsonLd';
import { faqItems } from '../lib/faq';
import { SITE, arcContractUrl } from '../lib/seo';
import Landing from '../views/Landing';

/** What a search engine or AI assistant should know about the product, in machine-readable form. */
const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization', '@id': `${SITE.url}/#organization`, name: SITE.name, url: SITE.url,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/icon-512.png`, width: 512, height: 512 },
      description: SITE.description, sameAs: [SITE.repo],
    },
    {
      '@type': 'WebSite', '@id': `${SITE.url}/#website`, url: SITE.url, name: SITE.name, description: SITE.description,
      inLanguage: 'en', publisher: { '@id': `${SITE.url}/#organization` },
    },
    {
      '@type': 'SoftwareApplication', '@id': `${SITE.url}/#app`, name: SITE.name, url: SITE.url,
      applicationCategory: 'EducationalApplication', operatingSystem: 'Web', browserRequirements: 'Requires a modern web browser',
      description: 'RecallMap is an active-recall learning platform. It turns your own notes and documents into AI-drafted flashcards and quizzes, schedules reviews with spaced repetition, grades quizzes on the server, and lets you publish earned mastery badges as credentials on the Arc blockchain that anyone can verify.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE.url}/#organization` },
      featureList: [
        'AI flashcards and quiz questions generated from your own PDF, text, Markdown or DOCX files, with source citations',
        'Second-pass AI fact-check of every generated item before you review and approve it',
        'Answer-first flashcard study with spaced repetition scheduling',
        'Server-graded quizzes where answer keys never reach the browser',
        'Concept map showing which topics are strong, due or fading',
        'Mastery badges that require two separate quiz attempts at least 30 minutes apart',
        'Verifiable credentials anchored as hashes on Arc mainnet, with a public verification page',
        'Study circles, challenges and private-by-default public profiles',
      ],
      sameAs: [arcContractUrl],
    },
    {
      '@type': 'FAQPage', '@id': `${SITE.url}/#faq`,
      mainEntity: faqItems.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <JsonLd data={graph} />
      <Landing />
    </>
  );
}
