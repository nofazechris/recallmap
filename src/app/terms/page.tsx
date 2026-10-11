import type { Metadata } from 'next';
import Legal from '../../components/Legal';

export const metadata: Metadata = { title: 'Terms — RecallMap' };

export default function Terms() {
  return (
    <Legal title="Terms of use" intro="These terms are the agreement between you and RecallMap. They are written to be read. By creating an account or using the app you agree to them and to our Privacy page.">
      <section>
        <h2>Your account</h2>
        <p>You must give a real email address and keep your password to yourself. You are responsible for what happens under your account. You must be at least 13 years old (or older where your country requires it).</p>
      </section>
      <section>
        <h2>Your content stays yours</h2>
        <p>You own the material you upload and the cards you create. You give us permission to store it, process it, and send relevant passages to our AI provider, solely to run RecallMap for you. Only upload material you have the right to use. We don’t claim ownership of it and we don’t use it to train models.</p>
      </section>
      <section>
        <h2>AI-generated study content</h2>
        <p>Flashcards and questions are drafted by AI from your own material, then checked by a second automated pass and shown to you for review before anything is saved. AI can still be wrong. Review what you save, especially for anything that matters (exams, safety, health, legal or financial topics). RecallMap is a study aid, not professional advice.</p>
      </section>
      <section>
        <h2>XP, badges and credentials</h2>
        <p>XP and badges are earned from real study activity and have no monetary value; they can’t be bought, sold or transferred. Credentials you choose to publish on the Arc blockchain record a hash of a small payload and can be checked by anyone. Publishing is permanent on the blockchain; we can mark a credential revoked, but we cannot remove it from the chain. We may refuse or revoke credentials obtained by abusing the system.</p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>Don’t break the law, attack or overload the service, probe other people’s data, scrape it, upload malware, or try to farm XP, badges or challenges with automation. Don’t use the community features to harass anyone or to post unlawful content. We may limit or suspend accounts that do.</p>
      </section>
      <section>
        <h2>Availability</h2>
        <p>We work to keep RecallMap running and your data safe, but it is provided “as is”, without guarantees of uninterrupted or error-free service. Features may change. Keep your own copy of anything irreplaceable; you can export your data at any time.</p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>To the extent the law allows, RecallMap is not liable for indirect or consequential losses, or for outcomes from relying on study content. Nothing in these terms limits liability that can’t legally be limited.</p>
      </section>
      <section>
        <h2>Ending things</h2>
        <p>You can delete your account whenever you like in Settings; your data is then permanently deleted as described in the Privacy page. We may suspend or close accounts that break these terms.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If we change these terms in a meaningful way, we’ll update the date above and tell you in the app before it applies to you.</p>
      </section>
    </Legal>
  );
}
