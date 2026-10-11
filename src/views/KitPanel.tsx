'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router';
import Icon from '../components/Icon';
import { api, ApiError, messageOf } from '../lib/api';
import { fail, refresh, toast } from '../store/store';
import type { Topic } from '../store/types';
import './KitPanel.css';

interface KitCard { id: string; question: string; referenceAnswer: string; explanation: string; concept: string; difficulty: string }
interface KitQuestion { id: string; questionText: string; questionType: 'multiple_choice' | 'true_false'; options: string[]; answerKey: { type: string; correctIndex?: number; value?: boolean }; explanation: string; concept: string }
interface KitData { kit: { id: string; status: string; error: string | null; model: string | null; config?: { report?: { removedUnsupported: number; removedUnverified: number } } }; cards: KitCard[]; questions: KitQuestion[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Generate a study kit from the topic's material, then review, edit and approve it before anything is saved. */
export default function KitPanel({ topic, autoStart, onSaved }: { topic: Topic; autoStart: boolean; onSaved: () => void }) {
  const [cfg, setCfg] = useState({ cards: 12, questions: 8, difficulty: 'mixed' });
  const [data, setData] = useState<KitData | null>(null);
  const [kitId, setKitId] = useState<string | null>(topic.kit && topic.kit.status !== 'approved' ? topic.kit.id : null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [keepCards, setKeepCards] = useState<Set<string>>(new Set());
  const [keepQs, setKeepQs] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ a: '', b: '' });
  const auto = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const ready = topic.resources.filter((r) => r.status === 'ready').length;
  const processing = topic.resources.filter((r) => r.status === 'uploaded' || r.status === 'processing').length;

  const load = useCallback(async (id: string) => {
    const d = await api<KitData>('GET', `/api/study-kits/${id}`);
    if (!alive.current) return null;
    setData(d);
    return d;
  }, []);

  // Follow a kit through queued → generating → ready (or failed).
  useEffect(() => {
    if (!kitId) { setData(null); return; }
    let stop = false;
    (async () => {
      for (let n = 0; n < 150 && !stop; n++) {
        try {
          const d = await load(kitId);
          if (!d) return;
          if (d.kit.status === 'ready') {
            setKeepCards((cur) => (cur.size ? cur : new Set(d.cards.map((c) => c.id))));
            setKeepQs((cur) => (cur.size ? cur : new Set(d.questions.map((q) => q.id))));
            void refresh();
            return;
          }
          if (d.kit.status === 'failed' || d.kit.status === 'approved') { void refresh(); return; }
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) { setKitId(null); return; }
        }
        await sleep(n < 5 ? 1500 : 3000);
      }
    })();
    return () => { stop = true; };
  }, [kitId, load]);

  const start = useCallback(async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api<{ kitId: string }>('POST', `/api/topics/${topic.id}/study-kits/generate`, { config: { cards: cfg.cards, questions: cfg.questions, difficulty: cfg.difficulty } });
      setData(null); setKeepCards(new Set()); setKeepQs(new Set());
      setKitId(r.kitId);
      void refresh();
    } catch (e) { setErr(messageOf(e)); }
    setBusy(false);
  }, [topic.id, cfg]);

  // Arriving from the upload screen with ?generate=1: kick off exactly once.
  useEffect(() => {
    if (autoStart && !auto.current && !kitId && ready > 0 && processing === 0) { auto.current = true; void start(); }
  }, [autoStart, kitId, ready, processing, start]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n); };

  const approve = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await api<{ cards: number; questions: number }>('POST', `/api/study-kits/${data.kit.id}/approve`, { cardIds: [...keepCards], questionIds: [...keepQs] });
      toast({ kind: 'info', title: 'Study kit saved', body: `${plural(r.cards, 'flashcard')} and ${plural(r.questions, 'question')} added to ${topic.name}.` });
      setKitId(null); setData(null);
      await refresh();
      onSaved();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const discard = async () => {
    if (!data) return;
    setBusy(true);
    try { await api('DELETE', `/api/study-kits/${data.kit.id}`); setKitId(null); setData(null); await refresh(); } catch (e) { fail(e); }
    setBusy(false);
  };

  const [regen, setRegen] = useState<string | null>(null);
  const regenerate = async (c: KitCard) => {
    setRegen(c.id);
    try {
      const r = await api<{ card: { question: string; referenceAnswer: string; explanation: string } }>('POST', `/api/flashcards/${c.id}/regenerate`);
      setData((d) => d && { ...d, cards: d.cards.map((x) => (x.id === c.id ? { ...x, question: r.card.question, referenceAnswer: r.card.referenceAnswer, explanation: r.card.explanation } : x)) });
    } catch (e) { fail(e); }
    setRegen(null);
  };

  const saveCard = async (c: KitCard) => {
    if (!draft.a.trim() || !draft.b.trim()) return;
    try {
      await api('PATCH', `/api/flashcards/${c.id}`, { question: draft.a.trim(), referenceAnswer: draft.b.trim() });
      setData((d) => d && { ...d, cards: d.cards.map((x) => (x.id === c.id ? { ...x, question: draft.a.trim(), referenceAnswer: draft.b.trim() } : x)) });
      setEditing(null);
    } catch (e) { fail(e); }
  };
  const saveQuestion = async (q: KitQuestion) => {
    if (!draft.a.trim()) return;
    try {
      await api('PATCH', `/api/quiz-questions/${q.id}`, { questionText: draft.a.trim() });
      setData((d) => d && { ...d, questions: d.questions.map((x) => (x.id === q.id ? { ...x, questionText: draft.a.trim() } : x)) });
      setEditing(null);
    } catch (e) { fail(e); }
  };

  const status = data?.kit.status ?? (kitId ? 'queued' : 'idle');
  const running = status === 'queued' || status === 'generating';

  return (
    <section className="card-flat kit">
      <div className="kit-h"><Icon name="spark" size={22} style={{ color: 'var(--blue)' }} /><b>AI study kit</b></div>

      {(status === 'idle' || status === 'approved' || status === 'failed') && (
        <>
          {status === 'failed' && data?.kit.error && <div className="kit-err" role="alert"><Icon name="alert" size={16} stroke={2.4} /><span>{data.kit.error}</span></div>}
          <p>Generate flashcards and quiz questions grounded in your uploaded material. Every item cites where it came from, and you review everything before it’s saved.</p>
          {ready > 0 && (
            <div className="kit-cfg">
              <label>Flashcards<input className="input" type="number" min={0} max={30} value={cfg.cards} onChange={(e) => setCfg({ ...cfg, cards: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })} /></label>
              <label>Questions<input className="input" type="number" min={0} max={20} value={cfg.questions} onChange={(e) => setCfg({ ...cfg, questions: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} /></label>
              <label>Difficulty
                <select className="input" value={cfg.difficulty} onChange={(e) => setCfg({ ...cfg, difficulty: e.target.value })}>
                  <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </label>
            </div>
          )}
          {err && <div className="kit-err" role="alert"><Icon name="alert" size={16} stroke={2.4} /><span>{err}</span></div>}
          {ready > 0
            ? <button className="btn btn-dark" onClick={() => void start()} disabled={busy || processing > 0}>{status === 'failed' ? 'Try again' : 'Generate study kit'}<Icon name="spark" size={17} stroke={2.5} /></button>
            : <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-outline">{processing > 0 ? 'Material is still processing…' : 'Add material first'}</Link>}
          {processing > 0 && ready > 0 && <small className="muted" style={{ display: 'block', marginTop: 8 }}>{plural(processing, 'file')} still processing.</small>}
        </>
      )}

      {running && (
        <div aria-live="polite">
          <div className="runbar"><i /></div>
          <ul className="steps">
            <li><Icon name="check" size={16} stroke={3} />Reading {plural(topic.resources.filter((r) => r.status === 'ready').length, 'resource')}</li>
            <li className={status === 'queued' ? 'cur' : ''}>{status === 'queued' ? <Icon name="refresh" size={16} stroke={2.4} className="spin" /> : <Icon name="check" size={16} stroke={3} />}Choosing the passages to learn from</li>
            <li className={status === 'generating' ? 'cur' : ''}>{status === 'generating' ? <Icon name="refresh" size={16} stroke={2.4} className="spin" /> : <Icon name="clock" size={16} stroke={2.4} />}Drafting flashcards &amp; questions, then checking each against your text…</li>
          </ul>
          <small className="muted">This usually takes under a minute. You can leave this page — it’ll be waiting for you.</small>
        </div>
      )}

      {status === 'ready' && data && (
        <div className="rise review">
          <div className="done"><Icon name="check" size={20} stroke={2.6} />
            <span>Draft ready — {plural(data.cards.length, 'flashcard')} and {plural(data.questions.length, 'question')}. Nothing is saved until you approve it.</span>
          </div>
          {(() => {
            const r = data.kit.config?.report; const n = (r?.removedUnsupported ?? 0) + (r?.removedUnverified ?? 0);
            return <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}><Icon name="shield" size={13} stroke={2.4} /> Every item was checked against your text by a second, independent pass{n ? ` — ${plural(n, 'item')} removed because they couldn’t be confirmed` : ''}. Still skim them: you know the material best.</p>;
          })()}

          <div className="caps" style={{ margin: '18px 0 8px' }}>Flashcards · {keepCards.size} of {data.cards.length} selected</div>
          <div className="rv-list">
            {data.cards.map((c) => (
              <div key={c.id} className={`rv-item${keepCards.has(c.id) ? '' : ' off'}`}>
                <input type="checkbox" checked={keepCards.has(c.id)} onChange={() => toggle(keepCards, setKeepCards, c.id)} aria-label={`Keep: ${c.question}`} />
                {editing === c.id ? (
                  <div className="rv-edit">
                    <input className="input" value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} aria-label="Question" />
                    <textarea className="input" rows={2} value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value })} aria-label="Answer" />
                    <div className="row"><button className="btn btn-primary btn-sm" onClick={() => void saveCard(c)}>Save</button><button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button></div>
                  </div>
                ) : (
                  <div className="rv-body">
                    <small>{c.concept}</small>
                    <b>{c.question}</b>
                    <span>{c.referenceAnswer}</span>
                  </div>
                )}
                {editing !== c.id && <button className="rv-ed" aria-label="Replace with a new AI card" title="Replace with a new card" disabled={regen === c.id} onClick={() => void regenerate(c)}><Icon name="refresh" size={15} stroke={2.2} className={regen === c.id ? 'spin' : undefined} /></button>}
                {editing !== c.id && <button className="rv-ed" aria-label="Edit card" onClick={() => { setEditing(c.id); setDraft({ a: c.question, b: c.referenceAnswer }); }}><Icon name="edit" size={15} stroke={2.2} /></button>}
              </div>
            ))}
          </div>

          {data.questions.length > 0 && (
            <>
              <div className="caps" style={{ margin: '18px 0 8px' }}>Quiz questions · {keepQs.size} of {data.questions.length} selected</div>
              <div className="rv-list">
                {data.questions.map((q) => (
                  <div key={q.id} className={`rv-item${keepQs.has(q.id) ? '' : ' off'}`}>
                    <input type="checkbox" checked={keepQs.has(q.id)} onChange={() => toggle(keepQs, setKeepQs, q.id)} aria-label={`Keep: ${q.questionText}`} />
                    {editing === q.id ? (
                      <div className="rv-edit">
                        <textarea className="input" rows={2} value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} aria-label="Question" />
                        <div className="row"><button className="btn btn-primary btn-sm" onClick={() => void saveQuestion(q)}>Save</button><button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button></div>
                      </div>
                    ) : (
                      <div className="rv-body">
                        <small>{q.concept} · {q.questionType === 'true_false' ? 'True / false' : 'Multiple choice'}</small>
                        <b>{q.questionText}</b>
                        <ul className="rv-opts">
                          {q.options.map((o, k) => {
                            const right = q.answerKey.type === 'multiple_choice' ? q.answerKey.correctIndex === k : q.answerKey.value === (k === 0);
                            return <li key={o + k} className={right ? 'right' : ''}>{right ? <Icon name="check" size={12} stroke={3.4} /> : <i />}{o}</li>;
                          })}
                        </ul>
                      </div>
                    )}
                    {editing !== q.id && <button className="rv-ed" aria-label="Edit question" onClick={() => { setEditing(q.id); setDraft({ a: q.questionText, b: '' }); }}><Icon name="edit" size={15} stroke={2.2} /></button>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="rv-foot">
            <button className="btn btn-outline" onClick={() => void discard()} disabled={busy}>Discard draft</button>
            <button className="btn btn-primary" onClick={() => void approve()} disabled={busy || (keepCards.size === 0 && keepQs.size === 0)}>Save {plural(keepCards.size, 'card')}{keepQs.size ? ` & ${plural(keepQs.size, 'question')}` : ''}<Icon name="check" size={16} stroke={2.8} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
