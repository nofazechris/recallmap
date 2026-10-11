'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from '../lib/router';
import Icon from '../components/Icon';
import { MoriMark } from '../components/Mori';
import { api, messageOf } from '../lib/api';
import { announce, fail, refresh, useApp } from '../store/store';
import { findTopic } from '../store/selectors';
import './Quiz.css';

const letters = ['A', 'B', 'C', 'D', 'E'];
type Ans = number | boolean;

interface TakeQuestion { id: string; text: string; type: 'multiple_choice' | 'true_false'; options: string[] }
interface Attempt { attemptId: string; title: string; questions: TakeQuestion[]; saved: Record<string, Ans | null> }
interface Result {
  attemptId: string; score: number; correct: number; total: number; passed: boolean;
  xp: { awarded: number; reason: string }; unlocked: { code: string; name: string }[];
  review: { id: string; text: string; options: string[]; submitted: Ans | null; correctAnswer: Ans; isCorrect: boolean; explanation: string }[];
}

/** Multiple choice answers are the option's index; true/false answers are a boolean (index 0 is "True"). */
const toIndex = (q: TakeQuestion, a: Ans | null | undefined) => (a === null || a === undefined ? null : q.type === 'true_false' ? (a === true ? 0 : 1) : (a as number));
const fromIndex = (q: TakeQuestion, i: number): Ans => (q.type === 'true_false' ? i === 0 : i);

export default function Quiz() {
  const { id = '' } = useParams();
  const s = useApp();
  const topic = findTopic(s, id);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState('');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Ans>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const quizId = topic?.quizId;
  const begin = useCallback(async () => {
    if (!quizId) return;
    setError(''); setResult(null); setI(0); setAnswers({}); setAttempt(null);
    try {
      const a = await api<Attempt>('POST', `/api/quizzes/${quizId}/attempts`);
      setAttempt(a);
      const restored: Record<string, Ans> = {};
      for (const [qid, v] of Object.entries(a.saved)) if (v !== null && v !== undefined) restored[qid] = v;
      setAnswers(restored);
      // Resume on the first unanswered question.
      const first = a.questions.findIndex((q) => restored[q.id] === undefined);
      setI(first === -1 ? Math.max(0, a.questions.length - 1) : first);
    } catch (e) { setError(messageOf(e)); }
  }, [quizId]);

  useEffect(() => { if (!started.current && quizId) { started.current = true; void begin(); } }, [quizId, begin]);

  const qs = attempt?.questions ?? [];
  const total = qs.length;
  const q = qs[Math.min(i, Math.max(0, total - 1))];
  const sel = q ? toIndex(q, answers[q.id]) : null;
  const last = i + 1 >= total;

  const choose = (idx: number) => { if (q && !busy) setAnswers((a) => ({ ...a, [q.id]: fromIndex(q, idx) })); };

  const next = useCallback(async () => {
    if (!attempt || !q || sel === null || busy) return;
    setBusy(true);
    try {
      if (!last) {
        // Saved as you go, so a refresh resumes where you left off. The server never tells you whether it was right.
        await api('POST', `/api/quiz-attempts/${attempt.attemptId}/answers`, { questionId: q.id, answer: answers[q.id] });
        setI((n) => n + 1);
      } else {
        const r = await api<Result>('POST', `/api/quiz-attempts/${attempt.attemptId}/submit`, { answers });
        setResult(r);
        announce({ xp: r.xp.awarded, unlocked: r.unlocked, body: `Quiz score ${Math.round(r.score)}%.` });
        void refresh();
      }
    } catch (e) { fail(e); }
    setBusy(false);
  }, [attempt, q, sel, busy, last, answers]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (result || !q) return;
      const k = e.key.toLowerCase();
      if (['a', 'b', 'c', 'd', 'e'].includes(k) && k.charCodeAt(0) - 97 < q.options.length) choose(k.charCodeAt(0) - 97);
      if (e.key === 'Enter') { e.preventDefault(); void next(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  if (!s.session) return <Navigate to={`/auth?next=${encodeURIComponent(`/quiz/${id}`)}`} replace />;
  if (!topic) return <Navigate to="/app/map" replace />;
  if (!quizId) {
    return (
      <div className="quiz"><div className="qz-empty">
        <MoriMark size={64} /><h1 className="serif">No quiz yet.</h1>
        <p>{topic.kit && topic.kit.status === 'ready' ? `Review and save the study kit for ${topic.name} to unlock its quiz.` : `Generate a study kit for ${topic.name} to get quiz questions.`}</p>
        <Link to={`/app/topics/${id}`} className="btn btn-primary">Back to topic</Link>
      </div></div>
    );
  }
  if (error) {
    return (
      <div className="quiz"><div className="qz-empty">
        <MoriMark size={64} /><h1 className="serif">Couldn’t start the quiz.</h1><p>{error}</p>
        <button className="btn btn-primary" onClick={() => { started.current = false; void begin(); }}>Try again</button>
        <Link to={`/app/topics/${id}`} className="btn btn-outline">Back to topic</Link>
      </div></div>
    );
  }
  if (!attempt || !q) return <div className="quiz"><div className="qz-empty"><MoriMark size={64} /><p>Loading your quiz…</p></div></div>;

  const pct = result ? Math.round(result.score) : 0;
  const sub = pct >= 90 ? 'Outstanding — this counts toward Topic Master.' : pct >= 80 ? 'Strong result — this counts toward Recall Ready.' : pct >= 70 ? 'You passed. Keep building on it.' : 'Revisit the tricky concepts and try again.';

  return (
    <div className="quiz">
      <header>
        <Link to={`/app/topics/${id}`} className="exit"><Icon name="x" size={18} />Exit quiz</Link>
        <div><small>Quiz</small><b>{topic.name}</b></div>
      </header>

      <div className="prog">
        <div className="bar"><i style={{ width: `${result ? 100 : Math.round((i / total) * 100)}%` }} /></div>
        <span className="tnum">{result ? total : Math.min(i + 1, total)} / {total}</span>
      </div>

      {!result ? (
        <div className="body" key={i}>
          <h1 className="serif">{q.text}</h1>
          <div className="opts" role="radiogroup" aria-label="Answers">
            {q.options.map((text, idx) => (
              <button key={text + idx} role="radio" aria-checked={sel === idx} className={`opt${sel === idx ? ' picked' : ''}`} onClick={() => choose(idx)}>
                <span className="mark">{q.type === 'true_false' ? (idx === 0 ? 'T' : 'F') : letters[idx]}</span>
                <span className="t">{text}</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Your answers are checked when you finish — explanations come with your results.</p>
          <div className="foot">
            <button className="btn btn-primary" onClick={() => void next()} disabled={sel === null || busy}>
              {busy ? 'Saving…' : last ? 'Submit quiz' : 'Next question'}<Icon name="arrow" size={17} stroke={2.5} />
            </button>
          </div>
        </div>
      ) : (
        <div className="result rise">
          <div className="score">
            <svg width="150" height="150" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8abbe6" /><stop offset="1" stopColor="#5793ce" /></linearGradient></defs>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#DBE3E9" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#qg)" strokeWidth="3" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={100 - pct} pathLength={100} style={{ transition: 'stroke-dashoffset .8s ease' }} />
            </svg>
            <div><b className="tnum">{pct}%</b><span>{result.correct} of {result.total}</span></div>
          </div>
          <h1 className="serif">{pct >= 90 ? 'Outstanding recall.' : pct >= 70 ? 'Nicely done.' : 'Keep practicing.'}</h1>
          <p className="sub">{sub}</p>
          <div className="duo">
            <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{result.correct}</b><span>correct</span></div>
            <div className="xp"><b className="tnum">+{result.xp.awarded}</b><span>{result.xp.reason === 'capped' ? 'daily XP limit reached' : result.passed ? 'XP earned' : 'pass mark is 70% for XP'}</span></div>
          </div>
          <div className="acts">
            <button className="btn btn-primary" onClick={() => { started.current = true; void begin(); }}>Retake quiz</button>
            <Link to={`/app/topics/${id}`} className="btn btn-outline">Back to topic</Link>
            <Link to="/app/achievements" className="btn btn-outline">See achievements</Link>
          </div>

          <div className="review">
            <h2 className="serif">Review your answers</h2>
            {result.review.map((r, n) => {
              const qq = qs.find((x) => x.id === r.id);
              const label = (v: Ans | null) => (v === null || v === undefined ? 'No answer' : qq?.type === 'true_false' ? (v ? 'True' : 'False') : r.options[v as number]);
              return (
                <article key={r.id} className={`rv ${r.isCorrect ? 'ok' : 'no'}`}>
                  <header><span>{r.isCorrect ? <Icon name="check" size={14} stroke={3} /> : <Icon name="x" size={14} stroke={3} />}</span><b>{n + 1}. {r.text}</b></header>
                  <p><small>Your answer</small> {label(r.submitted)}</p>
                  {!r.isCorrect && <p><small>Correct answer</small> {label(r.correctAnswer)}</p>}
                  {r.explanation && <p className="why">{r.explanation}</p>}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
