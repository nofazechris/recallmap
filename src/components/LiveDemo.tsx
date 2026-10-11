'use client';

import { useMemo, useState } from 'react';
import { Link } from '../lib/router';
import ConceptMap from './ConceptMap';
import Icon from './Icon';
import { MoriMark } from './Mori';
import Ring from './Ring';
import { AnswerInput, YouWrote } from './TypeAnswer';
import { grade } from '../lib/grade';
import { conceptState, recallLabel, stateLabel, type ConceptStat } from '../store/selectors';
import type { Rating } from '../store/types';
import './LiveDemo.css';

/**
 * Self-contained, sample-data version of the learning map for the landing page.
 * It uses the real ConceptMap and the same recall rules as the app, but its state
 * is local — visitors can study a card and watch the map change without an account.
 */
interface DCard { q: string; a: string; strength: number; due: boolean }
interface DConcept { name: string; desc: string; cards: DCard[] }

const initial: DConcept[] = [
  { name: 'Vectors', desc: 'Consistently high scores across assessments. Well retained.', cards: [
    { q: 'What is the dot product of perpendicular vectors?', a: 'Zero.', strength: 95, due: false },
    { q: 'How do you find a vector’s magnitude?', a: 'The square root of the sum of its squared components.', strength: 93, due: false } ] },
  { name: 'Derivatives', desc: 'Solid grasp of the core ideas; edge cases still need reinforcement.', cards: [
    { q: 'What does a derivative measure?', a: 'The instantaneous rate of change — the slope of the tangent at a point.', strength: 85, due: false },
    { q: 'State the power rule.', a: 'd/dx xⁿ = n·xⁿ⁻¹', strength: 82, due: false } ] },
  { name: 'Limits', desc: 'Your recall is slipping here — a quick session today brings it back.', cards: [
    { q: 'What does lim x→a f(x) = L mean?', a: 'f(x) gets arbitrarily close to L as x approaches a.', strength: 66, due: true },
    { q: 'When does a limit fail to exist?', a: 'When the left and right limits disagree, or the function diverges.', strength: 62, due: true } ] },
  { name: 'Proofs', desc: 'Recently started. Keep practising induction and contradiction.', cards: [
    { q: 'How does proof by induction work?', a: 'Prove a base case, then show that n implies n + 1.', strength: 61, due: false } ] },
  { name: 'Series', desc: 'Not started yet. Add material to generate a study kit for this concept.', cards: [] },
];

const stats = (list: DConcept[]): ConceptStat[] => list.map((c) => {
  const due = c.cards.filter((x) => x.due).length;
  const recall = c.cards.length ? Math.round(c.cards.reduce((n, x) => n + x.strength, 0) / c.cards.length) : 0;
  return { name: c.name, desc: c.desc, cards: c.cards.length, due, recall, state: conceptState(c.cards.length, due, recall) };
});

const delta: Record<Rating, number> = { again: -15, hard: 3, good: 11, easy: 16 };
const days: Record<Rating, string> = { again: '< 1 day', hard: '2 days', good: '4 days', easy: '9 days' };

export default function LiveDemo() {
  const [concepts, setConcepts] = useState(initial);
  const [sel, setSel] = useState('Limits');
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [xp, setXp] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const list = useMemo(() => stats(concepts), [concepts]);
  const cur = list.find((c) => c.name === sel);
  const hub = sel === '__hub' || !cur;
  const explored = list.filter((c) => c.cards > 0);
  const overall = Math.round(explored.reduce((n, c) => n + c.recall, 0) / Math.max(1, explored.length));
  const dueConcept = list.find((c) => c.state === 'due');

  // The card to review: the first due card, otherwise the weakest.
  const source = concepts.find((c) => c.name === cur?.name);
  const idx = source ? (() => {
    const d = source.cards.findIndex((x) => x.due);
    if (d >= 0) return d;
    return source.cards.reduce((best, x, i, a) => (x.strength < a[best].strength ? i : best), 0);
  })() : -1;
  const card = source && idx >= 0 ? source.cards[idx] : undefined;

  const choose = (name: string) => { setSel(name); setFlipped(false); setTyped(''); };
  const rate = (r: Rating) => {
    if (!source || idx < 0) return;
    setConcepts((all) => all.map((c) => c.name !== source.name ? c : {
      ...c, cards: c.cards.map((x, i) => i !== idx ? x : {
        ...x, strength: Math.max(10, Math.min(99, x.strength + delta[r])), due: r === 'again',
      }),
    }));
    setReviewed((n) => n + 1);
    setXp((n) => n + (r === 'good' || r === 'easy' ? 12 : 4));
    setFlipped(false);
    setTyped('');
  };
  const reset = () => { setConcepts(initial); setSel('Limits'); setFlipped(false); setTyped(''); setXp(0); setReviewed(0); };
  const match = card ? grade(typed, card.a) : null;

  return (
    <div className="demo">
      <div className="demo-top">
        <span className="chip-live"><i />Live demo · sample data</span>
        <div className="demo-meta">
          <span className="tnum"><b>{reviewed}</b> reviewed</span>
          <span className="tnum"><b>+{xp}</b> XP</span>
          {reviewed > 0 && <button onClick={reset}>Reset</button>}
        </div>
      </div>

      <div className="demo-body">
        <div className="demo-canvas">
          <div className="glow" aria-hidden="true" />
          <ConceptMap hubLabel="Calculus" hubSub={`${overall}%`} concepts={list} selected={sel} onSelect={choose} animate />
          {dueConcept && sel !== dueConcept.name && (
            <button className="hint" onClick={() => choose(dueConcept.name)}>
              <MoriMark size={32} /><span>{dueConcept.name} is due for review — try a card.</span>
            </button>
          )}
          {!dueConcept && (
            <div className="hint calm"><MoriMark size={32} /><span>Nothing’s due. That’s what a healthy map looks like.</span></div>
          )}
        </div>

        <aside className="demo-panel" aria-live="polite">
          {hub ? (
            <>
              <span className="pill pill-blue">Topic overview</span>
              <h3>Calculus</h3>
              <p className="d">Click any concept on the map. Rate a few cards and watch it change state in real time.</p>
            </>
          ) : (
            <>
              <span className={`pill st-${cur.state}`}>{stateLabel[cur.state]}</span>
              <h3>{cur.name}</h3>
              <p className="d">{cur.desc}</p>
            </>
          )}

          <div className="ringrow">
            <Ring value={hub ? overall : cur.recall} size={58} stroke={3.6} id="demo">{hub ? overall : cur.recall}%</Ring>
            <div>recall strength<br /><b>{recallLabel(hub ? overall : cur.recall)}</b></div>
          </div>

          {!hub && cur.cards === 0 && (
            <div className="cta-box">
              <Icon name="upload" size={20} />
              <p>This concept is unexplored. In RecallMap you’d drop in notes and get a study kit for it.</p>
              <Link to="/auth?mode=signup" className="btn btn-primary btn-sm">Add your own material</Link>
            </div>
          )}

          {!hub && card && (
            <div className="mini">
              <div className="caps">Review a card · {cur.due > 0 ? `${cur.due} due` : 'practice'}</div>
              <div className="flip" aria-label="Flashcard">
                <span className="fi" style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}>
                  <span className="face front"><b>{card.q}</b><em><Icon name="edit" size={12} stroke={2.2} />Type your answer to turn the card</em></span>
                  <span className="face back"><small>Answer</small><b>{card.a}</b></span>
                </span>
              </div>
              {flipped && match ? (
                <>
                  <YouWrote typed={typed} match={match} />
                  <div className="rate">
                    {(['again', 'hard', 'good', 'easy'] as Rating[]).map((r) => (
                      <button key={r} className={`${r}${match.suggested === r ? ' sug' : ''}`} onClick={() => rate(r)}><span>{r[0].toUpperCase() + r.slice(1)}</span><small>{days[r]}</small></button>
                    ))}
                  </div>
                </>
              ) : <AnswerInput value={typed} onChange={setTyped} onCheck={() => setFlipped(true)} />}
            </div>
          )}

          {hub && (
            <div className="hubacts">
              {dueConcept && <button className="btn btn-soft btn-sm" onClick={() => choose(dueConcept.name)}>Start with {dueConcept.name}<Icon name="arrow" size={15} stroke={2.5} /></button>}
              <Link to="/auth?mode=signup" className="btn btn-primary btn-sm">Build my own map<Icon name="arrow" size={15} stroke={2.5} /></Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
