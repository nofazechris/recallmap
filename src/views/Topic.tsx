'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from '../lib/router';
import ConceptMap from '../components/ConceptMap';
import Icon from '../components/Icon';
import Ring from '../components/Ring';
import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { fail, refresh, toast, useApp } from '../store/store';
import KitPanel from './KitPanel';
import { conceptStats, findTopic, recallLabel, stateLabel, topicDue, topicRecall } from '../store/selectors';
import type { Topic as TopicT } from '../store/types';
import './Topic.css';
import './TopicHub.css';

type Tab = 'overview' | 'cards' | 'quiz' | 'material';
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'cards', label: 'Flashcards' }, { id: 'quiz', label: 'Quiz' }, { id: 'material', label: 'Material' },
];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const minutes = (cards: number) => Math.max(1, Math.round((cards * 20) / 60));

const daysLeft = (date?: string) => {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  const d = Math.ceil((t - Date.now()) / 864e5);
  return d >= 0 ? d : null;
};

export default function Topic() {
  const { id } = useParams();
  const s = useApp();
  const [params, setParams] = useSearchParams();
  const topic = findTopic(s, id);
  const tabParam = params.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : params.get('generate') === '1' ? 'material' : 'overview');
  const autoStart = params.get('generate') === '1';

  if (!topic) return <Navigate to="/app/map" replace />;

  const pick = (t: Tab) => { setTab(t); const p = new URLSearchParams(params); p.set('tab', t); setParams(p, { replace: true }); };
  const recall = topicRecall(topic);
  const due = topicDue(topic);
  const hasKit = topic.cards.length > 0;
  const left = daysLeft(topic.targetDate);

  return (
    <div className="page topic">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/app">Home</Link><span>/</span><Link to="/app/map">My Learning</Link><span>/</span><b>{topic.name}</b>
      </nav>

      {/* ───── banner ───── */}
      <header className="banner">
        <div className="bg" aria-hidden="true" />
        <div className="b-main">
          <div className="tags">
            <span className="pill pill-mist">{topic.category}</span>
            {left !== null && <span className="pill pill-lime tnum"><Icon name="calendar" size={12} stroke={2.6} />{left === 0 ? 'Due today' : plural(left, 'day') + ' left'}</span>}
            {due > 0 && <span className="pill pill-clay tnum">{due} due</span>}
          </div>
          <h1 className="h1">{topic.name}</h1>
          <p className="goal">{topic.goal ? `Goal: ${topic.goal}` : 'No goal set yet'}{topic.targetDate ? ` · by ${topic.targetDate}` : ''}</p>
          <div className="b-acts">
            {hasKit
              ? <Link to={`/study/${topic.id}`} className="btn btn-primary">{due ? `Study ${plural(due, 'due card')}` : 'Practice'}<Icon name="arrow" size={17} stroke={2.5} /></Link>
              : <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary">Add material<Icon name="upload" size={17} stroke={2.5} /></Link>}
            {topic.quizId && <Link to={`/quiz/${topic.id}`} className="btn btn-ghost">Take the quiz</Link>}
          </div>
        </div>
        <dl className="b-stats">
          <div className="ringbox"><Ring value={recall} size={74} stroke={3.6} id="topic">{recall}%</Ring><span>recall<br /><b>{recallLabel(recall)}</b></span></div>
          <div><dt>Flashcards</dt><dd className="tnum">{topic.cards.length}</dd></div>
          <div><dt>Questions</dt><dd className="tnum">{topic.questions.length}</dd></div>
          <div><dt>Sessions</dt><dd className="tnum">{topic.sessions}</dd></div>
        </dl>
      </header>

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>
            {t.label}{t.id === 'cards' && topic.cards.length > 0 && <em className="tnum">{topic.cards.length}</em>}{t.id === 'material' && topic.kit?.status === 'ready' && <em className="tnum">Review</em>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview topic={topic} onMaterial={() => pick('material')} />}
      {tab === 'cards' && <Cards topic={topic} />}
      {tab === 'quiz' && <QuizTab topic={topic} onMaterial={() => pick('material')} />}
      {tab === 'material' && <Material topic={topic} autoStart={autoStart} onSaved={() => { const p = new URLSearchParams(params); p.delete('generate'); p.set('tab', 'cards'); setParams(p, { replace: true }); setTab('cards'); }} />}
    </div>
  );
}

/* ───────────────────────── overview ───────────────────────── */

function Overview({ topic, onMaterial }: { topic: TopicT; onMaterial: () => void }) {
  const nav = useNavigate();
  const concepts = useMemo(() => conceptStats(topic), [topic]);
  const due = topicDue(topic);
  const [sel, setSel] = useState<string>(() => concepts.find((c) => c.state === 'due')?.name ?? '');
  const cur = concepts.find((c) => c.name === sel);
  const dueBy = concepts.filter((c) => c.due > 0).sort((a, b) => b.due - a.due);

  if (topic.cards.length === 0) {
    return (
      <div className="empty-card rise">
        <Icon name="spark" size={28} style={{ color: 'var(--blue)' }} />
        <b>Start by adding material</b>
        <p>Drop in a PDF or paste notes and RecallMap drafts a study kit you can review before it’s saved.</p>
        <button className="btn btn-primary btn-sm" onClick={onMaterial}>Add material</button>
      </div>
    );
  }

  return (
    <div className="ov rise">
      <div className="ov-left">
        <section className="card-flat plan">
          <div className="caps">Today’s plan</div>
          {due > 0 ? (
            <>
              <div className="plan-h"><b className="tnum">{plural(due, 'card')}</b><span>due · about {plural(minutes(due), 'minute')}</span></div>
              <div className="plan-chips">
                {dueBy.map((c) => (
                  <Link key={c.name} to={`/study/${topic.id}?concept=${encodeURIComponent(c.name)}`} className="pchip">
                    {c.name}<em className="tnum">{c.due}</em>
                  </Link>
                ))}
              </div>
              <Link to={`/study/${topic.id}`} className="btn btn-primary btn-sm">Start session<Icon name="arrow" size={15} stroke={2.5} /></Link>
            </>
          ) : (
            <>
              <div className="plan-h"><b>All caught up</b><span>Nothing is due right now.</span></div>
              <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>A short practice round on your weakest cards keeps them fresh.</p>
              <Link to={`/study/${topic.id}`} className="btn btn-soft btn-sm">Practice anyway</Link>
            </>
          )}
        </section>

        <Schedule topic={topic} />
        <History topic={topic} />
      </div>

      <section className="card-flat ov-map">
        <div className="ov-map-h"><div className="caps">Concept map</div><Link to={`/app/map?topic=${topic.id}`} className="more">Open full map →</Link></div>
        <div className="canvas">
          <div className="gl" aria-hidden="true" />
          <ConceptMap hubLabel={topic.name.split(' ')[0]} hubSub={`${topicRecall(topic)}%`} concepts={concepts} links={topic.edges} selected={sel} onSelect={(n) => setSel(n === '__hub' ? '' : n)} animate={false} />
        </div>
        <div className="selbar">
          {cur ? (
            <>
              <div><span className={`pill st-${cur.state}`}>{stateLabel[cur.state]}</span><b>{cur.name}</b><small className="tnum">{cur.recall}% · {plural(cur.cards, 'card')} · {cur.due} due</small></div>
              {cur.cards > 0
                ? <button className="btn btn-primary btn-sm" onClick={() => nav(`/study/${topic.id}?concept=${encodeURIComponent(cur.name)}`)}>Study<Icon name="arrow" size={15} stroke={2.5} /></button>
                : <button className="btn btn-outline btn-sm" onClick={onMaterial}>Add material</button>}
            </>
          ) : <small>Select a concept to see how well you remember it.</small>}
        </div>
      </section>
    </div>
  );
}

function Schedule({ topic }: { topic: TopicT }) {
  const groups = new Map<number, { concepts: Set<string>; n: number }>();
  topic.cards.forEach((c) => {
    const k = c.due ? 0 : c.dueIn;
    const g = groups.get(k) ?? { concepts: new Set<string>(), n: 0 };
    g.concepts.add(c.concept); g.n++;
    groups.set(k, g);
  });
  const rows = [...groups.entries()].sort((a, b) => a[0] - b[0]).slice(0, 4);
  const label = (k: number) => (k === 0 ? 'Due today' : k === 1 ? 'Tomorrow' : `In ${k} days`);
  const dot = (k: number) => (k === 0 ? 'var(--clay)' : k <= 2 ? 'var(--blue)' : 'var(--mist)');
  return (
    <section className="card-flat sc-card">
      <div className="caps">Review schedule</div>
      <div className="sched">
        {rows.map(([k, g]) => (
          <div key={k}><i style={{ background: dot(k) }} /><b>{label(k)}</b><span>{[...g.concepts].slice(0, 3).join(' · ')}</span><em className="tnum">{plural(g.n, 'card')}</em></div>
        ))}
      </div>
    </section>
  );
}

function History({ topic }: { topic: TopicT }) {
  return (
    <section className="card-flat sc-card">
      <div className="caps">Quiz history</div>
      {topic.assessments.length === 0
        ? <p className="muted" style={{ fontSize: 14 }}>No quizzes taken yet.</p>
        : <div className="scores">{topic.assessments.map((a, i) => <span key={i} className={`pill tnum ${a >= 90 ? 'pill-lime' : a >= 70 ? 'pill-blue' : 'pill-dim'}`}>{a}%</span>)}</div>}
    </section>
  );
}

/* ───────────────────────── flashcards ───────────────────────── */

interface OwnerCard { id: string; question: string; referenceAnswer: string; explanation: string; concept: string; status: string }

function Cards({ topic }: { topic: TopicT }) {
  const list = useFetch<{ cards: OwnerCard[] }>(`/api/topics/${topic.id}/flashcards`);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [concept, setConcept] = useState('');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ q: '', a: '' });
  const [confirm, setConfirm] = useState<string | null>(null);

  // Merge the owner's text with live schedule state (due / strength) from the snapshot.
  const state = new Map(topic.cards.map((c) => [c.id, c]));
  const cards = (list.data?.cards ?? []).filter((c) => c.status === 'approved' && state.has(c.id)).map((c) => ({ ...c, ...state.get(c.id)! , q: c.question, a: c.referenceAnswer }));
  const names = [...new Set(cards.map((c) => c.concept))];
  const shown = cards.filter((c) => (filter === 'All' || c.concept === filter) && (!onlyDue || c.due)
    && (!search.trim() || (c.q + c.a).toLowerCase().includes(search.trim().toLowerCase())));
  const reload = async () => { await Promise.all([list.reload(), refresh()]); };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || !a.trim()) return;
    try {
      await api('POST', `/api/topics/${topic.id}/flashcards`, { question: q.trim(), referenceAnswer: a.trim(), concept: concept.trim() || 'General' });
      toast({ kind: 'info', title: 'Card added', body: 'It’s due for review right away.' });
      setQ(''); setA(''); setConcept(''); setOpen(false);
      await reload();
    } catch (err) { fail(err); }
  };
  const save = async (id: string) => {
    if (!draft.q.trim() || !draft.a.trim()) return;
    try { await api('PATCH', `/api/flashcards/${id}`, { question: draft.q.trim(), referenceAnswer: draft.a.trim() }); setEditing(null); await reload(); } catch (err) { fail(err); }
  };
  const remove = async (id: string) => {
    try { await api('DELETE', `/api/flashcards/${id}`); setConfirm(null); await reload(); } catch (err) { fail(err); }
  };

  return (
    <div className="rise">
      <div className="cards-bar">
        <label className="csearch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cards" aria-label="Search cards" />
        </label>
        <button className={`chip${onlyDue ? ' on' : ''}`} onClick={() => setOnlyDue((v) => !v)} aria-pressed={onlyDue}>Due only</button>
        <button className="btn btn-soft btn-sm" onClick={() => setOpen((o) => !o)}><Icon name={open ? 'x' : 'plus'} size={15} stroke={2.6} />{open ? 'Close' : 'New card'}</button>
      </div>

      {names.length > 1 && (
        <div className="cfilters" role="tablist" aria-label="Concept filter">
          {['All', ...names].map((n) => (
            <button key={n} role="tab" aria-selected={filter === n} className={`chip${filter === n ? ' on' : ''}`} onClick={() => setFilter(n)}>{n}</button>
          ))}
        </div>
      )}

      {open && (
        <form className="card-flat addcard" onSubmit={(e) => void add(e)}>
          <input className="input" placeholder="Concept (e.g. Alkanes)" value={concept} onChange={(e) => setConcept(e.target.value)} list="concepts" maxLength={40} />
          <datalist id="concepts">{topic.concepts.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          <input className="input" placeholder="Question" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} required />
          <textarea className="input" rows={2} placeholder="Answer" value={a} onChange={(e) => setA(e.target.value)} maxLength={1000} required />
          <button className="btn btn-primary btn-sm" type="submit" style={{ alignSelf: 'flex-end' }}>Add card</button>
        </form>
      )}

      {list.error ? (
        <div className="empty-card"><b>Couldn’t load your cards</b><p>{list.error}</p><button className="btn btn-outline btn-sm" onClick={() => void list.reload()}>Try again</button></div>
      ) : topic.cards.length === 0 ? (
        <div className="empty-card"><b>No flashcards yet</b><p>Generate a kit from your material, or add a card yourself.</p></div>
      ) : shown.length === 0 && !list.loading ? (
        <div className="empty-card"><b>No cards match</b><p>Try a different filter or search.</p>
          <button className="btn btn-outline btn-sm" onClick={() => { setFilter('All'); setSearch(''); setOnlyDue(false); }}>Clear filters</button></div>
      ) : (
        <div className="cardgrid">
          {shown.map((c) => (
            <div key={c.id} className="card-flat fc">
              <div className="fc-top"><small>{c.concept}</small>{c.due && <span className="duepill">Due</span>}</div>
              {editing === c.id ? (
                <div className="fc-edit">
                  <input className="input" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} aria-label="Question" />
                  <textarea className="input" rows={2} value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} aria-label="Answer" />
                  <div className="row"><button className="btn btn-primary btn-sm" onClick={() => void save(c.id)}>Save</button><button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              ) : (
                <>
                  <b>{c.q}</b>
                  <span>{c.a}</span>
                  <div className="fc-foot">
                    <div className="bar bar-sm" title={`Recall strength ${c.strength}%`}><i style={{ width: `${c.strength}%` }} /></div>
                    <em className="tnum">{c.strength}%</em>
                    <button aria-label="Edit card" onClick={() => { setEditing(c.id); setDraft({ q: c.q, a: c.a }); setConfirm(null); }}><Icon name="edit" size={15} stroke={2.2} /></button>
                    <button aria-label={confirm === c.id ? 'Confirm delete' : 'Delete card'} className={confirm === c.id ? 'danger' : ''}
                      onClick={() => { if (confirm === c.id) void remove(c.id); else setConfirm(c.id); }}>
                      {confirm === c.id ? <span>Delete?</span> : <Icon name="trash" size={15} stroke={2.2} />}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── quiz ───────────────────────── */

function QuizTab({ topic, onMaterial }: { topic: TopicT; onMaterial: () => void }) {
  const nav = useNavigate();
  if (!topic.quizId || topic.questions.length === 0) {
    return <div className="empty-card rise"><b>No quiz questions yet</b><p>{topic.kit?.status === 'ready' ? 'Your draft study kit includes quiz questions — review and save it to unlock the quiz.' : 'Generate a study kit from your material to get a quiz.'}</p><button className="btn btn-primary btn-sm" onClick={onMaterial}>{topic.kit?.status === 'ready' ? 'Review the draft' : 'Go to material'}</button></div>;
  }
  const best = topic.assessments.length ? Math.max(...topic.assessments) : null;
  return (
    <div className="quiz-tab rise">
      <div className="card-flat qprev">
        <div className="caps" style={{ marginBottom: 12 }}>{plural(topic.questions.length, 'question')} · answers are revealed after you submit</div>
        <ol className="qlist">
          {topic.questions.map((q) => <li key={q.id}><small>{q.concept}</small>{q.prompt}</li>)}
        </ol>
        <div className="q-acts">
          <button className="btn btn-primary btn-sm" onClick={() => nav(`/quiz/${topic.id}`)}>Take the quiz<Icon name="arrow" size={15} stroke={2.5} /></button>
        </div>
      </div>
      <aside className="card-flat qside">
        <div className="caps">Your results</div>
        <div className="best"><b className="tnum">{best === null ? '—' : `${best}%`}</b><span>best score</span></div>
        <p className="muted">{plural(topic.assessments.length, 'quiz', 'quizzes')} taken. Two spaced scores of 80%+ earn Recall Ready; two of 90%+ earn Topic Master.</p>
        {topic.assessments.length > 0 && <div className="scores">{topic.assessments.slice(-8).map((a, k) => <span key={k} className={`pill tnum ${a >= 90 ? 'pill-lime' : a >= 70 ? 'pill-blue' : 'pill-dim'}`}>{a}%</span>)}</div>}
      </aside>
    </div>
  );
}

/* ───────────────────────── material ───────────────────────── */

function Material({ topic, autoStart, onSaved }: { topic: TopicT; autoStart: boolean; onSaved: () => void }) {
  const retry = async (id: string) => { try { await api('POST', `/api/resources/${id}/process`); await refresh(); } catch (e) { fail(e); } };
  const del = async (id: string) => { try { await api('DELETE', `/api/resources/${id}`); await refresh(); } catch (e) { fail(e); } };

  // While anything is processing, keep the library fresh.
  const working = topic.resources.some((r) => r.status === 'uploaded' || r.status === 'processing');
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [working]);

  return (
    <div className="rise">
      <Link to={`/app/topics/${topic.id}/upload`} className="dropzone">
        <span className="ico"><Icon name="upload" size={24} /></span>
        <b>Drop a PDF, notes, or paste text</b>
        <small>We’ll extract the text and build a study kit from it. Max 15 MB.</small>
      </Link>

      <div className="caps" style={{ marginBottom: 12 }}>Resource library</div>
      <div className="reslist">
        {topic.resources.map((r) => (
          <div key={r.id} className="card-flat res">
            <span className={`ext ${r.ext === 'PDF' ? 'pdf' : ''}`}>{r.ext}</span>
            <div>
              <b>{r.name}</b>
              <small>
                Added {new Date(r.added).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {r.status === 'ready' && (r.cards + r.questions > 0 ? ` · ${plural(r.cards, 'flashcard')}, ${plural(r.questions, 'question')} generated` : ' · ready to generate')}
                {r.status === 'failed' && r.error ? ` · ${r.error}` : ''}
              </small>
            </div>
            {r.status === 'ready' && <span className="pill pill-lime"><Icon name="check" size={12} stroke={3} />Processed</span>}
            {(r.status === 'uploaded' || r.status === 'processing') && <span className="pill pill-blue"><Icon name="refresh" size={12} stroke={2.6} className="spin" />Processing</span>}
            {r.status === 'failed' && <button className="btn btn-outline btn-sm" onClick={() => void retry(r.id)}>Retry</button>}
            <button className="rm" aria-label={`Remove ${r.name}`} onClick={() => void del(r.id)}><Icon name="trash" size={16} stroke={2.2} /></button>
          </div>
        ))}
        {topic.resources.length === 0 && <div className="card-flat res empty">No resources yet. Add your first one above — the study kit is grounded in what you upload.</div>}
      </div>

      <KitPanel topic={topic} autoStart={autoStart} onSaved={onSaved} />
    </div>
  );
}
