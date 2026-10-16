/** Shared FAQ content: rendered by the landing page and also published as FAQPage structured data. */
export type Cat = 'Getting started' | 'Learning' | 'Privacy' | 'Verification';
export interface Q { cat: Cat; q: string; a: string }

export const cats: Cat[] = ['Getting started', 'Learning', 'Privacy', 'Verification'];

export const faqItems: Q[] = [
  { cat: 'Getting started', q: 'How do I get started?', a: 'Create an account, name a topic, and add some notes or a PDF. Review the study kit it drafts and you’re studying — most people take about a minute.' },
  { cat: 'Getting started', q: 'Do I have to upload anything?', a: 'No. You can start with a blank topic and write your own flashcards. Generating a study kit does need material to be grounded in, so that’s the one thing that asks for an upload.' },
  { cat: 'Getting started', q: 'Can I try it before signing up?', a: 'Yes. The live map above is fully interactive with a few sample cards — nothing is saved. Creating a real account takes under a minute.' },
  { cat: 'Learning', q: 'Where does the content come from?', a: 'From your own material. RecallMap generates cards and questions grounded in what you upload or paste, and you review everything before it’s saved.' },
  { cat: 'Learning', q: 'How does spaced recall work?', a: 'After you flip a card, you rate how it went: Again, Hard, Good or Easy. Hard cards come back sooner and easy ones wait longer, so your reviews go to what you’re actually forgetting.' },
  { cat: 'Learning', q: 'How is mastery decided?', a: 'Across sessions, not from a single tap. Badges such as Topic Master need strong scores on two separate assessments, and real scores are kept apart from XP and streaks.' },
  { cat: 'Privacy', q: 'Are my notes public?', a: 'Never by default. Notes, answers and session details stay private. You choose which topics and milestones appear on your public profile.' },
  { cat: 'Privacy', q: 'What can other people see?', a: 'Only what you switch on: a public profile, topic names with mastery levels, and milestones you choose to share to the community feed. Never the material itself.' },
  { cat: 'Privacy', q: 'Can I delete my data?', a: 'Yes. Settings → Data & account → Delete account erases everything. Your uploaded files are deleted too, and you can export a copy of everything first.' },
  { cat: 'Verification', q: 'What does “verified on Arc” mean?', a: 'A privacy-preserving hash of an achievement is anchored on-chain. Anyone can check it’s genuine without seeing your private data, and a badge only shows as verified after the real check succeeds.' },
  { cat: 'Verification', q: 'What if a credential is changed?', a: 'The hash no longer matches the anchored record, so verification fails. The public verification page re-reads the Arc contract every time, so an edited credential is flagged as not verified.' },
  { cat: 'Verification', q: 'Is any of this a live transaction?', a: 'Yes, when you choose to publish one. A credential is only marked verified after its transaction is confirmed on Arc and the contract’s stored fingerprint matches. You never need a wallet — RecallMap submits it for you.' },
];
