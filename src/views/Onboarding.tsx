'use client';

import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from '../lib/router';
import ConceptMap from '../components/ConceptMap';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import Mori from '../components/Mori';
import { actions, fail, useApp } from '../store/store';
import type { ConceptStat } from '../store/selectors';
import './Onboarding.css';

const groups: { label: string; items: string[] }[] = [
  { label: 'Science & maths', items: ['Organic Chemistry', 'Calculus', 'Statistics', 'Machine Learning'] },
  { label: 'Humanities & business', items: ['Macroeconomics', 'World History', 'Product Management'] },
  { label: 'Skills & languages', items: ['Rust Programming', 'Spanish Vocabulary', 'Music Theory'] },
];
const all = groups.flatMap((g) => g.items);

const paces = [
  { n: 10, label: 'Light', note: 'a gentle start' },
  { n: 20, label: 'Steady', note: 'most people pick this' },
  { n: 30, label: 'Focused', note: 'for exam season' },
  { n: 50, label: 'Intense', note: 'deadline mode' },
];

interface Draft { name: string; goal: string; date: string; daily: number; start: 'upload' | 'blank' | null }
const EMPTY: Draft = { name: '', goal: '', date: '', daily: 20, start: null };
const DRAFT_KEY = 'recallmap.onboarding';

const steps = ['Topic', 'Goal', 'Material', 'Ready'] as const;
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t); };
const daysUntil = (s: string) => { const d = parse(s); return d ? Math.ceil((d.getTime() - Date.now()) / 864e5) : null; };

const mori: Record<number, (name: string, daily: number) => string> = {
  1: (n) => (n ? `${n}? Great pick — I’ll build your map around it.` : 'Anything works — a subject, a skill, a course.'),
  2: (_, d) => `${d} cards a day is about ${Math.max(1, Math.round((d * 20) / 60))} minutes. You can change it anytime.`,
  3: () => 'Material becomes your study kit. Blank is fine too — you can add it later.',
  4: () => 'Every great memory starts somewhere.',
};

export default function Onboarding() {
  const s = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const daily = d.daily ?? 20;

  // The draft lives only in this browser tab until you finish, so a refresh doesn't lose your place.
  useEffect(() => {
    try { const raw = sessionStorage.getItem(DRAFT_KEY); if (raw) setD({ ...EMPTY, ...JSON.parse(raw) }); } catch { /* storage unavailable */ }
  }, []);
  const setDraft = (patch: Partial<Draft>) => setD((cur) => {
    const nx = { ...cur, ...patch };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(nx)); } catch { /* ignore */ }
    return nx;
  });
  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

  const previewConcepts: ConceptStat[] = useMemo(() => {
    if (step < 2) return [];
    const state = d.start === 'upload' && step >= 4 ? 'learning' : 'unexplored';
    return ['Core ideas', 'Key terms', 'Examples'].map((name) => ({ name, desc: '', cards: state === 'learning' ? 3 : 0, due: 0, recall: state === 'learning' ? 55 : 0, state }));
  }, [step, d.start]);

  if (!s.session) return <Navigate to="/auth?mode=signup" replace />;

  const go = (n: number) => { setErr(''); setStep(Math.max(0, Math.min(4, n))); };
  const next = () => {
    if (step === 1 && !d.name.trim()) { setErr('Pick or type something to learn.'); return; }
    go(step + 1);
  };
  const skip = async () => {
    try { await actions.updateUser({ onboarded: true }); clearDraft(); nav('/app'); } catch (e) { fail(e); }
  };
  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await actions.createTopic(d.name.trim() || 'My first topic', d.goal, d.date);
      await actions.updateUser({ dailyGoal: d.daily || 20, onboarded: true });
      clearDraft();
      nav(d.start === 'upload' ? `/app/topics/${id}/upload` : `/app/topics/${id}`);
    } catch (e) { fail(e); setBusy(false); }
  };
  const first = s.user.name.split(' ')[0];
  const left = daysUntil(d.date);
  const isoValue = parse(d.date) ? toIso(parse(d.date)!) : '';

  return (
    <div className="ob">
      <div className="ob-aurora" aria-hidden="true"><i /><i /><i /></div>

      <header>
        <Logo to="/" size={26} />
        {step > 0 && (
          <ol className="stepper" aria-label="Onboarding progress">
            {steps.map((l, i) => {
              const n = i + 1;
              const state = step > n ? 'done' : step === n ? 'cur' : '';
              return (
                <li key={l} className={state}>
                  <button type="button" disabled={step <= n} onClick={() => go(n)} aria-current={step === n ? 'step' : undefined}>
                    <span>{state === 'done' ? <Icon name="check" size={12} stroke={3.4} /> : n}</span><b>{l}</b>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <button className="skip" onClick={skip}>Skip for now</button>
      </header>

      {step === 0 ? (
        <main className="intro" key="intro">
          <div className="c center">
            <div className="mori-wrap"><Mori size={120} float label="Mori the moth" /></div>
            <h1>Hi{first ? `, ${first}` : ''} — I’m Mori.</h1>
            <p className="lead">I’ll help you turn what you study into memory you can actually recall. We’ll set up your first topic together — it takes about a minute.</p>
            <ul className="what">
              <li><span><Icon name="book" size={18} /></span>Name a topic</li>
              <li><span><Icon name="target" size={18} /></span>Set a pace</li>
              <li><span><Icon name="upload" size={18} /></span>Add material</li>
            </ul>
            <button className="btn btn-primary btn-lg lp-go" onClick={next} autoFocus>Let’s begin<Icon name="arrow" size={18} stroke={2.5} /></button>
          </div>
        </main>
      ) : (
        <main className="split" key={step}>
          <div className="c form">
            {step === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
                <div className="eyebrow">Step 1 of 4</div>
                <h1>What do you want to learn?</h1>
                <p className="sub">A subject, a skill, a course — anything you’re working on.</p>
                <input className={`input input-lg${err ? ' err' : ''}`} autoFocus placeholder="e.g. Organic Chemistry, Rust, Macroeconomics…" value={d.name}
                  onChange={(e) => { setDraft({ name: e.target.value }); setErr(''); }} maxLength={60} aria-label="Topic name" aria-invalid={!!err} />
                {err && <div className="field-err">{err}</div>}

                <div className="sugg">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className="hint">{g.label}</div>
                      <div className="chips">
                        {g.items.map((p) => <button type="button" key={p} className={`chip${d.name === p ? ' on' : ''}`} onClick={() => { setDraft({ name: p }); setErr(''); }}>{p}</button>)}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="surprise" onClick={() => { setDraft({ name: all[Math.floor(Math.random() * all.length)] }); setErr(''); }}><Icon name="spark" size={15} stroke={2.4} />Surprise me</button>
                </div>
                <Nav onBack={() => go(0)} />
              </form>
            )}

            {step === 2 && (
              <form onSubmit={(e) => { e.preventDefault(); next(); }}>
                <div className="eyebrow">Step 2 of 4</div>
                <h1>Set a goal &amp; pace <span className="opt-tag">optional</span></h1>
                <p className="sub">Mori uses this to pace your reviews. You can change it anytime in Settings.</p>

                <div className="field"><label htmlFor="ob-goal">Learning goal</label>
                  <input id="ob-goal" className="input input-lg" autoFocus placeholder="e.g. Pass my midterm by December" value={d.goal} onChange={(e) => setDraft({ goal: e.target.value })} maxLength={90} /></div>

                <div className="field" style={{ marginTop: 18 }}><label htmlFor="ob-date">Target date</label>
                  <input id="ob-date" className="input input-lg" type="date" min={toIso(new Date())} value={isoValue}
                    onChange={(e) => setDraft({ date: e.target.value ? fmt(new Date(`${e.target.value}T00:00`)) : '' })} />
                  <div className="presets">
                    {[['In 2 weeks', 14], ['In a month', 30], ['End of term', 90]].map(([l, n]) => (
                      <button type="button" key={l as string} className="chip" onClick={() => setDraft({ date: fmt(inDays(n as number)) })}>{l}</button>
                    ))}
                    {d.date && <button type="button" className="chip clear" onClick={() => setDraft({ date: '' })}>Clear</button>}
                  </div>
                </div>

                <div className="field" style={{ marginTop: 22 }}>
                  <label>Daily recall goal</label>
                  <div className="paces" role="radiogroup" aria-label="Daily recall goal">
                    {paces.map((p) => (
                      <button type="button" key={p.n} role="radio" aria-checked={daily === p.n} className={`pace${daily === p.n ? ' on' : ''}`} onClick={() => setDraft({ daily: p.n })}>
                        <b className="tnum">{p.n}</b><span>{p.label}</span><small>{p.note}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <Nav onBack={() => go(1)} />
              </form>
            )}

            {step === 3 && (
              <div>
                <div className="eyebrow">Step 3 of 4</div>
                <h1>How should we start?</h1>
                <p className="sub">Add your own material and AI will build a study kit — or start blank and add later.</p>
                <div className="opts">
                  <button className={`opt${d.start === 'upload' ? ' on' : ''}`} onClick={() => { setDraft({ start: 'upload' }); go(4); }}>
                    <span className="ico blue"><Icon name="upload" size={22} /></span>
                    <span><b>Upload material</b><small>PDF, notes, markdown, or paste text</small></span>
                    <em>Recommended</em>
                  </button>
                  <button className={`opt${d.start === 'blank' ? ' on' : ''}`} onClick={() => { setDraft({ start: 'blank' }); go(4); }}>
                    <span className="ico"><Icon name="plus" size={22} stroke={2.4} /></span>
                    <span><b>Start with a blank topic</b><small>Add flashcards and resources yourself</small></span>
                  </button>
                </div>
                <button className="back" onClick={() => go(2)}>Back</button>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="eyebrow">All set</div>
                <h1>Your topic is ready.</h1>
                <p className="sub">{d.start === 'upload' ? 'Next, add your material and I’ll generate flashcards and a quiz from it.' : 'I’ll generate flashcards and a quiz once you add material. Jump in whenever you’re ready.'}</p>
                <dl className="recap">
                  <div><dt>Topic</dt><dd>{d.name || 'My first topic'}</dd></div>
                  <div><dt>Goal</dt><dd>{d.goal || 'Not set'}</dd></div>
                  <div><dt>Target</dt><dd>{d.date || 'Not set'}</dd></div>
                  <div><dt>Pace</dt><dd className="tnum">{daily} cards a day</dd></div>
                  <div><dt>Start</dt><dd>{d.start === 'upload' ? 'Upload material' : 'Blank topic'}</dd></div>
                </dl>
                <div className="finish">
                  <button className="back" onClick={() => go(3)}>Back</button>
                  <button className="btn btn-dark btn-lg" onClick={finish} disabled={busy} autoFocus>{d.start === 'upload' ? 'Add my material' : 'Go to my topic'}<Icon name="arrow" size={18} stroke={2.5} /></button>
                </div>
              </div>
            )}
          </div>

          {/* ───── live preview ───── */}
          <aside className="preview" aria-label="Preview of your topic">
            <div className="pv-card">
              <div className="pv-bg" aria-hidden="true" />
              <div className="pv-top">
                <span className="pill pill-mist">New topic</span>
                {left !== null && left >= 0 && <span className="pill pill-lime tnum"><Icon name="calendar" size={12} stroke={2.6} />{left === 0 ? 'Today' : `${left} ${left === 1 ? 'day' : 'days'} left`}</span>}
              </div>
              <h2 className={d.name ? '' : 'ph'}>{d.name || 'Your topic'}</h2>
              <p className={d.goal ? 'goal' : 'goal ph'}>{d.goal ? `Goal: ${d.goal}` : 'Your goal will appear here'}</p>

              <div className="pv-map">
                <ConceptMap small animate={false} hubLabel={(d.name || 'Topic').split(' ')[0]} hubSub="" concepts={previewConcepts} />
                {step < 2 && <span className="pv-hint">Your concepts appear here</span>}
              </div>

              <div className="pv-foot">
                <div><b className="tnum">{daily}</b><span>cards / day</span></div>
                <div><b className="tnum">~{Math.max(1, Math.round((daily * 20) / 60))}m</b><span>per day</span></div>
                <div><b>{d.start === 'upload' ? 'Upload' : d.start === 'blank' ? 'Blank' : '—'}</b><span>start</span></div>
              </div>
            </div>

            <div className="bubble" key={`b${step}`}>
              <Mori size={44} still label="Mori" />
              <p>{mori[step]?.(d.name, daily)}</p>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

function Nav({ onBack }: { onBack: () => void }) {
  return (
    <div className="nav">
      <button type="button" className="back" onClick={onBack}>Back</button>
      <button type="submit" className="btn btn-primary btn-lg">Continue<Icon name="arrow" size={17} stroke={2.5} /></button>
    </div>
  );
}
