import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from './Logo';
import './Legal.css';

export const UPDATED = '11 October 2026';
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

/** Shared frame for the Terms and Privacy pages. */
export default function Legal({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="legal-page">
      <header><Logo to="/" size={26} /><nav><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/auth" className="btn btn-outline btn-sm">Sign in</Link></nav></header>
      <main>
        <article>
          <div className="eyebrow">Legal</div>
          <h1 className="h1">{title}</h1>
          <p className="updated">Last updated {UPDATED}</p>
          <p className="lead">{intro}</p>
          {children}
          <section>
            <h2>Contact</h2>
            <p>{contact ? <>Questions about this page, or a request about your data: <a href={`mailto:${contact}`}>{contact}</a>.</> : 'Questions, or a request about your data? Use the contact details on the site you received this app from.'} You can also delete your account and download a copy of your data yourself at any time in Settings → Data &amp; account.</p>
          </section>
        </article>
      </main>
    </div>
  );
}
