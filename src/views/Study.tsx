'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from '../lib/router';
import Icon from '../components/Icon';
import { MoriMark } from '../components/Mori';
import Ring from '../components/Ring';
import { api, messageOf } from '../lib/api';
import { actions, announce, fail, getState, refresh, useApp } from '../store/store';
import { markAnswer, matchLabel, type Match } from '../lib/grade';
import { conceptStats, findTopic, topicDue } from '../store/selectors';
import type { AppState, Card, Rating } from '../store/types';
import './Study.css';
import './StudyFlow.css';
import './StudyType.css';

/** A card in a live session: its question only. The reference answer arrives after you answer. */
interface LiveCard { id: string; question: string; hint: string | null; concept: string; difficulty: string; isNew: boolean }
interface RevealResp { responseId: string; reveal: { referenceAnswer: string; explanation: string; source: number | null }; match: Match; rated: boolean }
interface Summary { reviewed: number; qualified: boolean; xp: { session: number; reviews: number; sessionReason: string }; unlocked: { code: string; name: string }[]; soon: number }

type Phase = 'setup' | 'run' | 'done';
type Length = 5 | 10 | 15 | 0; // 0 = everything that qualifies
type Result = { card: LiveCard; r: Rating; typed?: string; match?: Match };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lengths: { v: Length; label: string }[] = [{ v: 5, label: '5' }, { v: 10, label: '10' }, { v: 15, label: '15' }, { v: 0, label: 'All' }];

/** Only used to preview how many cards a session will have; the real deck is built by the server. */
const previewDeck = (s: AppState, topicId: string, concept: string, length: Length, includeAll: boolean): Card[] => {
  const t = findTopic(s, topicId);
  if (!t) return [];
  const pool = concept ? t.cards.filter((c) => c.concept === concept) : t.cards;
  const byWeak = (a: Card, b: Card) => a.strength - b.strength;
  const due = pool.filter((c) => c.due).sort(byWeak);
  const rest = pool.filter((c) => !c.due).sort(byWeak);
  const ordered = includeAll || due.length === 0 ? [...due, ...rest] : due;
  return length === 0 ? ordered : ordered.slice(0, length);
};

const ratings: { k: Rating; label: string; hint: string; cls: string }[] = [
  { k: 'again', label: 'Again', hint: 'in minutes', cls: 'again' },
  { k: 'hard', label: 'Hard', hint: 'about a day', cls: '' },
  { k: 'good', label: 'Good', hint: 'a few days', cls: 'good' },
  { k: 'easy', label: 'Easy', hint: 'a week or more', cls: '' },
];

export default function Study() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const s = useApp();
  const nav = useNavigate();
  const topic = findTopic(s, id);

  // setup choices
  const [concept, setConcept] = useState(params.get('concept') ?? '');
  const [length, setLength] = useState<Length>(10);
  const [includeAll, setIncludeAll] = useState(false);

  // session
  const [phase, setPhase] = useState<Phase>('setup');
  const [deck, setDeck] = useState<LiveCard[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [reveal, setReveal] = useState<RevealResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [startErr, setStartErr] = useState('');
  const [fb, setFb] = useState<{ similarity: string; feedback: string; suggestedRating: Rating } | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [skips, setSkips] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [seconds, setSeconds] = useState(0);
  const before = useRef<Record<string, number>>({});
  const after = useRef<Record<string, number>>({});
  const finished = useRef(false);

  const concepts = useMemo(() => (topic ? conceptStats(topic) : []), [topic]);
  const dueNow = topic ? topicDue(topic) : 0;
  const preview = useMemo(() => previewDeck(s, id, concept, length, includeAll || dueNow === 0), [s, id, concept, length, includeAll, dueNow]);

  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const begin = useCallback(async () => {
    if (busy) return;
    setBusy(true); setStartErr('');
    try {
      const mode = includeAll || dueNow === 0 ? 'all' : 'due';
      const r = await api<{ empty: boolean; session?: string; cards?: LiveCard[] }>('POST', `/api/topics/${id}/study-sessions`, { mode, concept: concept || undefined, limit: length });
      if (r.empty || !r.session || !r.cards?.length) { setStartErr('Nothing to review right now.'); setBusy(false); return; }
      before.current = Object.fromEntries(conceptStats(findTopic(getState(), id)!).map((c) => [c.name, c.recall]));
      finished.current = false;
      setSessionId(r.session); setDeck(r.cards); setTotal(r.cards.length); setResults([]); setSkips(0);
      setFlipped(false); setReveal(null); setTyped(''); setSummary(null); setSeconds(0); setPhase('run');
    } catch (e) { setStartErr(messageOf(e)); }
    setBusy(false);
  }, [id, concept, length, includeAll, dueNow, busy]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    try {
      const r = await api<Summary>('POST', `/api/study-sessions/${sessionId}/complete`);
      setSummary(r);
      announce({ xp: r.xp.session, unlocked: r.unlocked, body: `${r.reviewed} cards reviewed.` });
      await refresh();
      after.current = Object.fromEntries(conceptStats(findTopic(getState(), id)!).map((c) => [c.name, c.recall]));
    } catch (e) { fail(e); }
    setPhase('done');
  }, [id, sessionId]);

  const typeMode = s.prefs.typeAnswers !== false;
  const card = deck[0];
  const match = reveal?.match ?? null;

  /**
   * Type-first: your answer is saved on the server first; only then does the card turn and the reference answer
   * arrive. "I don't know" is an explicit, recorded non-answer.
   */
  const check = useCallback(async (dontKnow = false) => {
    if (!card || busy || flipped) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    setBusy(true);
    try {
      const r = await api<RevealResp>('POST', `/api/study-sessions/${sessionId}/responses`, { flashcardId: card.id, answer: dontKnow ? '' : typed, dontKnow });
      setReveal(r);
      setFb(null);
      setFlipped(true);
    } catch (e) { fail(e); }
    setBusy(false);
  }, [card, busy, flipped, sessionId, typed]);

  const rate = useCallback(async (r: Rating) => {
    if (!card || busy || !reveal) return;
    setBusy(true);
    try {
      const res = await api<{ unlocked: { code: string; name: string }[]; xp: { dailyCommitment: { awarded: number } | null } }>('POST', `/api/study-sessions/${sessionId}/reviews`, { flashcardId: card.id, rating: r });
      if (res.xp.dailyCommitment?.awarded) announce({ xp: res.xp.dailyCommitment.awarded, body: 'Daily goal met — keep the streak alive.' });
      announce({ unlocked: res.unlocked });
    } catch (e) { fail(e); setBusy(false); return; }
    setResults((list) => [...list, { card, r, typed: typeMode ? typed.trim() : undefined, match: typeMode && match ? match : undefined }]);
    const rest = deck.slice(1);
    setDeck(rest);
    setFlipped(false);
    setReveal(null);
    setTyped('');
    setBusy(false);
    if (rest.length === 0) void finish();
  }, [card, busy, reveal, sessionId, deck, finish, typeMode, typed, match]);

  /** Optional AI comparison of what you typed with the reference answer. Advice only — you still choose the rating. */
  const askFeedback = async () => {
    if (!card || fbBusy) return;
    setFbBusy(true);
    try { setFb(await api('POST', `/api/study-sessions/${sessionId}/feedback`, { flashcardId: card.id })); } catch (e) { fail(e); }
    setFbBusy(false);
  };

  const skip = useCallback(() => {
    if (deck.length < 2 || flipped) return;
    setDeck((d) => [...d.slice(1), d[0]]);
    setSkips((n) => n + 1);
    setTyped('');
  }, [deck.length, flipped]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (phase === 'setup' && e.key === 'Enter') { e.preventDefault(); void begin(); }
      if (phase !== 'run') return;
      if (e.code === 'Space' && !typeMode && !flipped) { e.preventDefault(); void check(true); }
      if (e.key.toLowerCase() === 's' && !flipped) skip();
      if (flipped && e.key >= '1' && e.key <= '4') void rate(ratings[Number(e.key) - 1].k);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [phase, flipped, begin, rate, skip, check, typeMode]);

  if (!s.session) return <Navigate to={`/auth?next=${encodeURIComponent(`/study/${id}`)}`} replace />;
  if (!topic) return <Navigate to="/app/map" replace />;

  if (topic.cards.length === 0) {
    return (
      <div className="study"><div className="st-empty">
        <MoriMark size={64} />
        <h1 className="serif">Nothing to study yet.</h1>
        <p>{topic.name} has no flashcards. Add material and generate a study kit first.</p>
        <Link to={`/app/topics/${id}/upload`} className="btn btn-primary">Add material</Link>
        <Link to={`/app/topics/${id}`} className="btn btn-outline">Back to topic</Link>
      </div></div>
    );
  }

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  const doneCount = results.length;

  const quit = (e: React.MouseEvent) => {
    e.preventDefault();
    if (phase === 'run' && results.length) { void finish().then(() => nav('/app')); return; }
    nav(phase === 'setup' ? `/app/topics/${id}` : '/app');
  };
  const again = (e: React.MouseEvent) => { e.preventDefault(); setPhase('setup'); setSummary(null); };

  /* ───────────────── setup ───────────────── */
  if (phase === 'setup') {
    const est = Math.max(1, Math.round((preview.length * 20) / 60));
    return (
      <div className="study setup-wrap">
        <header>
          <a href={`/app/topics/${id}`} className="end" onClick={quit}><Icon name="x" size={18} />Close</a>
          <div className="mid"><small>New session</small><b>{topic.name}</b></div>
          <span style={{ minWidth: 64 }} />
        </header>

        <div className="setup rise">
          <div className="setup-top">
            <MoriMark size={54} />
            <div>
              <h1 className="serif">Ready to strengthen {concept || topic.name}?</h1>
              <p>{dueNow > 0 ? `${plural(dueNow, 'card')} due across ${plural(concepts.filter((c) => c.due > 0).length, 'concept')}.` : 'Nothing is due right now — a practice round keeps cards fresh.'}</p>
            </div>
          </div>

          <div className="opt">
            <div className="lbl">Focus</div>
            <div className="chips" role="radiogroup" aria-label="Focus">
              <button role="radio" aria-checked={concept === ''} className={`chip${concept === '' ? ' on' : ''}`} onClick={() => setConcept('')}>All concepts<em className="tnum">{dueNow}</em></button>
              {concepts.filter((c) => c.cards > 0).map((c) => (
                <button key={c.name} role="radio" aria-checked={concept === c.name} className={`chip${concept === c.name ? ' on' : ''}`} onClick={() => setConcept(c.name)}>
                  {c.name}{c.due > 0 && <em className="tnum">{c.due}</em>}
                </button>
              ))}
            </div>
          </div>

          <div className="opt two">
            <div>
              <div className="lbl">Length</div>
              <div className="seg" role="radiogroup" aria-label="Number of cards">
                {lengths.map((l) => <button key={l.label} role="radio" aria-checked={length === l.v} className={length === l.v ? 'on' : ''} onClick={() => setLength(l.v)}>{l.label}</button>)}
              </div>
            </div>
            <div className="sw-col">
              <label className="sw-row">
                <input type="checkbox" checked={typeMode} onChange={(e) => void actions.updatePrefs({ typeAnswers: e.target.checked }).catch(fail)} />
                <span className="sw" aria-hidden="true" />
                <span><b>Type your answer first</b><small>The card only turns after you’ve answered</small></span>
              </label>
              <label className="sw-row">
                <input type="checkbox" checked={includeAll || dueNow === 0} disabled={dueNow === 0} onChange={(e) => setIncludeAll(e.target.checked)} />
                <span className="sw" aria-hidden="true" />
                <span><b>Include cards that aren’t due</b><small>Tops up with your weakest cards</small></span>
              </label>
            </div>
          </div>

          <div className="setup-foot">
            <div className="est"><b className="tnum">{plural(preview.length, 'card')}</b><span>about {plural(est, 'minute')}</span></div>
            <div className="acts">
              <Link to={`/app/topics/${id}`} className="btn btn-outline">Cancel</Link>
              <button className="btn btn-primary btn-lg" onClick={() => void begin()} disabled={preview.length === 0 || busy}>{busy ? 'Starting…' : 'Begin session'}<Icon name="arrow" size={18} stroke={2.5} /></button>
            </div>
          </div>
          {startErr && <p className="field-err" role="alert" style={{ textAlign: 'right' }}>{startErr}</p>}
          <p className="hint-keys"><kbd>Enter</kbd> to begin · {typeMode ? <><kbd>Enter</kbd> check answer</> : <><kbd>Space</kbd> reveal</>} · <kbd>1</kbd>–<kbd>4</kbd> rate</p>
        </div>
      </div>
    );
  }

  /* ───────────────── session + summary ───────────────── */
  const counts = { again: 0, hard: 0, good: 0, easy: 0 } as Record<Rating, number>;
  results.forEach((x) => { counts[x.r]++; });
  const good = counts.good + counts.easy;
  const revisit = results.filter((x) => x.r === 'again' || x.r === 'hard');
  const touched = [...new Set(results.map((x) => x.card.concept))].map((name) => ({ name, from: before.current[name] ?? 0, to: after.current[name] ?? 0 }));
  const other = s.topics.filter((t) => t.id !== id && topicDue(t) > 0).sort((a, b) => topicDue(b) - topicDue(a))[0];
  const xp = summary ? summary.xp.session + summary.xp.reviews : 0;

  return (
    <div className="study">
      <header>
        <a href="/app" className="end" onClick={quit}><Icon name="x" size={18} />{phase === 'run' && results.length ? 'Finish' : 'End session'}</a>
        <div className="mid"><small>{concept ? `Focus · ${concept}` : 'Reviewing'}</small><b>{topic.name}</b></div>
        <div className="time tnum"><Icon name="clock" size={16} stroke={2.2} />{mm}:{ss}</div>
      </header>

      <div className="rail" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Session progress">
        {Array.from({ length: total }, (_, i) => {
          const r = results[i]?.r;
          return <i key={i} className={`${r ?? ''}${i === doneCount && phase === 'run' ? ' cur' : ''}`} />;
        })}
        <span className="tnum">{Math.min(doneCount + (phase === 'run' ? 1 : 0), total)} / {total}</span>
      </div>

      {phase === 'run' && card && (
        <div className="stage" key={`${card.id}-${skips}`}>
          <div className="tag">{card.concept}</div>
          <button className="flipper" onClick={() => { if (typeMode) { if (!flipped) taRef.current?.focus(); } else if (!flipped) void check(true); }}
            aria-label={flipped ? 'Answer shown' : typeMode ? 'Question — type your answer below' : 'Reveal answer'}>
            <span className="inner" style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}>
              <span className="face front">
                <span className="q serif">{card.question}</span>
                {card.hint && !flipped && <span className="reveal" style={{ opacity: 0.8 }}>Hint: {card.hint}</span>}
                <span className="reveal">{typeMode ? <><Icon name="edit" size={15} stroke={2.2} />Type your answer, then check it</> : <><Icon name="refresh" size={15} stroke={2.2} />Tap or press space to reveal</>}</span>
              </span>
              <span className="face back">
                <small>Answer</small>
                <span className="a">
                  {reveal && (typeMode && typed.trim()
                    ? markAnswer(typed, reveal.reveal.referenceAnswer).map((p, i) => <span key={i} className={p.hit === true ? 'hit' : p.hit === false ? 'miss' : undefined}>{p.text}</span>)
                    : reveal.reveal.referenceAnswer)}
                </span>
                {reveal?.reveal.explanation && <span className="ex">{reveal.reveal.explanation}</span>}
              </span>
            </span>
          </button>

          {typeMode && !flipped && (
            <div className="typebox rise">
              <textarea ref={taRef} autoFocus rows={3} value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={1000}
                placeholder="Type what you remember…" aria-label="Your answer"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && typed.trim()) { e.preventDefault(); void check(); } }} />
              <div className="trow">
                <span className="tk"><kbd>Enter</kbd> to check · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line</span>
                <button className="skip" onClick={skip} disabled={deck.length < 2}>Skip</button>
                <button className="idk" onClick={() => void check(true)} disabled={busy}>I don’t know</button>
                <button className="btn btn-primary btn-sm" onClick={() => void check()} disabled={!typed.trim() || busy}>Check answer<Icon name="arrow" size={15} stroke={2.5} /></button>
              </div>
            </div>
          )}

          {typeMode && flipped && match && (
            <div className="yours rise">
              <div className="yh"><span className={`mt ${match.level}`}>{matchLabel[match.level]}</span><small>You wrote</small></div>
              <p className={typed.trim() ? '' : 'none'}>{typed.trim() || 'No answer — that’s okay, now you’ve seen it.'}</p>
              <small className="note">Key words you got are highlighted in the answer above. This is only a guide — you decide how it went.</small>
              {s.aiAvailable && typed.trim() && !fb && <button className="btn btn-soft btn-sm" style={{ marginTop: 10 }} onClick={() => void askFeedback()} disabled={fbBusy}><Icon name="spark" size={14} stroke={2.4} />{fbBusy ? 'Comparing…' : 'Get AI feedback'}</button>}
              {fb && <p className="ai-fb"><b>{fb.similarity === 'close' ? 'Close' : fb.similarity === 'partial' ? 'Partly there' : 'Not quite'}.</b> {fb.feedback} <em>Suggested: {ratings.find((r) => r.k === fb.suggestedRating)?.label}</em></p>}
            </div>
          )}

          {flipped ? (
            <div className="rate rise">
              <div className="lbl">How well did you recall it?{typeMode && match && <> <em>Suggested: <b>{ratings.find((r) => r.k === match.suggested)!.label}</b></em></>}</div>
              <div className="btns">
                {ratings.map((r, n) => (
                  <button key={r.k} className={`conf ${r.cls}${typeMode && match?.suggested === r.k ? ' sug' : ''}`} onClick={() => void rate(r.k)} disabled={busy}><span>{r.label}</span><small>{r.hint}</small><kbd>{n + 1}</kbd></button>
                ))}
              </div>
            </div>
          ) : !typeMode && (
            <div className="pre">
              <span className="wait">Rate your recall once you’ve revealed the answer</span>
              <button className="skip" onClick={skip} disabled={deck.length < 2}>Skip for now <kbd>S</kbd></button>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="sum rise">
          <div className="sum-head">
            <MoriMark size={64} />
            <p className="quote">“You showed up. That counts.”</p>
            <h1 className="serif">Session complete</h1>
            <p className="when tnum">{plural(results.length, 'card')} in {mm > 0 ? `${mm}m ${ss}s` : `${seconds}s`} · <span className="streak"><Icon name="flame" size={15} />{s.user.streak}-day streak</span></p>
          </div>

          <div className="trio">
            <div><b className="tnum">{results.length}</b><span>cards reviewed</span></div>
            <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{good}</b><span>recalled well</span></div>
            <div className="xp"><b className="tnum">+{xp}</b><span>XP earned</span></div>
          </div>
          {summary && !summary.qualified && <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>Rate at least a few cards in a session for it to count toward XP and streak badges.</p>}
          {summary && summary.qualified && summary.xp.session === 0 && <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>You’ve reached today’s session-XP limit — your reviews still strengthen your memory.</p>}

          <div className="panel">
            <div className="caps">How it went</div>
            <div className="split" role="img" aria-label={`Again ${counts.again}, Hard ${counts.hard}, Good ${counts.good}, Easy ${counts.easy}`}>
              {ratings.map((r) => counts[r.k] > 0 && <i key={r.k} className={`s-${r.k}`} style={{ flex: counts[r.k] }} />)}
            </div>
            {results.some((x) => x.match) && (
              <p className="typed-sum"><Icon name="edit" size={14} stroke={2.3} />Typed recall: <b className="tnum">{results.filter((x) => x.match?.level === 'close').length} of {results.filter((x) => x.match).length}</b> answers were a close match</p>
            )}
            <div className="legend">
              {ratings.map((r) => <span key={r.k}><i className={`s-${r.k}`} />{r.label}<b className="tnum">{counts[r.k]}</b></span>)}
            </div>
          </div>

          <div className="panel">
            <div className="caps">Concept impact</div>
            <div className="impact">
              {touched.map((c) => {
                const d = c.to - c.from;
                return (
                  <div key={c.name}>
                    <b>{c.name}</b>
                    <span className="tnum">{c.from}%</span><Icon name="arrow" size={13} stroke={2.4} /><span className="tnum to">{c.to}%</span>
                    <em className={`tnum ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? `+${d}` : d}</em>
                  </div>
                );
              })}
            </div>
          </div>

          {revisit.length > 0 ? (
            <div className="panel">
              <div className="caps">Scheduled sooner · {revisit.length}</div>
              <ul className="revisit">
                {revisit.map((x) => <li key={x.card.id}><small>{x.card.concept}</small>{x.card.question}</li>)}
              </ul>
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>We’ll resurface the tricky ones first next time.</p>
            </div>
          ) : (
            <div className="panel clean"><Ring value={100} size={44} stroke={4} id="clean"><Icon name="check" size={18} stroke={3} /></Ring><div><b>Clean sweep</b><span>Nothing needs an early revisit.</span></div></div>
          )}

          <div className="acts">
            <a href="#" className="btn btn-primary" onClick={again}>Study again</a>
            <Link to={`/app/topics/${id}`} className="btn btn-outline">Back to topic</Link>
            <Link to="/app" className="btn btn-outline">Home</Link>
          </div>
          {other && (
            <Link to={`/study/${other.id}`} className="nextup">
              <span><small>Next up</small><b>{other.name}</b></span><em className="tnum">{plural(topicDue(other), 'card')} due<Icon name="arrow" size={15} stroke={2.5} /></em>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
