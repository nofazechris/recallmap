'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../lib/router';
import ConceptMap, { MAX_NODES, positions } from '../components/ConceptMap';
import Constellation, { type TopicStat } from '../components/Constellation';
import Icon from '../components/Icon';
import { MoriMark } from '../components/Mori';
import NewTopic from '../components/NewTopic';
import Ring from '../components/Ring';
import { useApp } from '../store/store';
import { conceptState, conceptStats, findTopic, level, recallLabel, recommendedTopic, stateLabel, topicDue, topicRecall, type ConceptStat } from '../store/selectors';
import type { ConceptState } from '../store/types';
import './LearningMap.css';
import './LearningMapExplorer.css';

const states: { k: ConceptState; label: string }[] = [
  { k: 'mastered', label: 'Mastered' }, { k: 'strong', label: 'Strong' }, { k: 'learning', label: 'Learning' }, { k: 'due', label: 'Due' }, { k: 'unexplored', label: 'Unexplored' },
];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ZOOM_MIN = 0.6, ZOOM_MAX = 2.4;

export default function LearningMap() {
  const s = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const wantAll = params.get('view') === 'all';
  const topic = findTopic(s, params.get('topic') ?? undefined) ?? recommendedTopic(s);
  const mode: 'all' | 'topic' = wantAll || !topic ? 'all' : 'topic';

  const [sel, setSel] = useState('');
  const [filters, setFilters] = useState<Set<ConceptState>>(new Set());
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const canvas = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppress = useRef(false);

  const concepts = useMemo(() => (topic ? conceptStats(topic) : []), [topic]);
  const items: TopicStat[] = useMemo(() => s.topics.map((t) => {
    const recall = topicRecall(t), due = topicDue(t);
    return { id: t.id, name: t.name, category: t.category, cards: t.cards.length, due, concepts: t.concepts.length, recall, state: conceptState(t.cards.length, due, recall) };
  }), [s.topics]);

  // What is being laid out right now (concepts or topics) — drives counts, filters and focus.
  const nodes: { key: string; label: string; state: ConceptState }[] = mode === 'all'
    ? items.map((t) => ({ key: t.id, label: t.name, state: t.state }))
    : concepts.slice(0, MAX_NODES).map((c) => ({ key: c.name, label: c.name, state: c.state }));

  const counts = useMemo(() => {
    const m: Record<ConceptState, number> = { mastered: 0, strong: 0, learning: 0, due: 0, unexplored: 0 };
    nodes.forEach((n) => { m[n.state]++; });
    return m;
  }, [nodes]);

  const q = query.trim().toLowerCase();
  const dimmed = useMemo(() => {
    const d = new Set<string>();
    nodes.forEach((n) => {
      const byFilter = filters.size > 0 && !filters.has(n.state);
      const bySearch = q !== '' && !n.label.toLowerCase().includes(q);
      if (byFilter || bySearch) d.add(n.key);
    });
    return d;
  }, [nodes, filters, q]);

  /** Pan/zoom so a node sits in the middle of the canvas. */
  const focusOn = useCallback((key: string) => {
    const idx = nodes.findIndex((n) => n.key === key);
    const el = canvas.current;
    if (idx < 0 || !el) return;
    const [px, py] = positions(nodes.length)[idx];
    const zoom = 1.45;
    const w = el.clientWidth, h = el.clientHeight;
    setView({ zoom, x: -((px - 50) / 100) * w * zoom, y: -((py - 50) / 100) * h * zoom });
  }, [nodes]);

  // Reset selection + view when the thing being shown changes.
  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0 });
    setFilters(new Set()); setQuery('');
    if (mode === 'all') {
      const top = [...items].sort((a, b) => b.due - a.due || a.recall - b.recall)[0];
      setSel(top?.id ?? '');
    } else {
      const due = concepts.find((c) => c.state === 'due');
      setSel(due ? due.name : '__hub');
    }
  }, [mode, topic?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard: / search · f fit · +/- zoom · Esc clear
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') { if (e.key === 'Escape') { setQuery(''); (e.target as HTMLElement).blur(); } return; }
      if (e.key === '/') { e.preventDefault(); search.current?.focus(); }
      else if (e.key === 'f') setView({ zoom: 1, x: 0, y: 0 });
      else if (e.key === '+' || e.key === '=') setView((v) => ({ ...v, zoom: Math.min(ZOOM_MAX, +(v.zoom + 0.2).toFixed(2)) }));
      else if (e.key === '-') setView((v) => ({ ...v, zoom: Math.max(ZOOM_MIN, +(v.zoom - 0.2).toFixed(2)) }));
      else if (e.key === 'Escape') { setFilters(new Set()); setQuery(''); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  if (s.topics.length === 0 || !topic) {
    return (
      <div className="page" style={{ textAlign: 'center', padding: '80px 0' }}>
        <MoriMark size={64} />
        <h1 className="h1" style={{ margin: '18px 0 10px' }}>Your map starts with a topic.</h1>
        <p className="muted" style={{ marginBottom: 22 }}>Create one and add material — each concept becomes a node you can strengthen.</p>
        <NewTopic className="btn btn-primary" />
      </div>
    );
  }

  const setMode = (m: 'all' | 'topic') => setParams(m === 'all' ? { view: 'all' } : { topic: (sel && findTopic(s, sel) ? sel : topic.id) }, { replace: true });
  const toggle = (k: ConceptState) => setFilters((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const zoom = (d: number) => setView((v) => ({ ...v, zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(v.zoom + d).toFixed(2))) }));
  const pick = (key: string, focus = false) => { setSel(key); if (focus) focusOn(key); };
  const enterSearch = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const hit = nodes.find((n) => !dimmed.has(n.key));
    if (hit) pick(hit.key, true);
  };

  const onDown = (e: React.PointerEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
    suppress.current = false;
    const move = (ev: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; suppress.current = true; }
      if (d.moved) setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ── panel data ── */
  const selTopicStat = mode === 'all' ? items.find((t) => t.id === sel) : undefined;
  const selTopic = mode === 'all' ? findTopic(s, sel) : topic;
  const selConcept: ConceptStat | undefined = mode === 'topic' ? concepts.find((c) => c.name === sel) : undefined;
  const hub = mode === 'topic' && !selConcept;
  const totalDue = items.reduce((n, t) => n + t.due, 0);

  const weakest = selConcept && selTopic
    ? selTopic.cards.filter((c) => c.concept === selConcept.name).sort((a, b) => a.strength - b.strength).slice(0, 3) : [];
  const byRecall = [...concepts].sort((a, b) => a.recall - b.recall);

  return (
    <div className="lm">
      <header className="lm-head">
        <div className="ttl"><span className="serif">Learning map</span><small className="tnum">{plural(s.topics.length, 'topic')} · {plural(items.reduce((n, t) => n + t.concepts, 0), 'concept')} · Lv {level(s.user.xp)}</small></div>
        <div className="seg" role="tablist" aria-label="Map view">
          <button role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}><Icon name="grid" size={15} stroke={2.3} />All topics</button>
          <button role="tab" aria-selected={mode === 'topic'} className={mode === 'topic' ? 'on' : ''} onClick={() => setMode('topic')}><Icon name="map" size={15} stroke={2.3} />One topic</button>
        </div>
      </header>

      {mode === 'topic' && (
        <div className="lm-topics" role="tablist" aria-label="Topics">
          {s.topics.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === topic.id} className={`chip${t.id === topic.id ? ' on' : ''}`} onClick={() => setParams({ topic: t.id }, { replace: true })}>
              {t.name}{topicDue(t) > 0 && <i className="dd tnum">{topicDue(t)}</i>}
            </button>
          ))}
          <NewTopic className="chip chip-new"><Icon name="plus" size={14} stroke={2.6} />New</NewTopic>
        </div>
      )}

      <div className="lm-tools">
        <div className="filters" role="group" aria-label="Filter by state">
          {states.map(({ k, label }) => (
            <button key={k} className={`f f-${k}${filters.has(k) ? ' on' : ''}${counts[k] === 0 ? ' zero' : ''}`} aria-pressed={filters.has(k)} onClick={() => toggle(k)}>
              <i />{label}<em className="tnum">{counts[k]}</em>
            </button>
          ))}
          {(filters.size > 0 || q) && <button className="f clear" onClick={() => { setFilters(new Set()); setQuery(''); }}>Clear</button>}
        </div>
        <label className="lm-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={enterSearch} placeholder={mode === 'all' ? 'Find a topic' : 'Find a concept'} aria-label="Search the map" />
          <kbd>/</kbd>
        </label>
      </div>

      <div className="lm-body">
        <div ref={canvas} className="lm-canvas" onPointerDown={onDown} onClickCapture={(e) => { if (suppress.current) { e.stopPropagation(); e.preventDefault(); suppress.current = false; } }}
          onWheel={(e) => zoom(e.deltaY < 0 ? 0.1 : -0.1)}>
          <div className="lm-glow" aria-hidden="true" />
          <div className="lm-pan" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            {mode === 'all' ? (
              <Constellation items={items} selected={sel} onSelect={(id) => pick(id)} onOpen={(id) => setParams({ topic: id }, { replace: true })}
                hubLabel="You" hubSub={`${totalDue} due`} dimmed={dimmed} />
            ) : concepts.length ? (
              <ConceptMap hubLabel={topic.name.split(' ')[0]} hubSub={`${topicRecall(topic)}%`} concepts={concepts} links={topic.edges} selected={sel} onSelect={(n) => pick(n)} animate={false} dimmed={dimmed} />
            ) : (
              <div className="lm-none">
                <Icon name="map" size={28} /><b>No concepts yet</b><span>Add material to {topic.name} and your map will grow here.</span>
                <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary btn-sm">Add material</Link>
              </div>
            )}
          </div>

          {mode === 'topic' && concepts.find((c) => c.state === 'due') && sel !== concepts.find((c) => c.state === 'due')!.name && (
            <button className="lm-hint" onClick={() => pick(concepts.find((c) => c.state === 'due')!.name, true)}>
              <MoriMark size={34} /><span>{concepts.find((c) => c.state === 'due')!.name} is due for review — want to start there?</span>
            </button>
          )}
          {mode === 'all' && <div className="lm-hint calm"><MoriMark size={34} /><span>Double-click a topic to zoom into its map.</span></div>}

          <div className="lm-zoom">
            <button onClick={() => zoom(0.2)} aria-label="Zoom in"><Icon name="plus" size={18} /></button>
            <button onClick={() => zoom(-0.2)} aria-label="Zoom out"><Icon name="minus" size={18} /></button>
            <button onClick={() => setView({ zoom: 1, x: 0, y: 0 })} aria-label="Fit to view" title="Fit (F)"><Icon name="refresh" size={16} stroke={2.2} /></button>
            {sel && sel !== '__hub' && <button onClick={() => focusOn(sel)} aria-label="Center on selection" title="Center on selection"><Icon name="target" size={17} stroke={2.2} /></button>}
          </div>
          <div className="lm-zoomlvl tnum" aria-hidden="true">{Math.round(view.zoom * 100)}%</div>
        </div>

        <aside className="lm-panel" aria-live="polite">
          {/* ───── all-topics panel ───── */}
          {mode === 'all' && selTopicStat && selTopic && (
            <>
              <span className={`pill st-${selTopicStat.state}`}>{stateLabel[selTopicStat.state]}</span>
              <h2>{selTopicStat.name}</h2>
              <p className="d">{selTopic.category}{selTopic.goal ? ` · ${selTopic.goal}` : ''}</p>
              <div className="ringrow">
                <Ring value={selTopicStat.recall} size={66} stroke={3.6} id="map">{selTopicStat.recall}%</Ring>
                <div>recall strength<br /><b>{recallLabel(selTopicStat.recall)}</b></div>
              </div>
              <div className="three">
                <div><b className="tnum">{selTopicStat.cards}</b><span>cards</span></div>
                <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{selTopicStat.due}</b><span>due</span></div>
                <div><b className="tnum">{selTopicStat.concepts}</b><span>concepts</span></div>
              </div>
              {conceptStats(selTopic).some((c) => c.due > 0) && (
                <>
                  <div className="caps" style={{ marginBottom: 10 }}>Needs attention</div>
                  <ul className="rows">
                    {conceptStats(selTopic).filter((c) => c.due > 0).slice(0, 3).map((c) => (
                      <li key={c.name}><Link to={`/study/${selTopic.id}?concept=${encodeURIComponent(c.name)}`}><b>{c.name}</b><span className="tnum">{c.due} due · {c.recall}%</span><Icon name="chevron" size={14} /></Link></li>
                    ))}
                  </ul>
                </>
              )}
              <div className="acts">
                <button className="btn btn-primary btn-block" onClick={() => setParams({ topic: selTopic.id }, { replace: true })}>Zoom into this map<Icon name="arrow" size={17} stroke={2.5} /></button>
                {selTopicStat.cards > 0 && <Link to={`/study/${selTopic.id}`} className="btn btn-soft btn-block">{selTopicStat.due ? `Study ${plural(selTopicStat.due, 'due card')}` : 'Practice'}</Link>}
                <Link to={`/app/topics/${selTopic.id}`} className="btn btn-outline btn-block">Open topic page</Link>
              </div>
            </>
          )}
          {mode === 'all' && !selTopicStat && <p className="d">Select a topic to see how well you remember it.</p>}

          {/* ───── topic panel ───── */}
          {mode === 'topic' && (
            <>
              {hub ? <span className="pill pill-blue">Topic overview</span> : <span className={`pill st-${selConcept!.state}`}>{stateLabel[selConcept!.state]}</span>}
              <h2>{hub ? topic.name : selConcept!.name}</h2>
              <p className="d">{hub ? `${topic.goal ? `Goal: ${topic.goal}. ` : ''}${plural(concepts.length, 'concept')} across ${plural(topic.cards.length, 'flashcard')}.` : (selConcept!.desc || 'Part of your learning map.')}</p>

              <div className="ringrow">
                <Ring value={hub ? topicRecall(topic) : selConcept!.recall} size={66} stroke={3.6} id="map">{hub ? topicRecall(topic) : selConcept!.recall}%</Ring>
                <div>recall strength<br /><b>{recallLabel(hub ? topicRecall(topic) : selConcept!.recall)}</b></div>
              </div>
              <div className="three two">
                <div><b className="tnum">{hub ? topic.cards.length : selConcept!.cards}</b><span>flashcards</span></div>
                <div><b className="tnum" style={{ color: 'var(--blue-deep)' }}>{hub ? topicDue(topic) : selConcept!.due}</b><span>due today</span></div>
              </div>

              {!hub && weakest.length > 0 && (
                <>
                  <div className="caps" style={{ marginBottom: 10 }}>Weakest cards</div>
                  <ul className="cardlist">
                    {weakest.map((c) => (
                      <li key={c.id}><span>{c.q}</span><div className="bar bar-sm"><i style={{ width: `${c.strength}%` }} /></div><em className="tnum">{c.strength}%</em></li>
                    ))}
                  </ul>
                </>
              )}

              {hub && concepts.length > 0 && (
                <>
                  <div className="caps" style={{ marginBottom: 10 }}>Weakest concepts first</div>
                  <ul className="rows">
                    {byRecall.filter((c) => c.cards > 0).slice(0, 4).map((c) => (
                      <li key={c.name}><button onClick={() => pick(c.name, true)}><b>{c.name}</b><span className="tnum">{c.recall}%</span><Icon name="chevron" size={14} /></button></li>
                    ))}
                  </ul>
                </>
              )}

              {!hub && concepts.length > 1 && (
                <>
                  <div className="caps" style={{ margin: '4px 0 10px' }}>Related concepts</div>
                  <div className="rel">
                    {concepts.filter((c) => c.name !== sel).slice(0, 6).map((c) => <button key={c.name} onClick={() => pick(c.name, true)}>{c.name}</button>)}
                  </div>
                </>
              )}

              <div className="acts">
                {!hub && selConcept!.cards === 0 ? (
                  <Link to={`/app/topics/${topic.id}/upload`} className="btn btn-primary btn-block">Add material<Icon name="upload" size={17} stroke={2.5} /></Link>
                ) : (
                  <Link to={`/study/${topic.id}${!hub ? `?concept=${encodeURIComponent(selConcept!.name)}` : ''}`} className={`btn btn-primary btn-block${topic.cards.length ? '' : ' disabled'}`} aria-disabled={!topic.cards.length}>
                    {hub ? 'Study this topic' : `Study ${selConcept!.name}`}<Icon name="arrow" size={17} stroke={2.5} />
                  </Link>
                )}
                {topic.questions.length > 0 && <button className="btn btn-soft btn-block" onClick={() => nav(`/quiz/${topic.id}`)}>Take the quiz</button>}
                <Link to={`/app/topics/${topic.id}`} className="btn btn-outline btn-block">Open topic page</Link>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
