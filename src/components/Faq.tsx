'use client';

import { Fragment, useMemo, useState } from 'react';
import { Link } from '../lib/router';
import Icon from './Icon';
import './Faq.css';

import { cats, faqItems as all, type Cat } from '../lib/faq';

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
