import Link from 'next/link';
import JsonLd from '../../components/JsonLd';
import Legal from '../../components/Legal';
import { SITE, articleLd, pageMeta } from '../../lib/seo';

const path = '/how-it-works';
const title = 'How RecallMap works: AI flashcards, spaced repetition and on-chain proof';
const description = 'A full walkthrough of RecallMap: upload your material, get AI-drafted and fact-checked flashcards, study answer-first with spaced repetition, take server-graded quizzes, earn mastery badges and publish verifiable credentials on Arc.';
export const metadata = pageMeta(path, 'How it works: AI flashcards to on-chain proof', 'Upload notes, get fact-checked AI flashcards, study with spaced repetition, take server-graded quizzes and earn badges verifiable on Arc.');

export default function HowItWorks() {
  return (
    <>
      <JsonLd data={articleLd(path, title, description, 'TechArticle')} />
      <Legal eyebrow="Product" title="How RecallMap works" showUpdated={false} showContact={false}
        intro="RecallMap turns your own notes and documents into active-recall practice, tracks what you really know, and lets you prove it. Here is the whole loop, plus how it is built.">
        <section>
          <h2>The learning loop</h2>
          <ol style={{ margin: '10px 0 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li><strong>Add your material.</strong> Upload a PDF, TXT, Markdown or DOCX file (up to 25 MB, text-based documents only) or paste text. Files go straight to private storage over a short-lived signed URL, and the server extracts the text.</li>
            <li><strong>Get a study kit.</strong> An AI drafts flashcards and multiple-choice or true/false quiz questions from your text. Every item must cite the passage it came from and quote evidence that really appears in it.</li>
            <li><strong>Every item is checked twice.</strong> A second, blind AI pass fact-checks each item against your source. Anything that fails is dropped. Nothing is saved until you review, edit and approve it, and you can regenerate any single card.</li>
            <li><strong>Study answer-first.</strong> You type what you remember before the card flips. Retrieval, not recognition, is what builds memory. Then you rate it Again, Hard, Good or Easy.</li>
            <li><strong>Spaced repetition decides what returns.</strong> An SM-2-style scheduler brings hard cards back sooner and easy ones later, so your time goes to what you are about to forget. Daily reminders arrive at 9am your time if cards are due.</li>
            <li><strong>Take quizzes.</strong> Questions are graded on the server. Answer keys never reach your browser, and every result comes with an explanation.</li>
            <li><strong>Earn badges honestly.</strong> Mastery needs repeated proof, not one lucky tap (details below).</li>
            <li><strong>Prove it.</strong> Publish a mastery badge as a credential on the Arc blockchain. Anyone can verify it on a public page. <Link href="/arc">See how the Arc integration works</Link>.</li>
          </ol>
        </section>

        <section>
          <h2>What you can see and do</h2>
          <ul>
            <li><strong>Concept map.</strong> Your topics become a map of concepts showing which are strong, due, learning or unexplored.</li>
            <li><strong>Goals and streaks.</strong> Daily goals, streaks and XP reward real study, with daily caps so they can’t be farmed.</li>
            <li><strong>Community.</strong> Study circles with invite links, challenges, follows, a feed and public profiles. Everything is private until you switch it on.</li>
            <li><strong>Your data.</strong> Export everything or delete your account and files at any time from Settings.</li>
          </ul>
        </section>

        <section>
          <h2>How mastery is decided</h2>
          <table>
            <thead><tr><th>Badge</th><th>What it takes</th></tr></thead>
            <tbody>
              <tr><td>Recall Ready</td><td>Two separate quiz attempts at 80% or higher on a topic</td></tr>
              <tr><td>Topic Master</td><td>Two separate quiz attempts at 90% or higher on a topic</td></tr>
              <tr><td>Rules for both</td><td>At least 3 questions per quiz, and the two attempts at least 30 minutes apart</td></tr>
              <tr><td>XP</td><td>Awarded for real study and for passing quizzes (70% or higher). Scores are kept apart from XP and streaks.</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>How it is built</h2>
          <table>
            <thead><tr><th>Layer</th><th>Technology</th></tr></thead>
            <tbody>
              <tr><td>App</td><td>Next.js 16 (App Router), React 19 and TypeScript</td></tr>
              <tr><td>Database</td><td>Neon serverless Postgres with Drizzle ORM and versioned migrations</td></tr>
              <tr><td>Authentication</td><td>Auth.js with email and password, bcrypt hashing, database-backed rate limits, email verification and password reset</td></tr>
              <tr><td>File storage</td><td>Cloudflare R2 (S3-compatible) with signed direct uploads and downloads</td></tr>
              <tr><td>AI</td><td>OpenAI models with structured JSON output, source-citation checks and a blind second verification pass</td></tr>
              <tr><td>Email</td><td>Resend, for verification, password reset and study reminders</td></tr>
              <tr><td>Blockchain</td><td>Solidity <code>CredentialRegistry</code> on Arc mainnet, accessed with viem</td></tr>
              <tr><td>Background work</td><td>A durable jobs table with retries, swept by a scheduled endpoint, so document processing, AI generation and credential confirmation survive restarts</td></tr>
              <tr><td>Security</td><td>Per-request nonce-based Content-Security-Policy, ownership checks on every resource, structured logs that never contain documents or answers</td></tr>
              <tr><td>Quality</td><td>89 automated tests, including the smart contract running on a real in-process EVM</td></tr>
            </tbody>
          </table>
          <p>RecallMap is open source under the MIT license: <a href={SITE.repo} rel="noopener">{SITE.repo}</a>.</p>
        </section>

        <section>
          <h2>Principles</h2>
          <ul>
            <li><strong>Honest over impressive.</strong> No simulated features and no badge for just showing up. A credential shows as verified only when the blockchain confirms it.</li>
            <li><strong>Private by default.</strong> Your material, answers and progress belong to you.</li>
            <li><strong>The server owns the truth.</strong> Grading, XP and badges are computed on the server and can’t be tampered with in the browser.</li>
          </ul>
        </section>

        <section>
          <h2>Start learning</h2>
          <div className="cta-row">
            <Link href="/auth?mode=signup" className="btn btn-primary">Get started free</Link>
            <Link href="/active-recall" className="btn btn-outline">What is active recall?</Link>
          </div>
        </section>
      </Legal>
    </>
  );
}
