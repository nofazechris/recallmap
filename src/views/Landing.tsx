'use client';

import { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import Faq from '../components/Faq';
import FinalCta from '../components/FinalCta';
import ConceptMap from '../components/ConceptMap';
import LiveDemo from '../components/LiveDemo';
import Walkthrough from '../components/Walkthrough';
import type { ConceptStat } from '../store/selectors';
import { getState } from '../store/store';
import './Landing.css';
import './LandingBold.css';
import './LandingPerf.css';
import './LandingFeatures.css';
import './LandingPolish.css';

const featureMap: ConceptStat[] = [
  { name: 'Vectors', desc: '', cards: 2, due: 0, recall: 94, state: 'mastered' },
  { name: 'Derivatives', desc: '', cards: 2, due: 0, recall: 84, state: 'strong' },
  { name: 'Limits', desc: '', cards: 2, due: 2, recall: 64, state: 'due' },
  { name: 'Proofs', desc: '', cards: 1, due: 0, recall: 61, state: 'learning' },
  { name: 'Series', desc: '', cards: 0, due: 0, recall: 0, state: 'unexplored' },
];

const links: [string, string][] = [
  ['demo', 'Live demo'], ['how', 'How it works'], ['features', 'Features'], ['community', 'Community'], ['verify', 'Verification'], ['faq', 'FAQ'],
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('');
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 12);
      // the last section whose top has passed just under the nav is the one being read
      let cur = '';
      for (const [id] of links) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) cur = id;
      }
      setActive(cur);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu]);

  /** In-page links scroll under our own control: same result everywhere, and it honours reduce-motion. */
  const onAnchor = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]');
    const id = a?.getAttribute('href')?.slice(1);
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    const calm = getState().prefs.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="lp" onClick={onAnchor}>
      {/* ambient aurora — pure gradients, no images */}
      <div className="lp-aurora" aria-hidden="true">
        <i className="blob b1" /><i className="blob b2" /><i className="blob b3" />
        <span className="grid-fade" />
      </div>

      <header className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-inner">
          <Logo to="/" size={30} />
          <nav className="lp-links" aria-label="Sections">
            {links.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>{label}</a>)}
          </nav>
          <div className="lp-nav-cta">
            <Link to="/auth" className="lp-signin">Sign in</Link>
            <Link to="/auth?mode=signup" className="btn btn-primary btn-sm">Get started</Link>
            <button className="lp-burger" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="lp-menu" aria-label={menu ? 'Close menu' : 'Open menu'}>
              <Icon name={menu ? 'x' : 'menu'} size={20} stroke={2.2} />
            </button>
          </div>
        </div>
        {menu && (
          <nav id="lp-menu" className="lp-menu" aria-label="Sections">
            {links.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} onClick={() => setMenu(false)}>{label}</a>)}
          </nav>
        )}
      </header>

      <div className="lp-wrap">
        {/* ───────── HERO: short and centred so the live demo is the first thing you touch ───────── */}
        <section className="lp-hero">
          <div className="lp-hero-copy rise">
            <div className="lp-badge"><span className="dot" />Active recall, made tangible</div>
            <h1>
              Make learning something you can{' '}
              <span className="lp-prove grad-text-anim">
                prove
                <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9 Q50 2 100 7 T198 6" fill="none" stroke="url(#sq)" strokeWidth="4" strokeLinecap="round" /><defs><linearGradient id="sq" x1="0" x2="1"><stop offset="0" stopColor="#6AA6DA" /><stop offset="1" stopColor="#9bb36a" /></linearGradient></defs></svg>
              </span>
              .
            </h1>
            <p className="lead">Reading is only the beginning — remembering is the work. Turn your notes into a map you can see, strengthen, and prove. Try it below: no sign-up needed.</p>
            <div className="lp-ctas">
              <Link to="/auth?mode=signup" className="btn btn-primary btn-lg">Start learning<Icon name="arrow" size={18} stroke={2.5} /></Link>
              <a href="#demo" className="btn btn-ghost btn-lg">Try the live map</a>
            </div>
          </div>
        </section>

        {/* ───────── LIVE MAP DEMO ───────── */}
        <section className="lp-demo-sec rise" id="demo" style={{ animationDelay: '.1s' }} aria-label="Interactive learning map demo">
          <LiveDemo />
          <ul className="lp-trust">
            <li>Verifiable on Arc</li><li>AI study kits</li><li>Spaced recall</li>
          </ul>
        </section>

        {/* feature strip */}
        <div className="lp-strip" aria-hidden="true">
          <div className="track">
            {[0, 1].map((k) => ['Active recall', 'Spaced repetition', 'AI study kits', 'Living learning map', 'Study circles', 'Proof on Arc'].map((x) => (
              <span key={`${k}-${x}`}><i />{x}</span>
            )))}
          </div>
        </div>

        {/* ───────── WALKTHROUGH (how it works + the product, in one) ───────── */}
        <section className="lp-sec band band-sky" id="how">
          <div className="lp-head">
            <div className="eyebrow">How it works</div>
            <h2 className="h2">From material to mastery, <span className="grad-text">in one loop.</span></h2>
            <p className="lead" style={{ marginTop: 16 }}>Four steps, no setup rabbit holes. Click through — each one is the real screen.</p>
          </div>
          <Walkthrough />
        </section>

        {/* ───────── FEATURES: learn it · keep it · prove it ───────── */}
        <section className="lp-sec band band-mesh" id="features">
          <div className="lp-head">
            <div className="eyebrow">Everything in one place</div>
            <h2 className="h2">Built for <span className="grad-text">durable memory,</span> not busywork.</h2>
            <ul className="lp-pillars" aria-label="What RecallMap does">
              <li className="p-learn"><i />Learn it</li><li className="p-keep"><i />Keep it</li><li className="p-prove"><i />Prove it</li>
            </ul>
          </div>

          <div className="lp-bento">
            <article className="tile t-map">
              <span className="tag p-learn">Learn it</span>
              <Icon name="map" size={24} />
              <h3>A living learning map</h3>
              <p>Every concept becomes a node. See what’s mastered, what’s due, and what you haven’t touched — and watch the whole map brighten as you study.</p>
              <div className="map-live" aria-hidden="true"><ConceptMap small animate={false} hubLabel="Your topic" hubSub="" concepts={featureMap} /></div>
            </article>

            <article className="tile t-ai">
              <span className="tag p-learn">Learn it</span>
              <Icon name="spark" size={24} />
              <h3>AI study kits</h3>
              <p>Drop in a PDF or notes. Get flashcards and questions grounded in your material — you approve everything before it’s saved.</p>
              <ul className="drafting" aria-hidden="true"><li /><li /><li /></ul>
            </article>

            <article className="tile t-srs">
              <span className="tag p-keep">Keep it</span>
              <Icon name="refresh" size={24} />
              <h3>Spaced recall</h3>
              <p>Rate each answer honestly. Hard cards come back tomorrow; easy ones wait a week or more.</p>
              <div className="srs-row" aria-hidden="true"><span>Again<small>10 min</small></span><span>Hard<small>1 day</small></span><span className="hl">Good<small>3 days</small></span><span>Easy<small>7 days</small></span></div>
            </article>

            <article className="tile t-goal">
              <span className="tag p-keep">Keep it</span>
              <Icon name="flame" size={24} />
              <h3>Habits that hold</h3>
              <p>A daily recall goal, a streak, and gentle challenges with a study circle — accountability without the popularity contest.</p>
              <ul className="chipline" aria-hidden="true"><li><Icon name="target" size={14} />Daily goal</li><li><Icon name="flame" size={14} />Streak</li><li><Icon name="users" size={14} />Circles</li></ul>
            </article>

            <article className="tile t-proof">
              <span className="tag p-prove">Prove it</span>
              <div className="proof-l">
                <Icon name="shield" size={24} />
                <h3>Proof you can carry</h3>
                <p>Earn badges only when you actually meet the criteria, then anchor selected ones on Arc so anyone can confirm they’re genuine — without ever seeing your private notes or answers.</p>
              </div>
              <div className="shelf" aria-hidden="true">
                <span className="b lime"><Icon name="award" size={20} />Topic Master</span>
                <span className="b"><Icon name="target" size={20} />Recall Ready</span>
                <span className="b"><Icon name="flame" size={20} />Week of Focus</span>
                <span className="b ghost"><Icon name="lock" size={20} />Goal Getter</span>
              </div>
            </article>
          </div>

          <ul className="lp-principles">
            <li><span><Icon name="file" size={20} /></span><div><b>Grounded in your material</b><p>Cards come from what you upload — not invented facts.</p></div></li>
            <li><span><Icon name="lock" size={20} /></span><div><b>Private by default</b><p>Notes and answers stay yours. You pick what’s public.</p></div></li>
            <li><span><Icon name="target" size={20} /></span><div><b>Mastery across sessions</b><p>Real scores, kept apart from XP — never earned from a single tap.</p></div></li>
          </ul>
        </section>

        {/* ───────── COMMUNITY ───────── */}
        <section className="lp-sec band band-blush" id="community">
          <div className="lp-head">
            <div className="eyebrow">Community</div>
            <h2 className="h2">Better learning happens <span className="grad-text">together.</span></h2>
            <p className="lead" style={{ marginTop: 16 }}>Circles, shared challenges and milestones — accountability, not a popularity contest. You decide what’s shared; your notes never are.</p>
          </div>
          <div className="lp-comm-cards">
            <article><span><Icon name="users" size={22} /></span><h3>Study circles</h3><p>Start a small group around a shared goal. Circles can be public to discover or private and invite-only.</p></article>
            <article><span><Icon name="flame" size={22} /></span><h3>Challenges</h3><p>Seven days of recall, or a set number of reviews. Progress comes from what you actually study — nothing to tap to cheat.</p></article>
            <article><span><Icon name="lock" size={22} /></span><h3>You choose what’s shared</h3><p>Your profile, topic names and milestones are private until you switch them on. Notes and answers are never shared.</p></article>
          </div>
        </section>
      </div>

      {/* ───────── VERIFICATION (full-bleed dark) ───────── */}
      <section className="lp-verify" id="verify">
        <div className="orb o1" aria-hidden="true" /><div className="orb o2" aria-hidden="true" />
        <div className="lp-wrap lp-split">
          <div>
            <div className="eyebrow" style={{ color: 'var(--blue-2)' }}>Verification</div>
            <h2 className="h2" style={{ color: '#FBFBF8' }}>Progress you can <span className="grad-text-anim">carry anywhere.</span></h2>
            <p className="lead" style={{ color: 'rgba(251,251,248,.66)', marginBottom: 28 }}>Selected achievements can be issued as credentials with a cryptographic proof anchored on Arc. A credential only shows as verified once the real check succeeds — and it fails the moment anything is changed.</p>

            <ol className="lp-vsteps">
              <li><span>1</span><div><b>Earn it</b><p>Meet the badge’s criteria across real sessions.</p></div></li>
              <li><span>2</span><div><b>Anchor a hash</b><p>Only a privacy-preserving fingerprint goes on Arc.</p></div></li>
              <li><span>3</span><div><b>Anyone can check</b><p>Recompute the hash and match it. No account needed.</p></div></li>
            </ol>

            <div className="lp-sees">
              <div className="yes"><div className="h"><Icon name="check" size={14} stroke={3} />A verifier sees</div><ul><li>Badge &amp; topic</li><li>Issuer &amp; date</li><li>The hash</li></ul></div>
              <div className="no"><div className="h"><Icon name="lock" size={14} stroke={2.6} />Never sees</div><ul><li>Your notes</li><li>Quiz answers</li><li>Session details</li></ul></div>
            </div>
          </div>
          <aside className="lp-anat" aria-label="What goes on-chain">
            <div className="caps">What gets anchored</div>
            <pre>{`{
  "achievement": "recall-ready",
  "topic": null | "<only if you opt in>",
  "holder": null | "<public username>",
  "issuedOn": "<date>",
  "nonce": "<random, per credential>"
}`}</pre>
            <div className="arrow"><Icon name="arrow" size={16} stroke={2.4} />keccak-256 hash</div>
            <code>0x… 32-byte fingerprint, stored on Arc</code>
            <p>Anyone can open <b>/verify/&lt;id&gt;</b>, re-hash the data and compare it with the contract. Change a single character and the check fails. No notes, answers, scores or email addresses are ever included.</p>
          </aside>
        </div>
      </section>

      <div className="lp-wrap">
        {/* ───────── FAQ ───────── */}
        <section className="lp-sec band band-sky" id="faq">
          <div className="lp-head">
            <div className="eyebrow">Questions</div>
            <h2 className="h2">Good to <span className="grad-text">know.</span></h2>
            <p className="lead" style={{ marginTop: 16 }}>Straight answers about your notes, your data, and what “verified” really means.</p>
          </div>
          <Faq />
        </section>

        {/* ───────── CLOSING CTA ───────── */}
        <FinalCta />

        <footer className="lp-foot2">
          <div className="brand">
            <Logo to="/" size={26} />
            <p>Learn consistently. Prove your progress. Active recall, spaced repetition and proof you can carry.</p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <ul><li><a href="#demo">Live demo</a></li><li><a href="#how">How it works</a></li><li><a href="#features">Features</a></li><li><a href="#community">Community</a></li></ul>
          </nav>
          <nav aria-label="Trust">
            <h4>Trust</h4>
            <ul><li><a href="#verify">Verification</a></li><li><a href="#faq">FAQ</a></li><li><Link to="/privacy">Privacy</Link></li><li><Link to="/terms">Terms</Link></li></ul>
          </nav>
          <nav aria-label="Get started">
            <h4>Get started</h4>
            <ul><li><Link to="/auth?mode=signup">Create account</Link></li><li><Link to="/auth">Sign in</Link></li></ul>
          </nav>
          <div className="legal"><span>© 2026 RecallMap</span><span>The map above uses sample data</span></div>
        </footer>
      </div>
    </div>
  );
}
