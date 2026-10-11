'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';
import Ring from './Ring';
import { AnswerInput, YouWrote } from './TypeAnswer';
import { grade } from '../lib/grade';
import './Walkthrough.css';

/**
 * Landing-page product walkthrough: four steps, each showing the real screen it describes.
 * Auto-advances until the visitor interacts or hovers; never auto-advances with reduced motion.
 */
const steps = [
  { icon: 'upload', title: 'Add your material', body: 'Drop in PDFs, paste notes, or point at a public page. Everything the kit says is grounded in what you add.', url: 'recallmap.app/topics/organic-chemistry/upload' },
  { icon: 'spark', title: 'Review the study kit', body: 'AI drafts flashcards and quiz questions from your material. You keep what’s good and skip the rest before anything is saved.', url: 'recallmap.app/topics/organic-chemistry' },
  { icon: 'book', title: 'Recall it', body: 'Flip a card, rate how it went. Hard cards return tomorrow; easy ones wait over a week.', url: 'recallmap.app/study/organic-chemistry' },
  { icon: 'map', title: 'Watch it stick', body: 'Every rating moves your map. See what’s mastered, what’s fading, and exactly what to revisit today.', url: 'recallmap.app/app' },
] as const;

const AUTO_MS = 7000;

export default function Walkthrough() {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const running = auto && !hover && !reduced;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI((n) => (n + 1) % steps.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [i, running]);

  const pick = (n: number) => { setI(n); setAuto(false); };

  return (
    <div className="wt" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ol className="wt-steps" role="tablist" aria-label="Product walkthrough">
        {steps.map((s, n) => (
          <li key={s.title}>
            <button role="tab" aria-selected={n === i} className={n === i ? 'on' : ''} onClick={() => pick(n)}>
              <span className="ico"><Icon name={s.icon} size={20} stroke={2.3} /></span>
              <span className="tx">
                <small>Step {n + 1}</small>
                <b>{s.title}</b>
                <span className="body">{s.body}</span>
              </span>
              {n === i && running && <i className="timer" key={`t${i}`} style={{ animationDuration: `${AUTO_MS}ms` }} />}
            </button>
          </li>
        ))}
      </ol>

      <div className="wt-window" role="tabpanel" aria-live="polite">
        <div className="wt-bar"><i /><i /><i /><span>{steps[i].url}</span><em className="pill pill-lime">Illustrative</em></div>
        <div className="wt-body" key={i}>
          {i === 0 && <Upload />}
          {i === 1 && <Kit />}
          {i === 2 && <Recall />}
          {i === 3 && <Progress />}
        </div>
      </div>
    </div>
  );
}

function Upload() {
  const files = [
    { ext: 'PDF', name: 'Ch.3 — Functional Groups.pdf', note: '24 flashcards · 6 questions', cls: 'pdf' },
    { ext: 'MD', name: 'Pasted notes — isomerism', note: 'Extracting text…', cls: '' },
    { ext: 'URL', name: 'web: khanacademy.org/esters', note: 'Reading…', cls: 'url' },
  ];
  return (
    <div className="s-up">
      <div className="drop"><span className="ico"><Icon name="upload" size={22} /></span><b>Drop a file <em>or paste text</em></b><small>PDF, TXT, Markdown, DOCX · up to 20 MB</small></div>
      {files.map((f, n) => (
        <div key={f.name} className="file" style={{ animationDelay: `${n * 0.18}s` }}>
          <span className={`ext ${f.cls}`}>{f.ext}</span>
          <div><b>{f.name}</b><small>{f.note}</small>{n > 0 && <div className="bar bar-sm"><i className={`fill f${n}`} /></div>}</div>
          {n === 0 ? <span className="pill pill-lime"><Icon name="check" size={11} stroke={3} />Processed</span> : <Icon name="refresh" size={16} className="spin" style={{ color: 'var(--blue)' }} />}
        </div>
      ))}
    </div>
  );
}

const draft = [
  { c: 'Functional groups', q: 'What functional group defines a carboxylic acid?' },
  { c: 'Isomerism', q: 'What are structural isomers?' },
  { c: 'Reactions', q: 'What does esterification produce?' },
  { c: 'Nomenclature', q: 'What suffix denotes an aldehyde?' },
];

function Kit() {
  const [keep, setKeep] = useState<boolean[]>([true, true, true, false]);
  const n = keep.filter(Boolean).length;
  return (
    <div className="s-kit">
      <div className="done"><Icon name="check" size={18} stroke={2.6} /><span>Drafted {draft.length} flashcards from your notes.</span></div>
      {draft.map((d, k) => (
        <button key={d.q} className={`card-r${keep[k] ? ' on' : ''}`} onClick={() => setKeep((a) => a.map((x, j) => (j === k ? !x : x)))} aria-pressed={keep[k]}>
          <span className="chk">{keep[k] && <Icon name="check" size={12} stroke={3.4} />}</span>
          <span><small>{d.c}</small><b>{d.q}</b></span>
        </button>
      ))}
      <div className="foot"><span className="tnum">{n} of {draft.length} kept</span><span className="btn btn-primary btn-sm" aria-hidden="true">Save to topic</span></div>
    </div>
  );
}

function Recall() {
  const [flip, setFlip] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const match = grade(typed, 'The carboxyl group (–COOH).');
  const times: Record<string, string> = { Again: 'later today', Hard: 'in 2 days', Good: 'in 4 days', Easy: 'in 9 days' };
  return (
    <div className="s-rec">
      <div className="caps" style={{ textAlign: 'center' }}>Flashcard · Functional groups</div>
      <div className="flip" aria-label="Flashcard">
        <span className="fi" style={{ transform: flip ? 'rotateY(180deg)' : 'none' }}>
          <span className="face front"><b>What functional group defines a carboxylic acid?</b><em><Icon name="edit" size={12} stroke={2.2} />Type your answer to turn the card</em></span>
          <span className="face back"><small>Answer</small><b>The carboxyl group (–COOH).</b><span>A carbonyl and a hydroxyl on the same carbon.</span></span>
        </span>
      </div>
      {!flip && <AnswerInput value={typed} onChange={setTyped} onCheck={() => setFlip(true)} />}
      {flip && !done && (
        <>
          <YouWrote typed={typed} match={match} />
          <div className="rate">{Object.keys(times).map((r) => <button key={r} className={`${r.toLowerCase()}${match.suggested === r.toLowerCase() ? ' sug' : ''}`} onClick={() => setDone(r)}><span>{r}</span></button>)}</div>
        </>
      )}
      {done && (
        <>
          <p className="after"><Icon name="check" size={14} stroke={3} />Nice — you’ll see this again <b>{times[done]}</b>.</p>
          <button className="again-link" onClick={() => { setFlip(false); setDone(null); setTyped(''); }}>Try it again</button>
        </>
      )}
    </div>
  );
}

const bars = [['Alkanes', 95, 'm'], ['Isomerism', 90, 's'], ['Functional groups', 82, 's'], ['Nomenclature', 86, 's'], ['Reactions', 71, 'd']] as const;

function Progress() {
  return (
    <div className="s-prog">
      <div className="top">
        <Ring value={82} size={64} stroke={3.6} id="wt">82%</Ring>
        <div><small>Organic Chemistry</small><b>Recall is holding strong</b></div>
        <span className="pill pill-clay tnum">6 due today</span>
      </div>
      <div className="bars">
        {bars.map(([n, v, k], j) => (
          <div key={n}><span>{n}</span><div className="bar bar-sm"><i className={`g ${k}`} style={{ width: `${v}%`, animationDelay: `${j * 0.08}s` }} /></div><em className="tnum">{v}%</em></div>
        ))}
      </div>
      <div className="sched">
        <div><i style={{ background: 'var(--clay)' }} /><b>Due today</b><span>Reactions · Functional groups</span></div>
        <div><i style={{ background: 'var(--blue)' }} /><b>Tomorrow</b><span>Isomerism</span></div>
        <div><i style={{ background: 'var(--mist)' }} /><b>In 4 days</b><span>Alkanes · Nomenclature</span></div>
      </div>
    </div>
  );
}
