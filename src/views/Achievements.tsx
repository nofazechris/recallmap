'use client';

import { useMemo, useState } from 'react';
import { Link } from '../lib/router';
import Dialog from '../components/Dialog';
import Icon from '../components/Icon';
import Ring from '../components/Ring';
import { useApp } from '../store/store';
import { badgeDefs, badgeProgress, level, levelProgress, recommendedTopic, type BadgeDef } from '../store/selectors';
import type { AppState } from '../store/types';
import './Achievements.css';

type Filter = 'all' | 'earned' | 'locked';

const groups: { label: string; blurb: string; ids: string[] }[] = [
  { label: 'Consistency', blurb: 'Show up and build the habit.', ids: ['first-steps', 'consistent-learner', 'week-of-focus', 'goal-getter', 'challenge-finisher'] },
  { label: 'Mastery', blurb: 'Prove you actually remember.', ids: ['recall-ready', 'topic-master'] },
  { label: 'Proof', blurb: 'Carry it beyond RecallMap.', ids: ['verified-achievement'] },
];

/** What to do next for each badge — an action, not just a description. */
const howTo = (s: AppState, id: string): { text: string; cta: string; to: string } => {
  const t = recommendedTopic(s);
  const study = t ? `/study/${t.id}` : '/app';
  const quiz = t && t.questions.length ? `/quiz/${t.id}` : t ? `/app/topics/${t.id}?tab=material` : '/app';
  switch (id) {
    case 'first-steps': return { text: 'Finish one study session — even a few cards counts.', cta: 'Start a session', to: study };
    case 'consistent-learner': return { text: 'Study on three separate days within a week.', cta: 'Study today', to: study };
    case 'week-of-focus': return { text: 'Keep your streak alive for seven days in a row.', cta: 'Study today', to: study };
    case 'goal-getter': return { text: 'Hit your daily recall goal on five different days.', cta: 'Work on today’s goal', to: study };
    case 'challenge-finisher': return { text: 'Complete the 7-Day Focus challenge with your daily goal.', cta: 'See the challenge', to: '/app/community' };
    case 'recall-ready': return { text: 'Score 80% or more on two quizzes in the same topic.', cta: 'Take a quiz', to: quiz };
    case 'topic-master': return { text: 'Score 90% or more on two quizzes in the same topic.', cta: 'Take a quiz', to: quiz };
    case 'verified-achievement': return { text: 'Verify an earned credential on Arc from your profile.', cta: 'Open my profile', to: '/app/profile' };
    default: return { text: '', cta: 'Open', to: '/app' };
  }
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function Achievements() {
  const s = useApp();
  const defs = badgeDefs(s);
  const [f, setF] = useState<Filter>('all');
  const [open, setOpen] = useState<BadgeDef | null>(null);

  const earnedCount = defs.filter((b) => s.earned[b.id]).length;
  const lvl = level(s.user.xp);
  const toNext = 200 - (s.user.xp % 200);

  // The unearned badge you're closest to — featured at the top.
  const next = useMemo(() => defs
    .filter((b) => !s.earned[b.id])
    .map((b, i) => ({ b, p: badgeProgress(s, b.id), i }))
    .sort((a, z) => z.p.pct - a.p.pct || a.i - z.i)[0], [s]);

  const show = (b: BadgeDef) => (f === 'all' ? true : f === 'earned' ? !!s.earned[b.id] : !s.earned[b.id]);
  const visible = groups.map((g) => ({ ...g, badges: g.ids.map((id) => defs.find((b) => b.id === id)!).filter(show) })).filter((g) => g.badges.length);

  return (
    <div className="page ach-page">
      {/* ───── progress banner ───── */}
      <header className="ach-hero">
        <div className="bg" aria-hidden="true" />
        <div className="lv">
          <div className="eyebrow">Achievements</div>
          <h1 className="h1">Every badge, <span className="grad-text">earned honestly.</span></h1>
          <div className="xp">
            <div className="row"><b>Level {lvl}</b><span className="tnum">{s.user.xp.toLocaleString()} XP</span></div>
            <div className="bar"><i style={{ width: `${Math.round(levelProgress(s.user.xp) * 100)}%` }} /></div>
            <small className="tnum">{toNext} XP to level {lvl + 1}</small>
          </div>
        </div>

        <div className="stats">
          <div className="ringbox">
            <Ring value={Math.round((earnedCount / defs.length) * 100)} size={78} stroke={3.6} id="ach"><span className="tnum">{earnedCount}/{defs.length}</span></Ring>
            <span>badges<br /><b>earned</b></span>
          </div>
          <div className="mini"><Icon name="flame" size={34} /><div><b className="tnum">{s.user.streak}</b><small>day streak</small></div></div>
        </div>
      </header>

      {next && (
        <section className="nextup-card" aria-label="Next badge">
          <span className={`bico ${next.b.tone}`}><Icon name={next.b.icon} size={30} stroke={2.2} /></span>
          <div className="tx">
            <small>Next up</small>
            <h2>{next.b.name}</h2>
            <p>{howTo(s, next.b.id).text}</p>
            <div className="prog"><div className="bar bar-sm"><i style={{ width: `${next.p.pct}%` }} /></div><span className="tnum">{next.p.meta}</span></div>
          </div>
          <Link to={howTo(s, next.b.id).to} className="btn btn-primary">{howTo(s, next.b.id).cta}<Icon name="arrow" size={17} stroke={2.5} /></Link>
        </section>
      )}

      <div className="ach-tools">
        <div className="seg seg-grad" role="tablist" aria-label="Filter">
          {([['all', 'All'], ['earned', 'Earned'], ['locked', 'In progress']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
        <small className="muted">Transparent criteria — a badge only unlocks when you actually meet it.</small>
      </div>

      {visible.map((g) => (
        <section key={g.label} className="ach-group">
          <header><h2>{g.label}</h2><span>{g.blurb}</span><em className="tnum">{g.badges.filter((b) => s.earned[b.id]).length}/{g.ids.length}</em></header>
          <div className="bgrid">
            {g.badges.map((b) => {
              const got = s.earned[b.id];
              const verified = !!got?.verified;
              const p = badgeProgress(s, b.id);
              return (
                <button key={b.id} className={`bcard${got ? '' : ' locked'}`} onClick={() => setOpen(b)} aria-label={`${b.name}, ${got ? 'earned' : 'in progress'}`}>
                  <div className="bt">
                    <span className={`bico ${got ? b.tone : 'off'}`}><Icon name={b.icon} size={26} stroke={got ? 2.3 : 2.1} style={got ? undefined : { opacity: 0.5 }} /></span>
                    <span className={`pill ${got ? (verified ? 'pill-blue' : 'pill-lime') : 'pill-dim'}`}>{got ? (verified ? 'Verified' : 'Earned') : 'In progress'}</span>
                  </div>
                  <h3>{b.name}</h3>
                  <p>{b.desc}</p>
                  {got ? <small>Earned {fmtDate(got.date)}</small> : (
                    <div><div className="bar bar-sm"><i style={{ width: `${p.pct}%` }} /></div><small>{p.meta}</small></div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {visible.length === 0 && <div className="empty-card"><b>Nothing here yet</b><p>Keep studying — your first badge is one session away.</p></div>}

      {open && <Detail b={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Detail({ b, onClose }: { b: BadgeDef; onClose: () => void }) {
  const s = useApp();
  const got = s.earned[b.id];
  const p = badgeProgress(s, b.id);
  const how = howTo(s, b.id);
  const verified = !!got?.verified;
  return (
    <Dialog title={b.name} sub={b.desc} onClose={onClose}>
      <div className="bdetail">
        <span className={`bico big ${got ? b.tone : 'off'}`}><Icon name={b.icon} size={42} stroke={2.2} style={got ? undefined : { opacity: 0.5 }} /></span>
        <div className="dl">
          <span className={`pill ${got ? (verified ? 'pill-blue' : 'pill-lime') : 'pill-dim'}`}>{got ? (verified ? 'Earned · Verified' : 'Earned') : 'Not yet earned'}</span>
          {got ? <p className="tnum">Earned {fmtDate(got.date)}.</p> : (
            <>
              <div className="bar" style={{ margin: '12px 0 6px' }}><i style={{ width: `${p.pct}%` }} /></div>
              <p className="tnum">{p.meta}</p>
            </>
          )}
        </div>
      </div>
      {!got && <div className="howto"><b>How to earn it</b><p>{how.text}</p></div>}
      {got && b.id === 'recall-ready' && !got.verified && <div className="howto"><b>Make it provable</b><p>This badge has a credential ready — verify it on Arc from your profile.</p></div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
        {!got && <Link to={how.to} className="btn btn-primary btn-sm" onClick={onClose}>{how.cta}<Icon name="arrow" size={15} stroke={2.5} /></Link>}
        {got && b.id === 'recall-ready' && <Link to="/app/profile" className="btn btn-primary btn-sm" onClick={onClose}>View credential</Link>}
      </div>
    </Dialog>
  );
}
