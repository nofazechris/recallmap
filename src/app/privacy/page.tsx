import type { Metadata } from 'next';
import Legal from '../../components/Legal';

export const metadata: Metadata = { title: 'Privacy — RecallMap' };

export default function Privacy() {
  return (
    <Legal title="Privacy" intro="RecallMap exists to help you remember what you study. Your notes and answers are yours: private by default, never sold, and never used to advertise to you. This page explains exactly what we store, who processes it, and how you stay in control.">
      <section>
        <h2>What we store</h2>
        <ul>
          <li><b>Account:</b> your email address, a salted hash of your password (never the password itself), your display name, username, bio and settings.</li>
          <li><b>Your study material:</b> files you upload, the text extracted from them, and the flashcards and quiz questions made from them.</li>
          <li><b>Your learning activity:</b> the answers you type, how you rated your recall, quiz attempts and scores, XP, streaks, badges and goals.</li>
          <li><b>Community activity:</b> circles, challenges and follows you take part in, and milestones you choose to share.</li>
        </ul>
      </section>
      <section>
        <h2>Who processes it for us</h2>
        <table>
          <thead><tr><th>Provider</th><th>What it handles</th></tr></thead>
          <tbody>
            <tr><td>Neon (PostgreSQL)</td><td>Stores your account and learning data.</td></tr>
            <tr><td>Cloudflare R2</td><td>Stores the files you upload, privately. Files are never public; they are only reachable through short-lived signed links.</td></tr>
            <tr><td>OpenAI</td><td>When you ask for a study kit, passages of your uploaded text are sent to OpenAI to draft flashcards and questions, and again to check them. We send only the passages needed and never your answers, email or profile.</td></tr>
            <tr><td>Resend</td><td>Sends account emails (email verification, password reset, optional reminders).</td></tr>
            <tr><td>Arc blockchain</td><td>Only if you choose to publish a credential: a one-way hash of a small payload (badge name, optional topic name, optional public username, date and a random value). No notes, answers, scores or email are ever included. Blockchain records are public and permanent by nature, so a published hash cannot be erased; the underlying data stays deletable on our side.</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>What other people can see</h2>
        <p>Nothing about you is public unless you switch it on. Your profile, topic names and shared milestones are each separate opt-ins in Settings → Privacy. Your notes, uploaded files, typed answers and quiz answers are never shown to anyone else.</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>We use one essential cookie to keep you signed in. We don’t use advertising or cross-site tracking cookies.</p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>We keep your data while your account exists. When you delete a topic, its files, text, cards and history are deleted. When you delete your account, everything tied to it is permanently deleted, including your uploaded files. Short-lived technical logs (which never contain your documents or answers) are kept for troubleshooting.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>You can view and edit your information in the app, download a full copy (Settings → Data &amp; account → Export), and delete your account at any time. Depending on where you live, you may have additional rights to access, correct, restrict or erase your data; contact us and we will help.</p>
      </section>
      <section>
        <h2>Security</h2>
        <p>Data is encrypted in transit. Every request is checked so that you can only reach your own material. Passwords are hashed, uploads are private, and sensitive actions are rate limited. No system is perfectly secure; if something affecting your data goes wrong, we will tell you.</p>
      </section>
      <section>
        <h2>Children</h2>
        <p>RecallMap is not directed at children under 13, and we don’t knowingly collect their information.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If we change how we handle your data in a meaningful way, we will update this page and the date above, and tell you in the app.</p>
      </section>
    </Legal>
  );
}
