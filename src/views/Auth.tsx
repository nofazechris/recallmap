'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from '../lib/router';
import ConceptMap from '../components/ConceptMap';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import Mori from '../components/Mori';
import { api, messageOf } from '../lib/api';
import { actions, useApp } from '../store/store';
import type { ConceptStat } from '../store/selectors';
import './Auth.css';

type Mode = 'signin' | 'signup';
type View = Mode | 'reset';
type Errs = { name?: string; email?: string; pw?: string };

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** 0–4. Rewards length first, then variety — a rough guide, not a security guarantee. */
const strength = (pw: string) => {
  if (!pw) return 0;
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++;
  return Math.min(4, n);
};
const strengthLabel = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];

/** Only ever follow same-site relative paths after sign-in. */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

/** Decorative map for the brand panel: nodes light up one after another. */
const decor: ConceptStat[] = [
  { name: 'Notes', desc: '', cards: 2, due: 0, recall: 92, state: 'mastered' },
  { name: 'Flashcards', desc: '', cards: 3, due: 0, recall: 84, state: 'strong' },
  { name: 'Recall', desc: '', cards: 2, due: 1, recall: 66, state: 'due' },
  { name: 'Progress', desc: '', cards: 1, due: 0, recall: 60, state: 'learning' },
  { name: 'Proof', desc: '', cards: 0, due: 0, recall: 0, state: 'unexplored' },
];

const panel = {
  signin: {
    title: 'Welcome back to your map.',
    sub: 'Your streak, your due cards and everything you were learning are right where you left them.',
    points: ['Pick up exactly where you left off', 'Due cards are already queued for today', 'Your progress stays yours — private by default'],
  },
  signup: {
    title: 'Your first minute, mapped.',
    sub: 'Create an account and Mori guides you through a first topic. No setup rabbit holes.',
    points: ['Name what you’re learning', 'Add notes or a PDF — or start blank', 'Review the study kit and begin recalling'],
  },
} as const;

export default function Auth() {
  const [params, setParams] = useSearchParams();
  const s = useApp();
  const mode: Mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  const next = params.get('next');
  const [view, setView] = useState<View>(mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [devLink, setDevLink] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { setView(mode); setSent(false); }, [mode]);

  const su = view === 'signup';
  const reset = view === 'reset';
  const score = strength(pw);

  const errs: Errs = useMemo(() => {
    const e: Errs = {};
    if (su && !name.trim()) e.name = 'Tell us what to call you.';
    if (!emailOk(email)) e.email = email ? 'That doesn’t look like a valid email.' : 'Enter your email address.';
    if (su && pw.length < 8) e.pw = 'Use at least 8 characters.';
    if (view === 'signin' && !pw) e.pw = 'Enter your password.';
    return e;
  }, [su, view, name, email, pw]);

  // Already signed in → straight into the app.
  if (s.session && !params.get('mode')) return <Navigate to={s.user.onboarded ? next || '/app' : '/onboarding'} replace />;

  const setMode = (m: Mode) => {
    const p = new URLSearchParams(params);
    p.set('mode', m);
    setParams(p, { replace: true });
    setTouched({});
  };
  const blur = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  const show$ = (k: keyof Errs) => touched[k] && errs[k];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, pw: true });
    const relevant = reset ? errs.email : Object.values(errs).find(Boolean);
    if (relevant) {
      setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    setFormErr('');
    try {
      if (reset) {
        const r = await api<{ devLink?: string }>('POST', '/api/auth/forgot', { email: email.trim() });
        setDevLink(r.devLink ?? '');
        setSent(true);
      } else {
        if (su) await actions.signUp(name.trim(), email.trim(), pw);
        else await actions.signIn(email.trim(), pw);
        // Full navigation so the server renders the signed-in app fresh.
        window.location.assign(su ? '/onboarding' : safeNext(next) ?? '/app');
        return;
      }
    } catch (err) {
      setFormErr(messageOf(err));
    }
    setBusy(false);
  };

  const copy = panel[su ? 'signup' : 'signin'];

  return (
    <div className="auth">
      {/* ───────── brand panel ───────── */}
      <aside className="auth-brand">
        <div className="orb a" aria-hidden="true" /><div className="orb b" aria-hidden="true" /><div className="orb c" aria-hidden="true" />
        <Logo to="/" size={30} light />

        <div className="art">
          <div className="mapbox" aria-hidden="true">
            <ConceptMap hubLabel="You" hubSub="" concepts={decor} small animate />
            <div className="mori"><Mori size={64} float tone="light" label="Mori" /></div>
          </div>
          <div key={su ? 'u' : 'i'} className="copy">
            <h2>{copy.title}</h2>
            <p>{copy.sub}</p>
            <ul>
              {copy.points.map((t, i) => (
                <li key={t} style={{ animationDelay: `${0.15 + i * 0.12}s` }}><span><Icon name="check" size={13} stroke={3.2} /></span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="foot">Verifiable on Arc · AI study kits · Spaced recall</div>
      </aside>

      {/* ───────── form ───────── */}
      <section className="auth-form">
        <div className="box">
          {!reset && (
            <div className="seg seg-full" role="tablist" aria-label="Account">
              <button role="tab" aria-selected={!su} className={!su ? 'on' : ''} onClick={() => setMode('signin')}>Sign in</button>
              <button role="tab" aria-selected={su} className={su ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
            </div>
          )}

          {reset ? (
            <button type="button" className="back-link" onClick={() => { setView('signin'); setSent(false); }}><Icon name="back" size={15} stroke={2.4} />Back to sign in</button>
          ) : null}

          <h1>{reset ? 'Reset your password' : su ? 'Create your account' : 'Welcome back'}</h1>
          <p className="sub">{reset ? 'Enter your email and we’ll send a reset link.' : su ? 'Start turning what you study into memory you can recall.' : 'Sign in to pick up where you left off.'}</p>

          {sent ? (
            <div className="sent" role="status">
              <span className="ic"><Icon name="check" size={22} stroke={2.8} /></span>
              <b>Check your inbox</b>
              <p>If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way.</p>
              {devLink && <small>Development only (no email provider is configured): <a href={devLink}>open the reset link</a></small>}
            </div>
          ) : (
            <form ref={form} onSubmit={submit} noValidate>
              {su && (
                <div className="field">
                  <label htmlFor="a-name">Name</label>
                  <input id="a-name" className={`input${show$('name') ? ' err' : ''}`} placeholder="Alex Rivera" value={name} autoFocus
                    onChange={(e) => setName(e.target.value)} onBlur={() => blur('name')} autoComplete="name" aria-invalid={!!show$('name')} aria-describedby="e-name" />
                  {show$('name') && <div id="e-name" className="field-err">{errs.name}</div>}
                </div>
              )}

              <div className="field">
                <label htmlFor="a-email">Email</label>
                <input id="a-email" className={`input${show$('email') ? ' err' : ''}`} type="email" placeholder="you@email.com" value={email} autoFocus={!su}
                  onChange={(e) => setEmail(e.target.value)} onBlur={() => blur('email')} autoComplete="email" aria-invalid={!!show$('email')} aria-describedby="e-email" />
                {show$('email') && <div id="e-email" className="field-err">{errs.email}</div>}
              </div>

              {!reset && (
                <div className="field">
                  <div className="lr"><label htmlFor="a-pw">Password</label>
                    {!su && <button type="button" className="link" onClick={() => { setView('reset'); setSent(false); }}>Forgot password?</button>}
                  </div>
                  <div className="pw">
                    <input id="a-pw" className={`input${show$('pw') ? ' err' : ''}`} type={show ? 'text' : 'password'} placeholder="••••••••" value={pw}
                      onChange={(e) => setPw(e.target.value)} onFocus={() => setPwFocus(true)} onBlur={() => { setPwFocus(false); setCaps(false); blur('pw'); }}
                      onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
                      autoComplete={su ? 'new-password' : 'current-password'} aria-invalid={!!show$('pw')} aria-describedby="e-pw" />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
                  </div>
                  {caps && pwFocus && <div className="caps-note"><Icon name="alert" size={14} stroke={2.4} />Caps Lock is on</div>}
                  {show$('pw') && <div id="e-pw" className="field-err">{errs.pw}</div>}

                  {su && (pw || pwFocus) && (
                    <div className="meter" aria-live="polite">
                      <div className="bars" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={score >= n ? `on l${score}` : ''} />)}</div>
                      <span className={`lbl l${score}`}>{strengthLabel[score]}</span>
                    </div>
                  )}
                </div>
              )}

              {formErr && <div className="field-err form-err" role="alert">{formErr}</div>}
              <button type="submit" className={`btn btn-primary btn-lg btn-block go${busy ? ' busy' : ''}`} disabled={busy}>
                {busy
                  ? <><Icon name="refresh" size={18} stroke={2.5} className="spin" />{reset ? 'Sending…' : su ? 'Creating your account…' : 'Signing you in…'}</>
                  : <>{reset ? 'Send reset link' : su ? 'Create account' : 'Sign in'}<Icon name="arrow" size={18} stroke={2.5} /></>}
              </button>
            </form>
          )}

          <p className="legal">
            {su ? <>By creating an account you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</> : 'Your password is stored only as a salted hash. Your notes stay private unless you choose otherwise.'}
          </p>
          <p className="back"><Link to="/">← Back to home</Link></p>
        </div>
      </section>
    </div>
  );
}
