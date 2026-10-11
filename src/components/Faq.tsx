'use client';

import { Fragment, useMemo, useState } from 'react';
import { Link } from '../lib/router';
import Icon from './Icon';
import './Faq.css';

type Cat = 'Getting started' | 'Learning' | 'Privacy' | 'Verification';
interface Q { cat: Cat; q: string; a: string }

const cats: Cat[] = ['Getting started', 'Learning', 'Privacy', 'Verification'];

const all: Q[] = [
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

const mark = (text: string, q: string) => {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <Fragment>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</Fragment>;
};

export default function Faq() {
  const [cat, setCat] = useState<Cat | 'All'>('All');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(all[0].q);
  const q = query.trim();

  const list = useMemo(() => all.filter((x) => (cat === 'All' || x.cat === cat)
    && (!q || (x.q + ' ' + x.a).toLowerCase().includes(q.toLowerCase()))), [cat, q]);

  return (
    <div className="faq">
      <aside className="faq-side">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions…" aria-label="Search questions" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="x" size={14} stroke={2.6} /></button>}
        </label>

        <div className="cats" role="tablist" aria-label="Question categories">
          {(['All', ...cats] as const).map((c) => {
            const n = c === 'All' ? all.length : all.filter((x) => x.cat === c).length;
            return <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}<em className="tnum">{n}</em></button>;
          })}
        </div>

        <div className="still">
          <b>Still curious?</b>
          <p>The quickest answer is to try it. No account needed for the live map.</p>
          <a href="#demo" className="btn btn-soft btn-sm">Go to the live demo<Icon name="arrow" size={15} stroke={2.5} /></a>
        </div>
      </aside>

      <div className="faq-list" aria-live="polite">
        {list.map((x) => {
          const isOpen = open === x.q || !!q;
          return (
            <div key={x.q} className={`item${isOpen ? ' open' : ''}`}>
              <h3>
                <button aria-expanded={isOpen} onClick={() => setOpen(open === x.q ? null : x.q)}>
                  <span><small>{x.cat}</small>{mark(x.q, q)}</span>
                  <i><Icon name="plus" size={18} /></i>
                </button>
              </h3>
              <div className="panel"><div><p>{mark(x.a, q)}</p></div></div>
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="none">
            <b>No questions match “{q}”.</b>
            <p>Try a shorter word, or see every topic.</p>
            <button className="btn btn-outline btn-sm" onClick={() => { setQuery(''); setCat('All'); }}>Clear filters</button>
            <Link to="/auth?mode=signup" className="btn btn-primary btn-sm">Just try it</Link>
          </div>
        )}
      </div>
    </div>
  );
}
